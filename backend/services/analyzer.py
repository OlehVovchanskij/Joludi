from __future__ import annotations

import asyncio
import json
import math
import os
import tempfile
import urllib.parse
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from pymavlink import mavutil

from services.coordinates import GeoPoint, haversine_distance_m, wgs84_to_enu


def _first_present_value(data: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
    return None


def _numeric_or_none(value: Any) -> float | None:
    if value is None:
        return None
    try:
        numeric_value = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(numeric_value):
        return None
    return numeric_value


def _normalize_timestamp_seconds(data: dict[str, Any]) -> float | None:
    timestamp_value = _first_present_value(
        data,
        ["TimeUS", "time_usec", "TimeMS", "time_boot_ms",
            "time_ms", "TimeS", "time_s"],
    )
    numeric_timestamp = _numeric_or_none(timestamp_value)
    if numeric_timestamp is None:
        return None

    if numeric_timestamp >= 1_000_000_000_000:
        return numeric_timestamp / 1_000_000.0
    if numeric_timestamp >= 1_000_000_000:
        return numeric_timestamp / 1_000.0
    if numeric_timestamp >= 1_000_000:
        return numeric_timestamp / 1_000_000.0
    return numeric_timestamp


def _has_gps_fields(data: dict[str, Any]) -> bool:
    return any(key in data for key in ["Lat", "Lng", "Lon", "Alt", "lat", "lon", "alt"])


def _has_imu_fields(data: dict[str, Any]) -> bool:
    return any(
        key in data
        for key in [
            "AccX",
            "AccY",
            "AccZ",
            "xacc",
            "yacc",
            "zacc",
            "ax",
            "ay",
            "az",
        ]
    )


def _extract_gps_record(message_type: str, data: dict[str, Any]) -> dict[str, Any] | None:
    latitude = _numeric_or_none(_first_present_value(data, ["Lat", "lat"]))
    longitude = _numeric_or_none(
        _first_present_value(data, ["Lng", "Lon", "lon"]))
    altitude_m = _numeric_or_none(_first_present_value(data, ["Alt", "alt"]))

    if latitude is None or longitude is None or altitude_m is None:
        return None

    horizontal_velocity = _numeric_or_none(
        _first_present_value(data, ["Spd", "Speed", "groundspeed"]))
    velocity_north = _numeric_or_none(
        _first_present_value(data, ["VelN", "vn"]))
    velocity_east = _numeric_or_none(
        _first_present_value(data, ["VelE", "ve"]))
    velocity_down = _numeric_or_none(
        _first_present_value(data, ["VelD", "vd"]))
    timestamp_s = _normalize_timestamp_seconds(data)

    if horizontal_velocity is None and velocity_north is not None and velocity_east is not None:
        horizontal_velocity = float(np.hypot(velocity_north, velocity_east))

    return {
        "message_type": message_type,
        "timestamp_s": timestamp_s,
        "latitude_deg": latitude,
        "longitude_deg": longitude,
        "altitude_m": altitude_m,
        "horizontal_velocity_mps": horizontal_velocity,
        "velocity_north_mps": velocity_north,
        "velocity_east_mps": velocity_east,
        "velocity_down_mps": velocity_down,
    }


def _extract_imu_record(message_type: str, data: dict[str, Any]) -> dict[str, Any] | None:
    acceleration_x = _numeric_or_none(
        _first_present_value(data, ["AccX", "xacc", "ax"]))
    acceleration_y = _numeric_or_none(
        _first_present_value(data, ["AccY", "yacc", "ay"]))
    acceleration_z = _numeric_or_none(
        _first_present_value(data, ["AccZ", "zacc", "az"]))
    timestamp_s = _normalize_timestamp_seconds(data)

    if acceleration_x is None or acceleration_y is None or acceleration_z is None:
        return None

    return {
        "message_type": message_type,
        "timestamp_s": timestamp_s,
        "acceleration_x_mps2": acceleration_x,
        "acceleration_y_mps2": acceleration_y,
        "acceleration_z_mps2": acceleration_z,
        "acceleration_magnitude_mps2": float(np.linalg.norm([acceleration_x, acceleration_y, acceleration_z])),
    }


def _sampling_frequency_hz(timestamp_series: pd.Series) -> float | None:
    valid_timestamps = pd.to_numeric(
        timestamp_series, errors="coerce").dropna().sort_values()
    if len(valid_timestamps) < 2:
        return None

    deltas = valid_timestamps.diff().dropna()
    positive_deltas = deltas[deltas > 0]
    if positive_deltas.empty:
        return None

    median_delta = float(positive_deltas.median())
    if median_delta <= 0:
        return None
    return 1.0 / median_delta


def _integrate_trapezoidal(times_s: pd.Series, values: pd.Series, initial_value: float = 0.0) -> np.ndarray:
    valid_frame = pd.DataFrame(
        {"time_s": times_s, "value": values}).dropna().sort_values("time_s")
    if valid_frame.empty:
        return np.array([], dtype=float)

    integrated_values = [float(initial_value)]
    previous_time = float(valid_frame.iloc[0]["time_s"])
    previous_value = float(valid_frame.iloc[0]["value"])

    for _, row in valid_frame.iloc[1:].iterrows():
        current_time = float(row["time_s"])
        current_value = float(row["value"])
        delta_time = current_time - previous_time
        if delta_time < 0:
            continue
        delta_value = 0.5 * (previous_value + current_value) * delta_time
        integrated_values.append(integrated_values[-1] + delta_value)
        previous_time = current_time
        previous_value = current_value

    return np.asarray(integrated_values, dtype=float)


@dataclass
class ParsedLogData:
    filename: str | None
    raw_messages: pd.DataFrame
    gps: pd.DataFrame
    imu: pd.DataFrame

    def to_api_payload(self) -> dict[str, Any]:
        return {
            "filename": self.filename,
            "message_count": int(len(self.raw_messages)),
            "gps_samples": self.gps.to_dict(orient="records"),
            "imu_samples": self.imu.to_dict(orient="records"),
            "sampling_hz": {
                "gps": _sampling_frequency_hz(self.gps["timestamp_s"]) if not self.gps.empty else None,
                "imu": _sampling_frequency_hz(self.imu["timestamp_s"]) if not self.imu.empty else None,
            },
            "units": {
                "gps": {
                    "latitude_deg": "deg",
                    "longitude_deg": "deg",
                    "altitude_m": "m",
                    "horizontal_velocity_mps": "m/s",
                },
                "imu": {
                    "acceleration_x_mps2": "m/s^2",
                    "acceleration_y_mps2": "m/s^2",
                    "acceleration_z_mps2": "m/s^2",
                },
            },
        }


def parse_log_bytes(file_bytes: bytes, filename: str | None = None) -> ParsedLogData:
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename or "flight.bin").suffix or ".bin") as temp_file:
        temp_file.write(file_bytes)
        temp_path = Path(temp_file.name)

    try:
        mavlog = mavutil.mavlink_connection(
            str(temp_path), dialect="ardupilotmega", robust_parsing=True)

        raw_records: list[dict[str, Any]] = []
        gps_records: list[dict[str, Any]] = []
        imu_records: list[dict[str, Any]] = []

        while True:
            message = mavlog.recv_match(blocking=False)
            if message is None:
                break

            message_type = message.get_type()
            if message_type in {"BAD_DATA", "UNKNOWN"}:
                continue

            message_data = message.to_dict()
            timestamp_s = _normalize_timestamp_seconds(message_data)
            raw_records.append(
                {
                    "message_type": message_type,
                    "timestamp_s": timestamp_s,
                    **{key: value for key, value in message_data.items() if key != "mavpackettype"},
                }
            )

            if _has_gps_fields(message_data):
                gps_record = _extract_gps_record(message_type, message_data)
                if gps_record is not None:
                    gps_records.append(gps_record)

            if _has_imu_fields(message_data):
                imu_record = _extract_imu_record(message_type, message_data)
                if imu_record is not None:
                    imu_records.append(imu_record)

        raw_frame = pd.DataFrame(raw_records)
        gps_frame = pd.DataFrame(gps_records)
        imu_frame = pd.DataFrame(imu_records)

        for frame in [raw_frame, gps_frame, imu_frame]:
            if not frame.empty and "timestamp_s" in frame.columns:
                frame.sort_values(
                    "timestamp_s", inplace=True, ignore_index=True)

        return ParsedLogData(filename=filename, raw_messages=raw_frame, gps=gps_frame, imu=imu_frame)
    finally:
        temp_path.unlink(missing_ok=True)


def _safe_series(frame: pd.DataFrame, column_name: str) -> pd.Series:
    if frame.empty or column_name not in frame.columns:
        return pd.Series(dtype=float)
    return pd.to_numeric(frame[column_name], errors="coerce")


def _build_plotly_figure(trajectory_frame: pd.DataFrame) -> dict[str, Any]:
    if trajectory_frame.empty:
        return go.Figure().to_dict()

    figure = go.Figure()
    figure.add_trace(
        go.Scatter3d(
            x=trajectory_frame["east_m"],
            y=trajectory_frame["north_m"],
            z=trajectory_frame["up_m"],
            mode="lines+markers",
            marker={
                "size": 4,
                "color": trajectory_frame["speed_mps"],
                "colorscale": "Viridis",
                "showscale": True,
                "colorbar": {"title": "Speed, m/s"},
            },
            line={"width": 4, "color": "rgba(50, 50, 50, 0.5)"},
            name="Trajectory",
        )
    )
    figure.update_layout(
        title="Drone trajectory in ENU coordinates",
        scene={
            "xaxis_title": "East, m",
            "yaxis_title": "North, m",
            "zaxis_title": "Up, m",
        },
        margin={"l": 0, "r": 0, "t": 40, "b": 0},
    )
    return json.loads(figure.to_json())


def _encode_polyline(points: list[tuple[float, float]]) -> str:
    """Encode points with Google's polyline algorithm format."""

    def _encode_value(value: int) -> str:
        encoded_chunk = ""
        value = ~(value << 1) if value < 0 else (value << 1)
        while value >= 0x20:
            encoded_chunk += chr((0x20 | (value & 0x1F)) + 63)
            value >>= 5
        encoded_chunk += chr(value + 63)
        return encoded_chunk

    result = ""
    previous_latitude = 0
    previous_longitude = 0

    for latitude, longitude in points:
        latitude_scaled = int(round(latitude * 1e5))
        longitude_scaled = int(round(longitude * 1e5))

        delta_latitude = latitude_scaled - previous_latitude
        delta_longitude = longitude_scaled - previous_longitude

        result += _encode_value(delta_latitude)
        result += _encode_value(delta_longitude)

        previous_latitude = latitude_scaled
        previous_longitude = longitude_scaled

    return result


def _downsample_points(points: list[dict[str, float]], max_points: int = 180) -> list[dict[str, float]]:
    if len(points) <= max_points:
        return points

    stride = max(1, len(points) // max_points)
    sampled = points[::stride]
    if sampled[-1] != points[-1]:
        sampled.append(points[-1])
    return sampled


def _build_google_maps_payload(trajectory_frame: pd.DataFrame) -> dict[str, Any]:
    if trajectory_frame.empty:
        return {
            "points": [],
            "encoded_polyline": "",
            "static_map_url": None,
            "api_key_configured": bool(os.getenv("GOOGLE_MAPS_API_KEY")),
        }

    points: list[dict[str, float]] = []
    for _, row in trajectory_frame.iterrows():
        points.append(
            {
                "lat": float(row["latitude_deg"]),
                "lng": float(row["longitude_deg"]),
                "altitude_m": float(row["altitude_m"]),
                "timestamp_s": float(row["timestamp_s"]),
                "speed_mps": float(row["speed_mps"]),
            }
        )

    points_for_map = _downsample_points(points)
    polyline_points = [(point["lat"], point["lng"])
                       for point in points_for_map]
    encoded_polyline = _encode_polyline(polyline_points)

    first_point = points_for_map[0]
    last_point = points_for_map[-1]

    static_map_params = {
        "size": "1200x700",
        "maptype": "satellite",
        "path": f"color:0x00ff00ff|weight:4|enc:{encoded_polyline}",
        "markers": [
            f"color:green|label:S|{first_point['lat']},{first_point['lng']}",
            f"color:red|label:E|{last_point['lat']},{last_point['lng']}",
        ],
    }

    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if api_key:
        static_map_params["key"] = api_key

    query_parts: list[str] = []
    for key, value in static_map_params.items():
        if isinstance(value, list):
            for list_item in value:
                query_parts.append(
                    f"{key}={urllib.parse.quote_plus(str(list_item))}")
        else:
            query_parts.append(f"{key}={urllib.parse.quote_plus(str(value))}")

    static_map_url = "https://maps.googleapis.com/maps/api/staticmap?" + \
        "&".join(query_parts)

    return {
        "center": {
            "lat": float(points_for_map[len(points_for_map) // 2]["lat"]),
            "lng": float(points_for_map[len(points_for_map) // 2]["lng"]),
        },
        "start": {"lat": float(first_point["lat"]), "lng": float(first_point["lng"])},
        "end": {"lat": float(last_point["lat"]), "lng": float(last_point["lng"])},
        "points": points_for_map,
        "encoded_polyline": encoded_polyline,
        "static_map_url": static_map_url,
        "api_key_configured": bool(api_key),
    }


def analyze_log_bytes(file_bytes: bytes, filename: str | None = None) -> dict[str, Any]:
    parsed_log = parse_log_bytes(file_bytes, filename=filename)
    gps_frame = parsed_log.gps.copy()
    imu_frame = parsed_log.imu.copy()

    if gps_frame.empty:
        return {
            "filename": filename,
            "message_count": int(len(parsed_log.raw_messages)),
            "metrics": {
                "error": "No GPS samples found in the log file.",
            },
            "trajectory_enu": [],
            "plotly_figure": go.Figure().to_dict(),
            "parsed": parsed_log.to_api_payload(),
        }

    gps_frame["timestamp_s"] = pd.to_numeric(
        gps_frame["timestamp_s"], errors="coerce")
    gps_frame["altitude_m"] = pd.to_numeric(
        gps_frame["altitude_m"], errors="coerce")
    gps_frame["latitude_deg"] = pd.to_numeric(
        gps_frame["latitude_deg"], errors="coerce")
    gps_frame["longitude_deg"] = pd.to_numeric(
        gps_frame["longitude_deg"], errors="coerce")

    gps_frame = gps_frame.dropna(subset=["timestamp_s", "latitude_deg", "longitude_deg", "altitude_m"]).sort_values(
        "timestamp_s",
        ignore_index=True,
    )

    origin_row = gps_frame.iloc[0]
    origin_point = GeoPoint(
        latitude=float(origin_row["latitude_deg"]),
        longitude=float(origin_row["longitude_deg"]),
        altitude_m=float(origin_row["altitude_m"]),
    )

    trajectory_records: list[dict[str, Any]] = []
    segment_distances_m: list[float] = []
    horizontal_speeds_mps: list[float] = []
    vertical_speeds_mps: list[float] = []

    previous_row = None
    for _, row in gps_frame.iterrows():
        east_m, north_m, up_m = wgs84_to_enu(
            latitude=float(row["latitude_deg"]),
            longitude=float(row["longitude_deg"]),
            altitude_m=float(row["altitude_m"]),
            origin=origin_point,
        )

        speed_mps = _numeric_or_none(row.get("horizontal_velocity_mps"))
        if speed_mps is None and previous_row is not None:
            delta_time = float(row["timestamp_s"]) - \
                float(previous_row["timestamp_s"])
            if delta_time > 0:
                segment_distance_m = haversine_distance_m(
                    float(previous_row["latitude_deg"]),
                    float(previous_row["longitude_deg"]),
                    float(row["latitude_deg"]),
                    float(row["longitude_deg"]),
                )
                speed_mps = segment_distance_m / delta_time
            else:
                speed_mps = 0.0
        elif speed_mps is None:
            speed_mps = 0.0

        if previous_row is not None:
            delta_time = float(row["timestamp_s"]) - \
                float(previous_row["timestamp_s"])
            if delta_time > 0:
                segment_distance_m = haversine_distance_m(
                    float(previous_row["latitude_deg"]),
                    float(previous_row["longitude_deg"]),
                    float(row["latitude_deg"]),
                    float(row["longitude_deg"]),
                )
                segment_distances_m.append(segment_distance_m)
                horizontal_speeds_mps.append(segment_distance_m / delta_time)
                vertical_speeds_mps.append(
                    (float(row["altitude_m"]) - float(previous_row["altitude_m"])) / delta_time)

        trajectory_records.append(
            {
                "timestamp_s": float(row["timestamp_s"]),
                "latitude_deg": float(row["latitude_deg"]),
                "longitude_deg": float(row["longitude_deg"]),
                "altitude_m": float(row["altitude_m"]),
                "east_m": east_m,
                "north_m": north_m,
                "up_m": up_m,
                "speed_mps": float(speed_mps),
                "color_time_s": float(row["timestamp_s"]),
            }
        )
        previous_row = row

    trajectory_frame = pd.DataFrame(trajectory_records)

    imu_magnitude = _safe_series(imu_frame, "acceleration_magnitude_mps2")
    imu_timestamps = _safe_series(imu_frame, "timestamp_s")
    estimated_velocity_from_acceleration = _integrate_trapezoidal(
        imu_timestamps, imu_magnitude, initial_value=0.0)

    altitude_gain_m = float(
        gps_frame["altitude_m"].max() - gps_frame.iloc[0]["altitude_m"])
    total_distance_m = float(np.sum(segment_distances_m)
                             ) if segment_distances_m else 0.0
    duration_s = float(
        gps_frame.iloc[-1]["timestamp_s"] - gps_frame.iloc[0]["timestamp_s"])

    metrics = {
        "duration_s": duration_s,
        "total_distance_m": total_distance_m,
        "max_horizontal_speed_mps": float(max(horizontal_speeds_mps)) if horizontal_speeds_mps else float(trajectory_frame["speed_mps"].max()),
        "max_vertical_speed_mps": float(max((abs(value) for value in vertical_speeds_mps), default=0.0)),
        "max_acceleration_mps2": float(imu_magnitude.max()) if not imu_magnitude.empty else 0.0,
        "max_altitude_gain_m": altitude_gain_m,
        "max_estimated_speed_from_acceleration_mps": float(estimated_velocity_from_acceleration.max()) if estimated_velocity_from_acceleration.size else 0.0,
    }

    return {
        "filename": filename,
        "message_count": int(len(parsed_log.raw_messages)),
        "parsed": parsed_log.to_api_payload(),
        "metrics": metrics,
        "trajectory_enu": trajectory_frame.to_dict(orient="records"),
        "plotly_figure": _build_plotly_figure(trajectory_frame),
        "google_maps": _build_google_maps_payload(trajectory_frame),
        "acceleration_profile": estimated_velocity_from_acceleration.tolist(),
    }


async def parse_log_bytes_async(file_bytes: bytes, filename: str | None = None) -> ParsedLogData:
    return await asyncio.to_thread(parse_log_bytes, file_bytes, filename)


async def analyze_log_bytes_async(file_bytes: bytes, filename: str | None = None) -> dict[str, Any]:
    return await asyncio.to_thread(analyze_log_bytes, file_bytes, filename)

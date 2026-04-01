from __future__ import annotations

import asyncio
import json
import math
import os
import struct
import urllib.parse
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
import plotly.graph_objects as go

from services.coordinates import GeoPoint, haversine_distance_m, wgs84_to_enu


MAGIC_HEADER_BYTE_1 = 0xA3
MAGIC_HEADER_BYTE_2 = 0x95
FMT_MESSAGE_TYPE = 0x80

FIELD_SPECS: dict[str, tuple[str, int]] = {
    "b": ("b", 1),
    "B": ("B", 1),
    "h": ("h", 2),
    "H": ("H", 2),
    "i": ("i", 4),
    "I": ("I", 4),
    "q": ("q", 8),
    "Q": ("Q", 8),
    "f": ("f", 4),
    "d": ("d", 8),
    "n": ("4s", 4),
    "N": ("16s", 16),
    "Z": ("64s", 64),
    "L": ("i", 4),
    "e": ("i", 4),
    "E": ("I", 4),
    "c": ("h", 2),
    "C": ("H", 2),
    "M": ("B", 1),
}


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


def _decode_ascii(raw_bytes: bytes) -> str:
    return raw_bytes.decode("ascii", errors="ignore").split("\x00", 1)[0].strip()


@dataclass(frozen=True)
class MessageDefinition:
    type_id: int
    length: int
    name: str
    format_codes: list[str]
    columns: list[str]


def _parse_fmt_definition(buffer: bytes, offset: int) -> tuple[MessageDefinition | None, int]:
    try:
        defined_type_id, total_length = struct.unpack_from(
            "<BB", buffer, offset + 3)
    except struct.error:
        return None, 1

    if total_length <= 3:
        return None, 1

    if offset + total_length > len(buffer):
        return None, 1

    name_raw = buffer[offset + 5: offset + 9]
    format_raw = buffer[offset + 9: offset + 25]
    columns_raw = buffer[offset + 25: offset + 89]

    message_name = _decode_ascii(name_raw)
    format_string = _decode_ascii(format_raw)
    columns_text = _decode_ascii(columns_raw)

    if not message_name or not format_string:
        return None, max(total_length, 1)

    format_codes = list(format_string)
    if any(code not in FIELD_SPECS for code in format_codes):
        return None, max(total_length, 1)

    expected_length = 3 + sum(FIELD_SPECS[code][1] for code in format_codes)
    if expected_length > total_length:
        return None, max(total_length, 1)

    columns = [column.strip()
               for column in columns_text.split(",") if column.strip()]

    definition = MessageDefinition(
        type_id=defined_type_id,
        length=total_length,
        name=message_name,
        format_codes=format_codes,
        columns=columns,
    )
    return definition, total_length


def _apply_unit_conversion(field_code: str, column_name: str, value: Any) -> Any:
    if isinstance(value, bytes):
        return _decode_ascii(value)

    numeric_value = _numeric_or_none(value)
    if numeric_value is None:
        return value

    if field_code == "L":
        numeric_value /= 1e7
    elif field_code in {"c", "C", "e", "E"}:
        numeric_value /= 1e2

    if column_name == "TimeUS":
        numeric_value /= 1e6

    return numeric_value


def _decode_message_row(buffer: bytes, offset: int, definition: MessageDefinition) -> dict[str, Any] | None:
    row: dict[str, Any] = {
        "_message_type_id": definition.type_id,
        "_message_name": definition.name,
    }

    cursor = offset + 3
    for index, field_code in enumerate(definition.format_codes):
        column_name = (
            definition.columns[index]
            if index < len(definition.columns) and definition.columns[index]
            else f"field_{index}"
        )

        struct_token, field_size = FIELD_SPECS[field_code]

        try:
            (raw_value,) = struct.unpack_from(
                f"<{struct_token}", buffer, cursor)
        except struct.error:
            return None

        row[column_name] = _apply_unit_conversion(
            field_code, column_name, raw_value)
        cursor += field_size

    return row


def _parse_dataflash_messages(
    file_bytes: bytes,
) -> tuple[dict[str, list[dict[str, Any]]], dict[int, MessageDefinition], list[dict[str, Any]]]:
    rows_by_message: dict[str, list[dict[str, Any]]] = defaultdict(list)
    definitions: dict[int, MessageDefinition] = {}
    raw_messages: list[dict[str, Any]] = []

    index = 0
    data_length = len(file_bytes)

    while index <= data_length - 3:
        if (
            file_bytes[index] != MAGIC_HEADER_BYTE_1
            or file_bytes[index + 1] != MAGIC_HEADER_BYTE_2
        ):
            index += 1
            continue

        message_type_id = file_bytes[index + 2]

        if message_type_id == FMT_MESSAGE_TYPE:
            definition, frame_length = _parse_fmt_definition(file_bytes, index)
            if definition is not None:
                definitions[definition.type_id] = definition
                raw_messages.append(
                    {
                        "message_type": "FMT",
                        "timestamp_s": None,
                        "defined_type_id": definition.type_id,
                        "name": definition.name,
                        "length": definition.length,
                    }
                )
                index += max(frame_length, 1)
                continue

            index += 1
            continue

        definition = definitions.get(message_type_id)
        if definition is None:
            index += 1
            continue

        if definition.length <= 3 or index + definition.length > data_length:
            index += 1
            continue

        row = _decode_message_row(file_bytes, index, definition)
        if row is None:
            index += 1
            continue

        rows_by_message[definition.name].append(row)
        raw_messages.append(
            {
                "message_type": definition.name,
                "timestamp_s": _numeric_or_none(row.get("TimeUS")),
            }
        )
        index += definition.length

    return rows_by_message, definitions, raw_messages


def _frame_from_rows(rows: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(rows)
    if not frame.empty and "TimeUS" in frame.columns:
        frame["TimeUS"] = pd.to_numeric(frame["TimeUS"], errors="coerce")
        frame.sort_values("TimeUS", inplace=True, ignore_index=True)
    return frame


def _first_existing_column(frame: pd.DataFrame, names: list[str]) -> str | None:
    for name in names:
        if name in frame.columns:
            return name
    return None


def _select_primary_frame(
    frames_by_name: dict[str, pd.DataFrame],
    preferred_names: list[str],
    fallback_prefixes: list[str],
) -> pd.DataFrame:
    for name in preferred_names:
        frame = frames_by_name.get(name)
        if frame is not None and not frame.empty:
            return frame.copy()
    return _merge_frames(frames_by_name, prefixes=fallback_prefixes)


def _scale_if_out_of_range(series: pd.Series, threshold: float, factor: float) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    if numeric.dropna().empty:
        return numeric
    median_abs = float(numeric.dropna().abs().median())
    if median_abs > threshold:
        return numeric / factor
    return numeric


def _unwrap_altitude_series(series: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    if numeric.dropna().empty:
        return numeric

    neg_ratio = float((numeric < -1).mean())
    if neg_ratio < 0.6:
        return numeric

    wrap_m = 655.36
    candidate = numeric.copy()
    candidate = candidate.mask(candidate < 0, candidate + wrap_m)

    candidate_median = float(candidate.dropna().median())
    if candidate_median < 0 or candidate_median > 5000:
        return numeric

    if float((candidate < 0).mean()) > 0.1:
        return numeric

    return candidate


def _normalize_gps_frame(gps_frame: pd.DataFrame) -> pd.DataFrame:
    if gps_frame.empty:
        return gps_frame

    frame = gps_frame.copy()
    lat_col = _first_existing_column(frame, ["Lat", "latitude_deg", "lat"])
    lon_col = _first_existing_column(frame, ["Lng", "Lon", "longitude_deg", "lon"])
    alt_col = _first_existing_column(frame, ["Alt", "altitude_m", "alt"])
    spd_col = _first_existing_column(frame, ["Spd", "Speed", "groundspeed"])
    vz_col = _first_existing_column(frame, ["VZ", "VelD", "velocity_down_mps"])

    if lat_col:
        frame[lat_col] = _scale_if_out_of_range(frame[lat_col], 180.0, 1e7)
    if lon_col:
        frame[lon_col] = _scale_if_out_of_range(frame[lon_col], 180.0, 1e7)
    if alt_col:
        frame[alt_col] = _scale_if_out_of_range(frame[alt_col], 10_000.0, 100.0)
        frame[alt_col] = _unwrap_altitude_series(frame[alt_col])
    if spd_col:
        frame[spd_col] = _scale_if_out_of_range(frame[spd_col], 200.0, 100.0)
    if vz_col:
        frame[vz_col] = _scale_if_out_of_range(frame[vz_col], 200.0, 100.0)

    lat_series = pd.to_numeric(frame[lat_col], errors="coerce") if lat_col else pd.Series(dtype=float)
    lon_series = pd.to_numeric(frame[lon_col], errors="coerce") if lon_col else pd.Series(dtype=float)

    if not lat_series.empty and not lon_series.empty:
        valid_mask = lat_series.between(-90, 90) & lon_series.between(-180, 180)
        filtered = frame.loc[valid_mask].copy()

        status_col = _first_existing_column(frame, ["Status", "Fix", "FixType"])
        if status_col and not filtered.empty:
            status_series = pd.to_numeric(filtered[status_col], errors="coerce")
            status_filtered = filtered.loc[status_series >= 3]
            if not status_filtered.empty:
                filtered = status_filtered

        sats_col = _first_existing_column(frame, ["NSats", "Sats", "Sat"])
        if sats_col and not filtered.empty:
            sats_series = pd.to_numeric(filtered[sats_col], errors="coerce")
            sats_filtered = filtered.loc[sats_series >= 4]
            if not sats_filtered.empty:
                filtered = sats_filtered

        if not filtered.empty:
            frame = filtered

    return frame


def _robust_speed_limit(speed_values: np.ndarray, max_allowed: float) -> float:
    if speed_values.size == 0:
        return max_allowed

    median = float(np.median(speed_values))
    mad = float(np.median(np.abs(speed_values - median)))
    if mad <= 0:
        return max_allowed
    return min(max_allowed, median + 6.0 * mad)


def _merge_frames(
    frames_by_name: dict[str, pd.DataFrame],
    names: list[str] | None = None,
    prefixes: list[str] | None = None,
) -> pd.DataFrame:
    selected_frames: list[pd.DataFrame] = []

    for message_name, frame in frames_by_name.items():
        if frame.empty:
            continue

        include = False
        if names and message_name in names:
            include = True
        if prefixes and any(message_name.startswith(prefix) for prefix in prefixes):
            include = True

        if include:
            selected_frames.append(frame.copy())

    if not selected_frames:
        return pd.DataFrame()

    merged_frame = pd.concat(selected_frames, ignore_index=True)
    if "TimeUS" in merged_frame.columns:
        merged_frame["TimeUS"] = pd.to_numeric(
            merged_frame["TimeUS"], errors="coerce")
        merged_frame.sort_values("TimeUS", inplace=True, ignore_index=True)
    return merged_frame


def _sampling_frequency_hz(time_series: pd.Series) -> float | None:
    time_values = pd.to_numeric(
        time_series, errors="coerce").dropna().to_numpy(dtype=float)
    if len(time_values) < 2:
        return None

    deltas = np.diff(np.sort(time_values))
    deltas = deltas[deltas > 0]
    if deltas.size == 0:
        return None

    mean_delta = float(np.mean(deltas))
    if mean_delta <= 0:
        return None
    return 1.0 / mean_delta


@dataclass
class ParsedLogData:
    filename: str | None
    raw_messages: pd.DataFrame
    gps: pd.DataFrame
    imu: pd.DataFrame
    baro: pd.DataFrame
    message_frames: dict[str, pd.DataFrame] = field(default_factory=dict)
    definitions: dict[int, MessageDefinition] = field(default_factory=dict)

    def to_api_payload(self) -> dict[str, Any]:
        sampling_by_message: dict[str, float | None] = {}
        for message_name, frame in self.message_frames.items():
            if "TimeUS" in frame.columns and not frame.empty:
                sampling_by_message[message_name] = _sampling_frequency_hz(
                    frame["TimeUS"])

        return {
            "filename": self.filename,
            "message_count": int(len(self.raw_messages)),
            "message_types": sorted(self.message_frames.keys()),
            "sampling_hz_by_message": sampling_by_message,
            "gps_samples": self.gps.to_dict(orient="records"),
            "imu_samples": self.imu.to_dict(orient="records"),
            "baro_samples": self.baro.to_dict(orient="records"),
            "units": {
                "TimeUS": "seconds",
                "Lat": "deg",
                "Lng": "deg",
                "Alt": "m",
                "Spd": "m/s",
                "VZ": "m/s",
                "CRt": "m/s",
                "AccX": "m/s^2",
                "AccY": "m/s^2",
                "AccZ": "m/s^2",
                "GyrX": "rad/s",
                "GyrY": "rad/s",
                "GyrZ": "rad/s",
            },
        }


def parse_log_bytes(file_bytes: bytes, filename: str | None = None) -> ParsedLogData:
    rows_by_message, definitions, raw_records = _parse_dataflash_messages(
        file_bytes)
    frames_by_name = {message_name: _frame_from_rows(
        rows) for message_name, rows in rows_by_message.items()}

    gps_frame = _select_primary_frame(frames_by_name, ["GPS", "GPS1"], ["GPS"])
    gps_frame = _normalize_gps_frame(gps_frame)
    imu_frame = _merge_frames(frames_by_name, names=["IMU", "IMU2", "IMU3"])
    baro_frame = _merge_frames(frames_by_name, prefixes=["BARO"])
    raw_frame = _frame_from_rows(raw_records)

    return ParsedLogData(
        filename=filename,
        raw_messages=raw_frame,
        gps=gps_frame,
        imu=imu_frame,
        baro=baro_frame,
        message_frames=frames_by_name,
        definitions=definitions,
    )


def _safe_series(frame: pd.DataFrame, column_names: list[str]) -> pd.Series:
    for column_name in column_names:
        if column_name in frame.columns:
            return pd.to_numeric(frame[column_name], errors="coerce")
    return pd.Series(dtype=float)


def _build_trajectory_frame(gps_frame: pd.DataFrame) -> pd.DataFrame:
    if gps_frame.empty:
        return pd.DataFrame()

    latitude_series = _safe_series(gps_frame, ["Lat", "latitude_deg", "lat"])
    longitude_series = _safe_series(
        gps_frame, ["Lng", "Lon", "longitude_deg", "lon"])
    altitude_series = _safe_series(gps_frame, ["Alt", "altitude_m", "alt"])
    time_series = _safe_series(gps_frame, ["TimeUS", "timestamp_s"])
    gps_speed_series = _safe_series(gps_frame, ["Spd", "Speed", "groundspeed"])

    valid_frame = pd.DataFrame(
        {
            "timestamp_s": time_series,
            "latitude_deg": latitude_series,
            "longitude_deg": longitude_series,
            "altitude_m": altitude_series,
            "gps_speed_mps": gps_speed_series,
        }
    ).dropna(subset=["timestamp_s", "latitude_deg", "longitude_deg", "altitude_m"])

    if valid_frame.empty:
        return pd.DataFrame()

    valid_frame.sort_values("timestamp_s", inplace=True, ignore_index=True)
    origin = GeoPoint(
        latitude=float(valid_frame.iloc[0]["latitude_deg"]),
        longitude=float(valid_frame.iloc[0]["longitude_deg"]),
        altitude_m=float(valid_frame.iloc[0]["altitude_m"]),
    )

    max_allowed_speed = float(os.getenv("MAX_GPS_SPEED_MPS", "120"))
    segment_speeds: list[float] = []
    previous_row: pd.Series | None = None

    for _, row in valid_frame.iterrows():
        if previous_row is None:
            previous_row = row
            continue

        delta_time = float(row["timestamp_s"] - previous_row["timestamp_s"])
        if delta_time <= 0:
            continue

        segment_distance = haversine_distance_m(
            float(previous_row["latitude_deg"]),
            float(previous_row["longitude_deg"]),
            float(row["latitude_deg"]),
            float(row["longitude_deg"]),
        )
        segment_speeds.append(segment_distance / delta_time)
        previous_row = row

    speed_limit = _robust_speed_limit(np.asarray(segment_speeds, dtype=float), max_allowed_speed)

    records: list[dict[str, Any]] = []
    previous_row = None
    for _, row in valid_frame.iterrows():
        segment_speed = None
        if previous_row is not None:
            delta_time = float(row["timestamp_s"] - previous_row["timestamp_s"])
            if delta_time <= 0:
                continue

            segment_distance = haversine_distance_m(
                float(previous_row["latitude_deg"]),
                float(previous_row["longitude_deg"]),
                float(row["latitude_deg"]),
                float(row["longitude_deg"]),
            )
            segment_speed = segment_distance / delta_time
            if segment_speed > speed_limit:
                continue

        east_m, north_m, up_m = wgs84_to_enu(
            latitude=float(row["latitude_deg"]),
            longitude=float(row["longitude_deg"]),
            altitude_m=float(row["altitude_m"]),
            origin=origin,
        )
        relative_altitude_m = float(row["altitude_m"]) - origin.altitude_m

        speed_mps = _numeric_or_none(row.get("gps_speed_mps"))
        if speed_mps is None:
            speed_mps = segment_speed if segment_speed is not None else 0.0

        records.append(
            {
                "timestamp_s": float(row["timestamp_s"]),
                "latitude_deg": float(row["latitude_deg"]),
                "longitude_deg": float(row["longitude_deg"]),
                "altitude_m": float(row["altitude_m"]),
                "relative_altitude_m": float(relative_altitude_m),
                "east_m": east_m,
                "north_m": north_m,
                "up_m": up_m,
                "speed_mps": float(speed_mps),
            }
        )
        previous_row = row

    return pd.DataFrame(records)


def _build_plotly_figure(trajectory_frame: pd.DataFrame) -> dict[str, Any]:
    if trajectory_frame.empty:
        return go.Figure().to_dict()

    use_speed_coloring = trajectory_frame["speed_mps"].notna().any()
    color_series = trajectory_frame["speed_mps"] if use_speed_coloring else trajectory_frame["timestamp_s"]
    colorscale = "Viridis" if use_speed_coloring else "Plasma"
    colorbar_title = "Speed (m/s)" if use_speed_coloring else "Time (s)"

    figure = go.Figure()
    figure.add_trace(
        go.Scatter3d(
            x=trajectory_frame["east_m"],
            y=trajectory_frame["north_m"],
            z=trajectory_frame["up_m"],
            mode="lines+markers",
            marker={
                "size": 3,
                "color": color_series,
                "colorscale": colorscale,
                "showscale": True,
                "colorbar": {"title": colorbar_title},
            },
            line={"width": 4, "color": "rgba(40, 40, 40, 0.45)"},
            name="Flight Path",
        )
    )

    start = trajectory_frame.iloc[0]
    end = trajectory_frame.iloc[-1]
    figure.add_trace(
        go.Scatter3d(
            x=[float(start["east_m"])],
            y=[float(start["north_m"])],
            z=[float(start["up_m"])],
            mode="markers",
            marker={"size": 7, "color": "green"},
            name="Start",
        )
    )
    figure.add_trace(
        go.Scatter3d(
            x=[float(end["east_m"])],
            y=[float(end["north_m"])],
            z=[float(end["up_m"])],
            mode="markers",
            marker={"size": 7, "color": "red"},
            name="End",
        )
    )

    figure.update_layout(
        title="Drone trajectory in ENU coordinates",
        scene={
            "xaxis_title": "East (m)",
            "yaxis_title": "North (m)",
            "zaxis_title": "Altitude (m)",
        },
        margin={"l": 0, "r": 0, "t": 40, "b": 0},
    )
    return json.loads(figure.to_json())


def _encode_polyline(points: list[tuple[float, float]]) -> str:
    def _encode_value(value: int) -> str:
        encoded = ""
        value = ~(value << 1) if value < 0 else (value << 1)
        while value >= 0x20:
            encoded += chr((0x20 | (value & 0x1F)) + 63)
            value >>= 5
        encoded += chr(value + 63)
        return encoded

    result = ""
    previous_lat = 0
    previous_lng = 0

    for latitude, longitude in points:
        latitude_scaled = int(round(latitude * 1e5))
        longitude_scaled = int(round(longitude * 1e5))
        result += _encode_value(latitude_scaled - previous_lat)
        result += _encode_value(longitude_scaled - previous_lng)
        previous_lat = latitude_scaled
        previous_lng = longitude_scaled

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

    points = [
        {
            "lat": float(row["latitude_deg"]),
            "lng": float(row["longitude_deg"]),
            "altitude_m": float(row["altitude_m"]),
            "timestamp_s": float(row["timestamp_s"]),
            "speed_mps": float(row["speed_mps"]),
        }
        for _, row in trajectory_frame.iterrows()
    ]

    points_for_map = _downsample_points(points)
    encoded_polyline = _encode_polyline(
        [(point["lat"], point["lng"]) for point in points_for_map])

    start = points_for_map[0]
    end = points_for_map[-1]
    params: dict[str, Any] = {
        "size": "1200x700",
        "maptype": "satellite",
        "path": f"color:0x00ff00ff|weight:4|enc:{encoded_polyline}",
        "markers": [
            f"color:green|label:S|{start['lat']},{start['lng']}",
            f"color:red|label:E|{end['lat']},{end['lng']}",
        ],
    }

    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if api_key:
        params["key"] = api_key

    query_parts: list[str] = []
    for key, value in params.items():
        if isinstance(value, list):
            for item in value:
                query_parts.append(
                    f"{key}={urllib.parse.quote_plus(str(item))}")
        else:
            query_parts.append(f"{key}={urllib.parse.quote_plus(str(value))}")
    static_map_url = "https://maps.googleapis.com/maps/api/staticmap?" + \
        "&".join(query_parts)

    return {
        "center": {
            "lat": float(points_for_map[len(points_for_map) // 2]["lat"]),
            "lng": float(points_for_map[len(points_for_map) // 2]["lng"]),
        },
        "start": {"lat": float(start["lat"]), "lng": float(start["lng"])},
        "end": {"lat": float(end["lat"]), "lng": float(end["lng"])},
        "points": points_for_map,
        "encoded_polyline": encoded_polyline,
        "static_map_url": static_map_url,
        "api_key_configured": bool(api_key),
    }


def _compute_imu_velocity_metrics(imu_frame: pd.DataFrame) -> dict[str, Any]:
    if imu_frame.empty:
        return {
            "vx": np.array([], dtype=float),
            "vy": np.array([], dtype=float),
            "vz": np.array([], dtype=float),
            "max_horizontal_speed_mps": 0.0,
            "max_acceleration_mps2": 0.0,
        }

    time_s = _safe_series(
        imu_frame, ["TimeUS", "timestamp_s"]).to_numpy(dtype=float)
    acc_x = _safe_series(
        imu_frame, ["AccX", "acceleration_x_mps2"]).to_numpy(dtype=float)
    acc_y = _safe_series(
        imu_frame, ["AccY", "acceleration_y_mps2"]).to_numpy(dtype=float)
    acc_z = _safe_series(
        imu_frame, ["AccZ", "acceleration_z_mps2"]).to_numpy(dtype=float)

    valid_mask = np.isfinite(time_s) & np.isfinite(
        acc_x) & np.isfinite(acc_y) & np.isfinite(acc_z)
    time_s = time_s[valid_mask]
    acc_x = acc_x[valid_mask]
    acc_y = acc_y[valid_mask]
    acc_z = acc_z[valid_mask]

    if time_s.size == 0:
        return {
            "vx": np.array([], dtype=float),
            "vy": np.array([], dtype=float),
            "vz": np.array([], dtype=float),
            "max_horizontal_speed_mps": 0.0,
            "max_acceleration_mps2": 0.0,
        }

    order = np.argsort(time_s)
    time_s = time_s[order]
    acc_x = acc_x[order]
    acc_y = acc_y[order]
    acc_z = acc_z[order]

    sample_count = time_s.size
    vx = np.zeros(sample_count, dtype=float)
    vy = np.zeros(sample_count, dtype=float)
    vz = np.zeros(sample_count, dtype=float)

    for index in range(1, sample_count):
        delta_time = time_s[index] - time_s[index - 1]
        if delta_time <= 0:
            vx[index] = vx[index - 1]
            vy[index] = vy[index - 1]
            vz[index] = vz[index - 1]
            continue

        vx[index] = vx[index - 1] + \
            (acc_x[index - 1] + acc_x[index]) * 0.5 * delta_time
        vy[index] = vy[index - 1] + \
            (acc_y[index - 1] + acc_y[index]) * 0.5 * delta_time
        vz[index] = vz[index - 1] + \
            (acc_z[index - 1] + acc_z[index]) * 0.5 * delta_time

    horizontal_speed = np.sqrt(vx ** 2 + vy ** 2)
    acceleration_magnitude = np.sqrt(acc_x ** 2 + acc_y ** 2 + acc_z ** 2)

    return {
        "vx": vx,
        "vy": vy,
        "vz": vz,
        "max_horizontal_speed_mps": float(np.max(horizontal_speed)) if horizontal_speed.size else 0.0,
        "max_acceleration_mps2": float(np.max(acceleration_magnitude)) if acceleration_magnitude.size else 0.0,
    }


def _gps_total_distance_m(gps_frame: pd.DataFrame) -> float:
    if gps_frame.empty:
        return 0.0

    latitude = _safe_series(gps_frame, ["Lat", "latitude_deg", "lat"])
    longitude = _safe_series(gps_frame, ["Lng", "Lon", "longitude_deg", "lon"])
    points = pd.DataFrame({"lat": latitude, "lng": longitude}).dropna()
    if len(points) < 2:
        return 0.0

    distance_sum = 0.0
    previous = points.iloc[0]
    for _, current in points.iloc[1:].iterrows():
        distance_sum += haversine_distance_m(
            float(previous["lat"]),
            float(previous["lng"]),
            float(current["lat"]),
            float(current["lng"]),
        )
        previous = current
    return float(distance_sum)


def _trajectory_total_distance_m(trajectory_frame: pd.DataFrame) -> float:
    if trajectory_frame.empty:
        return 0.0

    distance_sum = 0.0
    previous = trajectory_frame.iloc[0]
    for _, current in trajectory_frame.iloc[1:].iterrows():
        distance_sum += haversine_distance_m(
            float(previous["latitude_deg"]),
            float(previous["longitude_deg"]),
            float(current["latitude_deg"]),
            float(current["longitude_deg"]),
        )
        previous = current
    return float(distance_sum)


def _altitude_gain_m(gps_frame: pd.DataFrame, baro_frame: pd.DataFrame) -> float:
    gains: list[float] = []

    gps_alt = _safe_series(gps_frame, ["Alt", "altitude_m", "alt"]).dropna()
    if not gps_alt.empty:
        gains.append(float(gps_alt.max() - gps_alt.min()))

    baro_alt = _safe_series(baro_frame, ["Alt", "altitude_m", "alt"]).dropna()
    if not baro_alt.empty:
        gains.append(float(baro_alt.max() - baro_alt.min()))

    return float(max(gains)) if gains else 0.0


def _flight_duration_s(gps_frame: pd.DataFrame, imu_frame: pd.DataFrame, baro_frame: pd.DataFrame) -> float:
    all_times = pd.concat(
        [
            _safe_series(gps_frame, ["TimeUS", "timestamp_s"]),
            _safe_series(imu_frame, ["TimeUS", "timestamp_s"]),
            _safe_series(baro_frame, ["TimeUS", "timestamp_s"]),
        ],
        ignore_index=True,
    ).dropna()

    if all_times.empty:
        return 0.0
    return float(all_times.max() - all_times.min())


def analyze_log_bytes(file_bytes: bytes, filename: str | None = None) -> dict[str, Any]:
    parsed_log = parse_log_bytes(file_bytes, filename=filename)

    gps_frame = parsed_log.gps.copy()
    imu_frame = parsed_log.imu.copy()
    baro_frame = parsed_log.baro.copy()

    trajectory_frame = _build_trajectory_frame(gps_frame)
    imu_metrics = _compute_imu_velocity_metrics(imu_frame)

    max_gps_speed = (
        float(trajectory_frame["speed_mps"].max())
        if not trajectory_frame.empty and "speed_mps" in trajectory_frame.columns
        else 0.0
    )
    max_horizontal_speed = max_gps_speed

    gps_vz = _safe_series(
        gps_frame, ["VZ", "VelD", "velocity_down_mps"]).dropna()
    baro_crt = _safe_series(baro_frame, ["CRt", "vertical_speed_mps"]).dropna()
    vertical_candidates: list[float] = []
    if not gps_vz.empty:
        vertical_candidates.append(
            float(np.max(np.abs(gps_vz.to_numpy(dtype=float)))))
    if not baro_crt.empty:
        vertical_candidates.append(
            float(np.max(np.abs(baro_crt.to_numpy(dtype=float)))))
    max_vertical_speed = float(
        max(vertical_candidates)) if vertical_candidates else 0.0

    metrics = {
        "duration_s": _flight_duration_s(gps_frame, imu_frame, baro_frame),
        "total_distance_m": _trajectory_total_distance_m(trajectory_frame),
        "max_horizontal_speed_mps": max_horizontal_speed,
        "max_vertical_speed_mps": max_vertical_speed,
        "max_acceleration_mps2": float(imu_metrics["max_acceleration_mps2"]),
        "max_altitude_gain_m": _altitude_gain_m(gps_frame, baro_frame),
        "max_estimated_speed_from_acceleration_mps": float(imu_metrics["max_horizontal_speed_mps"]),
    }

    if gps_frame.empty and imu_frame.empty and baro_frame.empty:
        metrics["error"] = "No decodable GPS/IMU/BARO packets found in the log file."

    return {
        "filename": filename,
        "message_count": int(len(parsed_log.raw_messages)),
        "parsed": parsed_log.to_api_payload(),
        "metrics": metrics,
        "trajectory_enu": trajectory_frame.to_dict(orient="records"),
        "plotly_figure": _build_plotly_figure(trajectory_frame),
        "google_maps": _build_google_maps_payload(trajectory_frame),
        "acceleration_profile": {
            "vx": imu_metrics["vx"].tolist() if isinstance(imu_metrics["vx"], np.ndarray) else [],
            "vy": imu_metrics["vy"].tolist() if isinstance(imu_metrics["vy"], np.ndarray) else [],
            "vz": imu_metrics["vz"].tolist() if isinstance(imu_metrics["vz"], np.ndarray) else [],
        },
    }


async def parse_log_bytes_async(file_bytes: bytes, filename: str | None = None) -> ParsedLogData:
    return await asyncio.to_thread(parse_log_bytes, file_bytes, filename)


async def analyze_log_bytes_async(file_bytes: bytes, filename: str | None = None) -> dict[str, Any]:
    return await asyncio.to_thread(analyze_log_bytes, file_bytes, filename)

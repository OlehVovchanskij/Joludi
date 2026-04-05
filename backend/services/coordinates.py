from __future__ import annotations

import logging
from dataclasses import dataclass
from math import atan2, cos, radians, sin, sqrt

logger = logging.getLogger(__name__)

EARTH_RADIUS_M = 6378137.0

# ---------------------------------------------------------------------------
# Try to import the compiled C extension for ~50-100× speed-up on hot paths.
# Falls back transparently to pure Python when the extension is not compiled.
# ---------------------------------------------------------------------------
try:
    import flight_math as _c  # type: ignore[import-untyped]
    _NATIVE = True
    logger.info("flight_math C extension loaded — native math enabled.")
except ImportError:
    _c = None  # type: ignore[assignment]
    _NATIVE = False
    logger.info("flight_math C extension not found — using pure-Python math.")


@dataclass(frozen=True)
class GeoPoint:
    latitude: float
    longitude: float
    altitude_m: float


def haversine_distance_m(
    latitude_1: float,
    longitude_1: float,
    latitude_2: float,
    longitude_2: float,
) -> float:
    """Return great-circle distance in meters using the haversine formula."""
    if _NATIVE:
        return _c.haversine_distance_m(latitude_1, longitude_1,
                                        latitude_2, longitude_2)

    latitude_1_rad = radians(latitude_1)
    latitude_2_rad = radians(latitude_2)
    latitude_delta = radians(latitude_2 - latitude_1)
    longitude_delta = radians(longitude_2 - longitude_1)

    half_chord = (
        sin(latitude_delta / 2.0) ** 2
        + cos(latitude_1_rad) * cos(latitude_2_rad) *
        sin(longitude_delta / 2.0) ** 2
    )
    central_angle = 2.0 * atan2(sqrt(half_chord), sqrt(1.0 - half_chord))
    return EARTH_RADIUS_M * central_angle


def wgs84_to_enu(
    latitude: float,
    longitude: float,
    altitude_m: float,
    origin: GeoPoint,
) -> tuple[float, float, float]:
    """Convert WGS-84 coordinates to a local ENU frame around the takeoff point.

    A local tangent plane is accurate enough for flight logs and is much lighter
    than a full geodetic chain for short-range drone missions.
    """
    if _NATIVE:
        return _c.wgs84_to_enu(latitude, longitude, altitude_m,
                                origin.latitude, origin.longitude,
                                origin.altitude_m)

    latitude_rad = radians(latitude)
    origin_latitude_rad = radians(origin.latitude)
    delta_latitude = radians(latitude - origin.latitude)
    delta_longitude = radians(longitude - origin.longitude)

    east_m = EARTH_RADIUS_M * delta_longitude * cos(origin_latitude_rad)
    north_m = EARTH_RADIUS_M * delta_latitude
    up_m = altitude_m - origin.altitude_m
    return east_m, north_m, up_m

"""
fast_math.py — Thin wrapper that exposes the C extension with a pure-Python
fallback.

If the compiled C module ``flight_math`` is available it is used
automatically for haversine, trapezoidal integration and WGS-84 → ENU
conversion.  Otherwise the wrapper silently falls back to the existing
pure-Python implementations in ``services.coordinates``, so the backend
always works — even without a C compiler installed.

Import this module instead of ``services.coordinates`` when you want the
fastest available implementation::

    from native.fast_math import haversine_distance_m, wgs84_to_enu
"""

from __future__ import annotations

import logging
from math import atan2, cos, radians, sin, sqrt
from typing import Sequence

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Try importing the compiled C extension.
# ---------------------------------------------------------------------------
try:
    import flight_math as _c  # type: ignore[import-untyped]

    NATIVE_AVAILABLE = True
    logger.info("flight_math C extension loaded — using native routines.")
except ImportError:
    _c = None  # type: ignore[assignment]
    NATIVE_AVAILABLE = False
    logger.info("flight_math C extension not found — falling back to pure Python.")

# ---------------------------------------------------------------------------
# Constants (duplicated here so the wrapper is self-contained).
# ---------------------------------------------------------------------------
EARTH_RADIUS_M = 6_378_137.0


# ---------------------------------------------------------------------------
# haversine_distance_m
# ---------------------------------------------------------------------------
def haversine_distance_m(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Great-circle distance in metres between two WGS-84 points."""
    if NATIVE_AVAILABLE:
        return _c.haversine_distance_m(lat1, lon1, lat2, lon2)

    # Pure-Python fallback. -------------------------------------------------
    lat1_r = radians(lat1)
    lat2_r = radians(lat2)
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    hc = sin(dlat / 2) ** 2 + cos(lat1_r) * cos(lat2_r) * sin(dlon / 2) ** 2
    return EARTH_RADIUS_M * 2.0 * atan2(sqrt(hc), sqrt(1.0 - hc))


# ---------------------------------------------------------------------------
# wgs84_to_enu
# ---------------------------------------------------------------------------
def wgs84_to_enu(
    lat: float,
    lon: float,
    alt: float,
    origin_lat: float,
    origin_lon: float,
    origin_alt: float,
) -> tuple[float, float, float]:
    """Convert WGS-84 to local East-North-Up around an origin point."""
    if NATIVE_AVAILABLE:
        return _c.wgs84_to_enu(lat, lon, alt, origin_lat, origin_lon, origin_alt)

    # Pure-Python fallback. -------------------------------------------------
    olat_r = radians(origin_lat)
    dlat = radians(lat - origin_lat)
    dlon = radians(lon - origin_lon)
    east = EARTH_RADIUS_M * dlon * cos(olat_r)
    north = EARTH_RADIUS_M * dlat
    up = alt - origin_alt
    return east, north, up


# ---------------------------------------------------------------------------
# trapezoidal_integrate
# ---------------------------------------------------------------------------
def trapezoidal_integrate(
    time_s: Sequence[float],
    acc: Sequence[float],
) -> list[float]:
    """Cumulative trapezoidal integration of acceleration → velocity."""
    n = len(time_s)
    if n == 0:
        return []

    if NATIVE_AVAILABLE:
        return _c.trapezoidal_integrate(list(time_s), list(acc), n)

    # Pure-Python fallback. -------------------------------------------------
    v = [0.0] * n
    for i in range(1, n):
        dt = time_s[i] - time_s[i - 1]
        if dt <= 0:
            v[i] = v[i - 1]
        else:
            v[i] = v[i - 1] + 0.5 * (acc[i - 1] + acc[i]) * dt
    return v


# ---------------------------------------------------------------------------
# total_haversine_distance
# ---------------------------------------------------------------------------
def total_haversine_distance(
    lats: Sequence[float],
    lons: Sequence[float],
) -> float:
    """Total polyline distance over arrays of lat/lon via haversine."""
    n = len(lats)
    if n < 2:
        return 0.0

    if NATIVE_AVAILABLE:
        return _c.total_haversine_distance(list(lats), list(lons), n)

    # Pure-Python fallback. -------------------------------------------------
    total = 0.0
    for i in range(1, n):
        total += haversine_distance_m(lats[i - 1], lons[i - 1],
                                       lats[i], lons[i])
    return total

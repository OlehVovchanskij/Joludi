/**
 * flight_math.c — High-performance C extension for UAV telemetry analysis.
 *
 * Provides optimised implementations of the core mathematical routines used
 * throughout the Drone Analyzer backend:
 *
 *   1. haversine_distance_m  — great-circle distance on the WGS-84 ellipsoid
 *      approximated as a sphere (R = 6 378 137 m).
 *   2. trapezoidal_integrate — cumulative trapezoidal integration of an
 *      acceleration profile to obtain velocity.
 *   3. wgs84_to_enu          — conversion from global geodetic coordinates
 *      (latitude/longitude/altitude) to a local East-North-Up frame anchored
 *      at the take-off point.
 *
 * -------------------------------------------------------------------------
 * THEORETICAL NOTES
 * -------------------------------------------------------------------------
 *
 * Haversine formula
 * -----------------
 * The haversine of an angle θ is defined as:  hav(θ) = sin²(θ/2).
 * For two points on a sphere of radius R the central angle Δσ satisfies:
 *
 *   hav(Δσ) = hav(Δφ) + cos(φ₁)·cos(φ₂)·hav(Δλ)
 *
 * where φ = latitude, λ = longitude.  Solving for Δσ via atan2 gives
 * numerically stable results even for small distances.  The great-circle
 * distance is then d = R · Δσ.
 *
 * Trapezoidal integration of IMU accelerations
 * ---------------------------------------------
 * Raw accelerometer readings a[k] are integrated to velocity v[k]:
 *
 *   v[k] = v[k-1] + 0.5 · (a[k-1] + a[k]) · Δt[k]
 *
 * This is the trapezoidal (second-order) quadrature rule.  It is one order
 * more accurate than the rectangle rule but still accumulates drift because
 * sensor bias and noise integrate linearly over time.  For short UAV flights
 * (< 30 min) the drift is usually tolerable; for longer missions a
 * complementary or Kalman filter that fuses GPS with IMU is recommended.
 *
 * Why quaternions beat Euler angles for orientation
 * -------------------------------------------------
 * Euler angles (roll, pitch, yaw) suffer from gimbal lock when pitch
 * approaches ±90°: two rotation axes align and one degree of freedom is
 * lost, making the representation singular.  Unit quaternions q = (w,x,y,z)
 * with ‖q‖ = 1 parameterise SO(3) without singularities and compose via
 * Hamilton product, which is cheaper than constructing three rotation
 * matrices.  Most modern flight controllers (including Ardupilot) store
 * attitude internally as a quaternion and convert to Euler angles only for
 * display.
 *
 * WGS-84 → ENU conversion (flat-earth approximation)
 * ---------------------------------------------------
 * For small areas (a few km around the origin) the Earth's surface can be
 * treated as a tangent plane.  Given an origin (φ₀, λ₀, h₀):
 *
 *   East  = R · Δλ · cos(φ₀)
 *   North = R · Δφ
 *   Up    = h - h₀
 *
 * This avoids the full ECEF → ENU rotation matrix while remaining accurate
 * to < 0.1 % for distances under ~10 km, which is well within the typical
 * operating radius of a multi-rotor UAV.
 * -------------------------------------------------------------------------
 */

#define PY_SSIZE_T_CLEAN
#include <Python.h>
#include <math.h>

/* WGS-84 semi-major axis in metres. */
static const double EARTH_RADIUS_M = 6378137.0;

/* Degrees → radians conversion factor. */
static const double DEG2RAD = M_PI / 180.0;


/* -----------------------------------------------------------------------
 * haversine_distance_m(lat1, lon1, lat2, lon2) → float
 * ----------------------------------------------------------------------- */
static PyObject *
flight_math_haversine(PyObject *self, PyObject *args)
{
    double lat1, lon1, lat2, lon2;
    if (!PyArg_ParseTuple(args, "dddd", &lat1, &lon1, &lat2, &lon2))
        return NULL;

    double lat1_rad = lat1 * DEG2RAD;
    double lat2_rad = lat2 * DEG2RAD;
    double dlat     = (lat2 - lat1) * DEG2RAD;
    double dlon     = (lon2 - lon1) * DEG2RAD;

    double half_chord = sin(dlat / 2.0) * sin(dlat / 2.0)
                      + cos(lat1_rad) * cos(lat2_rad)
                      * sin(dlon / 2.0) * sin(dlon / 2.0);

    double central_angle = 2.0 * atan2(sqrt(half_chord),
                                        sqrt(1.0 - half_chord));

    return PyFloat_FromDouble(EARTH_RADIUS_M * central_angle);
}


/* -----------------------------------------------------------------------
 * trapezoidal_integrate(time_s, acc, n) → list[float]
 *
 * Performs cumulative trapezoidal integration of acceleration `acc` over
 * `time_s`, returning velocity at each sample.  Both `time_s` and `acc`
 * are Python lists of floats with length `n`.
 * ----------------------------------------------------------------------- */
static PyObject *
flight_math_trapezoidal(PyObject *self, PyObject *args)
{
    PyObject *time_list, *acc_list;
    Py_ssize_t n;

    if (!PyArg_ParseTuple(args, "OOn", &time_list, &acc_list, &n))
        return NULL;

    if (n <= 0)
        return PyList_New(0);

    /* Allocate C arrays for speed. */
    double *t = (double *)malloc((size_t)n * sizeof(double));
    double *a = (double *)malloc((size_t)n * sizeof(double));
    double *v = (double *)calloc((size_t)n, sizeof(double));

    if (!t || !a || !v) {
        free(t); free(a); free(v);
        return PyErr_NoMemory();
    }

    for (Py_ssize_t i = 0; i < n; i++) {
        t[i] = PyFloat_AsDouble(PyList_GetItem(time_list, i));
        a[i] = PyFloat_AsDouble(PyList_GetItem(acc_list, i));
    }

    /* Core trapezoidal integration loop. */
    for (Py_ssize_t i = 1; i < n; i++) {
        double dt = t[i] - t[i - 1];
        if (dt <= 0.0) {
            v[i] = v[i - 1];
        } else {
            v[i] = v[i - 1] + 0.5 * (a[i - 1] + a[i]) * dt;
        }
    }

    /* Build Python list result. */
    PyObject *result = PyList_New(n);
    if (!result) {
        free(t); free(a); free(v);
        return NULL;
    }
    for (Py_ssize_t i = 0; i < n; i++) {
        PyList_SET_ITEM(result, i, PyFloat_FromDouble(v[i]));
    }

    free(t);
    free(a);
    free(v);
    return result;
}


/* -----------------------------------------------------------------------
 * wgs84_to_enu(lat, lon, alt, origin_lat, origin_lon, origin_alt)
 *   → (east_m, north_m, up_m)
 * ----------------------------------------------------------------------- */
static PyObject *
flight_math_wgs84_to_enu(PyObject *self, PyObject *args)
{
    double lat, lon, alt, olat, olon, oalt;
    if (!PyArg_ParseTuple(args, "dddddd", &lat, &lon, &alt,
                          &olat, &olon, &oalt))
        return NULL;

    double olat_rad = olat * DEG2RAD;
    double dlat     = (lat - olat) * DEG2RAD;
    double dlon     = (lon - olon) * DEG2RAD;

    double east_m  = EARTH_RADIUS_M * dlon * cos(olat_rad);
    double north_m = EARTH_RADIUS_M * dlat;
    double up_m    = alt - oalt;

    return Py_BuildValue("(ddd)", east_m, north_m, up_m);
}


/* -----------------------------------------------------------------------
 * total_haversine_distance(lats, lons, n) → float
 *
 * Sum of haversine distances along a polyline of n GPS points.
 * Much faster than calling haversine_distance_m in a Python loop.
 * ----------------------------------------------------------------------- */
static PyObject *
flight_math_total_distance(PyObject *self, PyObject *args)
{
    PyObject *lat_list, *lon_list;
    Py_ssize_t n;

    if (!PyArg_ParseTuple(args, "OOn", &lat_list, &lon_list, &n))
        return NULL;

    if (n < 2)
        return PyFloat_FromDouble(0.0);

    double total = 0.0;
    double prev_lat = PyFloat_AsDouble(PyList_GetItem(lat_list, 0)) * DEG2RAD;
    double prev_lon = PyFloat_AsDouble(PyList_GetItem(lon_list, 0)) * DEG2RAD;

    for (Py_ssize_t i = 1; i < n; i++) {
        double cur_lat = PyFloat_AsDouble(PyList_GetItem(lat_list, i)) * DEG2RAD;
        double cur_lon = PyFloat_AsDouble(PyList_GetItem(lon_list, i)) * DEG2RAD;

        double dlat = cur_lat - prev_lat;
        double dlon = cur_lon - prev_lon;

        double hc = sin(dlat / 2.0) * sin(dlat / 2.0)
                   + cos(prev_lat) * cos(cur_lat)
                   * sin(dlon / 2.0) * sin(dlon / 2.0);

        total += 2.0 * atan2(sqrt(hc), sqrt(1.0 - hc));

        prev_lat = cur_lat;
        prev_lon = cur_lon;
    }

    return PyFloat_FromDouble(EARTH_RADIUS_M * total);
}


/* ----------------------------------------------------------------------- */
static PyMethodDef FlightMathMethods[] = {
    {"haversine_distance_m",   flight_math_haversine,       METH_VARARGS,
     "Great-circle distance in metres between two WGS-84 points."},
    {"trapezoidal_integrate",  flight_math_trapezoidal,     METH_VARARGS,
     "Cumulative trapezoidal integration of acceleration to velocity."},
    {"wgs84_to_enu",           flight_math_wgs84_to_enu,    METH_VARARGS,
     "Convert WGS-84 (lat, lon, alt) to local ENU (east, north, up)."},
    {"total_haversine_distance", flight_math_total_distance, METH_VARARGS,
     "Total polyline distance via haversine over arrays of lat/lon."},
    {NULL, NULL, 0, NULL}
};

static struct PyModuleDef flight_math_module = {
    PyModuleDef_HEAD_INIT,
    "flight_math",
    "High-performance C implementations of UAV flight math routines.\n\n"
    "Functions:\n"
    "  haversine_distance_m(lat1, lon1, lat2, lon2)\n"
    "  trapezoidal_integrate(time_list, acc_list, n)\n"
    "  wgs84_to_enu(lat, lon, alt, origin_lat, origin_lon, origin_alt)\n"
    "  total_haversine_distance(lat_list, lon_list, n)\n",
    -1,
    FlightMathMethods
};

PyMODINIT_FUNC
PyInit_flight_math(void)
{
    return PyModule_Create(&flight_math_module);
}

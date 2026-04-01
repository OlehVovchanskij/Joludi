# Drone Analyzer Backend

FastAPI backend for parsing Ardupilot `.bin` flight logs, computing flight metrics, and converting GPS track points into a local ENU trajectory.

## Why this stack

- `FastAPI` gives a small and fast API layer for file uploads and JSON responses.
- `pymavlink` is the right parser for Ardupilot binary logs.
- `pandas`, `numpy`, and `scipy` make the data preparation and numerical analysis straightforward.
- `plotly` is used to generate a 3D trajectory visualization payload.

## Run with Docker

```bash
docker compose up --build
```

The API will be available at `http://localhost:8501`.

## Endpoints

- `GET /health` - basic service check.
- `POST /api/parse` - parse GPS and IMU samples from an uploaded `.bin` file.
- `POST /api/metrics` - compute mission metrics.
- `POST /api/trajectory` - return ENU trajectory data and a Plotly figure payload.
- `POST /api/analyze` - return the full analysis payload in one request.
- `POST /api/map/google` - return Google Maps payload with points, encoded polyline, and static map URL.

## Google Maps

- Set `GOOGLE_MAPS_API_KEY` in environment variables to get authenticated Google Maps static URL output.
- The API returns `google_maps.encoded_polyline` and `google_maps.points` that can be rendered in Google Maps JavaScript API.

## Notes

- The first GPS sample is used as the ENU origin.
- Total distance is computed with the haversine formula.
- Speed estimates from acceleration are integrated with the trapezoidal rule.
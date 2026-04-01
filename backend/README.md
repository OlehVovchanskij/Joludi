# Drone Analyzer Backend

FastAPI API для обробки Ardupilot логів, обчислення польотних метрик, 3D ENU траєкторії та генерації AI-підсумку.

## Локальний запуск

```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8501 --reload
```

## Docker

```bash
docker compose up --build
```

API доступне на `http://localhost:8501`.

## Endpoints

- `GET /health` - health-check.
- `POST /api/parse` - розбір GPS/IMU повідомлень та службові поля (sampling/units).
- `POST /api/metrics` - тільки метрики місії.
- `POST /api/trajectory` - ENU траєкторія + Plotly + Google payload.
- `POST /api/analyze` - повний payload за один запит.
- `POST /api/map/google` - polyline/static URL для Google Maps.
- `POST /api/ai/summary` - AI/heuristic текстовий висновок по результату аналізу.

## Алгоритмічна база

- Перетворення координат `WGS-84 -> ENU` виконується відносно стартової точки польоту.
- Загальна дистанція рахується через формулу haversine для кожної пари GPS-точок.
- Оцінка швидкості з профілю прискорення IMU базується на трапецієвидному інтегруванні.

## AI Summary

- Якщо задано `OPENAI_API_KEY`, endpoint `/api/ai/summary` використовує OpenAI-compatible chat completions.
- Без ключа повертається rule-based технічний висновок (fail-safe режим).

Підтримувані змінні:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (default: `https://api.openai.com/v1`)
- `OPENAI_MODEL` (default: `gpt-4o-mini`)

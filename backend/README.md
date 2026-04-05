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
- `POST /api/auth/register` - create a user and return session tokens.
- `POST /api/auth/login` - sign in and return session tokens.
- `POST /api/auth/verify-email` - confirm email with verification token.
- `POST /api/auth/resend-verification` - resend the confirmation email.
- `POST /api/auth/refresh` - rotate a refresh token and get new session tokens.
- `POST /api/auth/logout` - revoke a refresh token session.
- `GET /api/auth/me` - get the current authenticated user.
- `POST /api/parse` - розбір GPS/IMU повідомлень та службові поля (sampling/units).
- `POST /api/metrics` - тільки метрики місії.
- `POST /api/trajectory` - ENU траєкторія + Plotly + Google payload.
- `POST /api/analyze` - повний payload за один запит.
- `GET /api/history?limit=30` - recent compact parse history for current user (Bearer token required).
- `POST /api/history/prune` - manual cleanup for current user's history.
- `POST /api/map/google` - polyline/static URL для Google Maps.
- `POST /api/ai/summary` - AI/heuristic текстовий висновок по результату аналізу + короткі рекомендації для пілота.
- `POST /api/ai/chat` - діалог з AI-коучем пілота на основі аналізу та історії повідомлень.
- `POST /api/ai/chat/logs` - тестовий endpoint для AI-коуча з технічними логами виклику провайдера (provider/model/status/latency/error).

## Алгоритмічна база

- Перетворення координат `WGS-84 -> ENU` виконується відносно стартової точки польоту.
- Загальна дистанція рахується через формулу haversine для кожної пари GPS-точок.
- Оцінка швидкості з профілю прискорення IMU базується на трапецієвидному інтегруванні.

## AI Summary

- Endpoint-и `/api/ai/summary` та `/api/ai/chat` працюють через OpenAI-compatible API.
- Провайдер обирається через `AI_PROVIDER` (`groq` або `openai`).
- Без ключа повертається rule-based технічний висновок (fail-safe режим).
- У відповіді також є `recommendations` для пілота та `risk_level` (`low`, `medium`, `high`).

### Як підключити реальну модель

1. Додайте в `backend/.env` або в змінні Docker такі значення (приклад для Groq):

```env
AI_PROVIDER=groq
GROQ_API_KEY=your_key_here
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.1-8b-instant
```

2. Перезапустіть backend або весь стек Docker.
3. Запустіть аналіз `.bin` файлу знову.
4. У картці `AI-порадник пілота` має з'явитися `provider: llm`, а не `rule-based`.

Для чату використовується та сама конфігурація провайдера, а endpoint `/api/ai/chat` повертає звичайний текстовий `reply` для діалогу з пілотом.

Для дебагу та тестування реальної роботи моделі використовуйте `/api/ai/chat/logs`: він повертає `reply` і блок `logs` з деталями виклику (без API ключа).

Якщо ви використовуєте сумісний з OpenAI API провайдер, просто замініть `OPENAI_BASE_URL` і `OPENAI_MODEL` на потрібні значення.

## Auth storage

- Users and sessions are stored in `data/auth_store.json`.
- Mount `backend/data` into the container to keep auth state after restarts.

## Parse history storage (PostgreSQL)

- Add PostgreSQL and set `DATABASE_URL` (default in compose already points to local `postgres` service).
- History stores only compact metadata/metrics (no full trajectory, no heavy payload blobs).
- History is user-scoped: each user can access and prune only their own records.
- Automatic cleanup uses:
	- `HISTORY_RETENTION_DAYS` (default: 30)
	- `HISTORY_MAX_ROWS` (default: 20000)
	- `HISTORY_ENABLED` (default: true)

## Email verification / SMTP env

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`
- `SMTP_USE_TLS`
- `SMTP_USE_SSL`
- `APP_PUBLIC_URL`
- `EMAIL_VERIFICATION_TOKEN_TTL_MINUTES`

Optional:

- `EMAIL_PROVIDER=smtp`

Підтримувані змінні:

- `AI_PROVIDER` (`groq` або `openai`)
- `GROQ_API_KEY`
- `GROQ_BASE_URL` (default: `https://api.groq.com/openai/v1`)
- `GROQ_MODEL` (default: `llama-3.1-8b-instant`)
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (default: `https://api.openai.com/v1`)
- `OPENAI_MODEL` (default: `gpt-4o-mini`)

Додаткові anti-throttle змінні для зовнішнього AI-провайдера:

- `AI_PROVIDER_MIN_INTERVAL_SECONDS` (default: `1.0`) - мінімальна пауза між outbound AI-запитами.
- `AI_PROVIDER_MAX_RETRIES` (default: `2`) - кількість retry для `429/5xx` і мережевих timeout.
- `AI_PROVIDER_BACKOFF_SECONDS` (default: `1.5`) - базова пауза retry (лінійний backoff).
- `AI_PROVIDER_FORBIDDEN_COOLDOWN_SECONDS` (default: `600`) - cooldown після `403`, щоб не продовжувати спамити провайдера.

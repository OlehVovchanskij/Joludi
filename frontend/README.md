# Frontend Dashboard

Інтерактивна панель аналізу логів БПЛА.

## Можливості

- Upload `.bin` лог-файлу через браузер.
- Відображення підсумкових метрик польоту.
- Анімований трек на OpenStreetMap.
- 3D ENU траєкторія через Plotly.
- AI-підсумок польоту (отримується з backend endpoint `POST /api/ai/summary`).

## Локальний запуск

```bash
npm install
npm run dev
```

## Налаштування

- `NEXT_PUBLIC_API_BASE` - адреса backend API.

Приклад:

```bash
NEXT_PUBLIC_API_BASE=http://localhost:8501 npm run dev
```

## Docker

У репозиторії є `frontend/Dockerfile`. Для запуску разом із backend використовуйте кореневий `docker-compose.yml`.

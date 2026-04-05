from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Any


logger = logging.getLogger(__name__)


DEFAULT_MIN_INTERVAL_SECONDS = 1.0
DEFAULT_FORBIDDEN_COOLDOWN_SECONDS = 600
DEFAULT_MAX_RETRIES = 2
DEFAULT_BACKOFF_SECONDS = 1.5


_PROVIDER_LAST_REQUEST_AT: dict[str, float] = {}
_PROVIDER_COOLDOWN_UNTIL: dict[str, float] = {}


def _safe_float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
        if value < 0:
            return default
        return value
    except ValueError:
        return default


def _safe_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
        if value < 0:
            return default
        return value
    except ValueError:
        return default


def _resolve_ai_runtime() -> dict[str, str | None]:
    configured_provider = (os.getenv("AI_PROVIDER") or "").strip().lower()

    if configured_provider == "groq":
        return {
            "provider": "groq",
            "api_key": os.getenv("GROQ_API_KEY"),
            "base_url": os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
            "model": os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
        }

    if configured_provider == "openai":
        return {
            "provider": "openai",
            "api_key": os.getenv("OPENAI_API_KEY"),
            "base_url": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        }

    if os.getenv("OPENAI_API_KEY"):
        return {
            "provider": "openai",
            "api_key": os.getenv("OPENAI_API_KEY"),
            "base_url": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        }

    return {
        "provider": "groq",
        "api_key": os.getenv("GROQ_API_KEY"),
        "base_url": os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
        "model": os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
    }


def _format_metric(value: Any, unit: str) -> str:
    if isinstance(value, (int, float)):
        return f"{value:.2f} {unit}".strip()
    return "n/a"


def _risk_level_for_metrics(metrics: dict[str, Any]) -> str:
    max_horizontal_speed = metrics.get("max_horizontal_speed_mps")
    max_vertical_speed = metrics.get("max_vertical_speed_mps")
    max_acceleration = metrics.get("max_acceleration_mps2")

    if (
        isinstance(max_horizontal_speed, (int, float))
        and max_horizontal_speed > 30
    ) or (
        isinstance(max_vertical_speed, (int, float)) and max_vertical_speed > 6
    ) or (
        isinstance(max_acceleration, (int, float)) and max_acceleration > 15
    ):
        return "high"

    if (
        isinstance(max_horizontal_speed, (int, float))
        and max_horizontal_speed > 18
    ) or (
        isinstance(max_vertical_speed, (int, float)) and max_vertical_speed > 4
    ) or (
        isinstance(max_acceleration, (int, float)) and max_acceleration > 9
    ):
        return "medium"

    return "low"


def _build_recommendations(analysis: dict[str, Any]) -> list[str]:
    metrics = analysis.get("metrics") or {}
    if metrics.get("error"):
        return [
            "Перевірте цілісність GPS-даних і повторіть аналіз на повному лог-файлі.",
            "Якщо лог урізаний, збережіть місію повторно і порівняйте результат.",
        ]

    recommendations: list[str] = []
    max_horizontal_speed = metrics.get("max_horizontal_speed_mps")
    max_vertical_speed = metrics.get("max_vertical_speed_mps")
    max_acceleration = metrics.get("max_acceleration_mps2")
    max_altitude_gain = metrics.get("max_altitude_gain_m")

    if isinstance(max_horizontal_speed, (int, float)) and max_horizontal_speed > 30:
        recommendations.append(
            "Зменште пікову горизонтальну швидкість і перевірте, чи профіль місії не надто агресивний для задачі."
        )
    elif isinstance(max_horizontal_speed, (int, float)) and max_horizontal_speed > 18:
        recommendations.append(
            "Поточний профіль руху динамічний: якщо задача не вимагає швидких розгонів, згладьте горизонтальні маневри."
        )

    if isinstance(max_vertical_speed, (int, float)) and max_vertical_speed > 6:
        recommendations.append(
            "Зменште вертикальні прискорення: перевірте висотний контур, hover tuning і стабільність набору/зниження."
        )
    elif isinstance(max_vertical_speed, (int, float)) and max_vertical_speed > 4:
        recommendations.append(
            "Вертикальна динаміка помітна, тому варто переглянути плавність зміни висоти та реакцію на тягу."
        )

    if isinstance(max_acceleration, (int, float)) and max_acceleration > 20:
        recommendations.append(
            "Перевірте калібрування IMU та PID-настройки: піки прискорення виглядають надто різкими."
        )
    elif isinstance(max_acceleration, (int, float)) and max_acceleration > 9:
        recommendations.append(
            "Зафіксовано активні прискорення: оцініть, чи не занадто різко змінюється тяга або курс."
        )

    if isinstance(max_altitude_gain, (int, float)) and max_altitude_gain < 3:
        recommendations.append(
            "Місія майже не набирала висоту: якщо це не тестовий політ, перевірте задачу місії та обмеження по throttle."
        )

    if not recommendations:
        recommendations.append(
            "Профіль польоту виглядає стабільним; для поглибленого аналізу звірте 3D-траєкторію з часовим профілем швидкості."
        )

    return recommendations[:4]


def _build_rule_based_summary(analysis: dict[str, Any]) -> str:
    metrics = analysis.get("metrics") or {}
    if metrics.get("error"):
        return (
            "Дані GPS не знайдено або пошкоджені, тому підсумковий аналіз обмежений. "
            "Перевірте коректність лог-файлу та повторіть обробку."
        )

    duration_s = metrics.get("duration_s")
    distance_m = metrics.get("total_distance_m")
    max_h_speed = metrics.get("max_horizontal_speed_mps")
    max_v_speed = metrics.get("max_vertical_speed_mps")
    max_acc = metrics.get("max_acceleration_mps2")
    max_gain = metrics.get("max_altitude_gain_m")

    findings: list[str] = [
        "Автоматичний висновок по місії:",
        f"Тривалість польоту: {_format_metric(duration_s, 's')}, дистанція: {_format_metric(distance_m, 'm')}.",
        f"Пікова горизонтальна швидкість: {_format_metric(max_h_speed, 'm/s')}, вертикальна: {_format_metric(max_v_speed, 'm/s')}.",
        f"Максимальне прискорення: {_format_metric(max_acc, 'm/s^2')}, набір висоти: {_format_metric(max_gain, 'm')}.",
    ]

    if isinstance(max_h_speed, (int, float)) and max_h_speed > 20:
        findings.append(
            "Зафіксовано високу горизонтальну швидкість, варто перевірити відповідність профілю місії.")
    if isinstance(max_v_speed, (int, float)) and max_v_speed > 6:
        findings.append(
            "Висока вертикальна динаміка може свідчити про агресивні маневри або турбулентність.")
    if isinstance(max_acc, (int, float)) and max_acc > 20:
        findings.append(
            "Спостерігаються піки прискорення; рекомендовано переглянути ділянки різких змін тяги/курсу.")
    if isinstance(max_gain, (int, float)) and max_gain < 3:
        findings.append(
            "Невеликий набір висоти: місія схожа на низьковисотний або короткий тестовий проліт.")

    findings.append(
        "Для детальнішої діагностики перевірте 3D-траєкторію та профіль швидкості по часу.")
    return " ".join(findings)


def _build_llm_prompt(analysis: dict[str, Any]) -> str:
    metrics = analysis.get("metrics") or {}
    sampled_track = (analysis.get("trajectory_enu") or [])[:120]
    payload = {
        "metrics": metrics,
        "trajectory_sample": sampled_track,
        "filename": analysis.get("filename"),
    }
    return (
        "Ти асистент аналізу польотів БПЛА. "
        "Поверни тільки валідний JSON без markdown, пояснень і додаткового тексту. "
        "Схема відповіді: {"
        '"summary": string, '
        '"risk_level": "low" | "medium" | "high", '
        '"recommendations": string[]'
        "}. "
        "summary має бути коротким технічним висновком українською на 4-6 речень. "
        "recommendations мають містити 2-4 конкретні поради для пілота, сформульовані природною мовою, без шаблонних фраз. "
        "risk_level оцінюй за профілем польоту, а не за емоціями. "
        f"Вхідні дані: {json.dumps(payload, ensure_ascii=False)}"
    )


def _extract_json_payload(raw_text: str) -> dict[str, Any] | None:
    candidate = raw_text.strip()
    if candidate.startswith("```"):
        candidate = candidate.removeprefix(
            "```json").removeprefix("```").strip()
        if candidate.endswith("```"):
            candidate = candidate[:-3].strip()

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed, dict):
        return None
    return parsed


def _normalize_risk_level(value: Any, metrics: dict[str, Any]) -> str:
    if isinstance(value, str) and value.lower() in {"low", "medium", "high"}:
        return value.lower()
    return _risk_level_for_metrics(metrics)


def _normalize_recommendations(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    recommendations: list[str] = []
    for item in value:
        if isinstance(item, str):
            cleaned = item.strip()
            if cleaned:
                recommendations.append(cleaned)
    return recommendations[:4]


def _call_openai_compatible(prompt: str) -> dict[str, Any] | None:
    payload = _call_openai_compatible_chat(
        [
            {
                "role": "system",
                "content": (
                    "Ти інженер-аналітик телеметрії БПЛА. Повертаєш лише JSON. "
                    "В JSON обов'язково мають бути поля summary, risk_level, recommendations."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    if payload is None:
        return None

    return _extract_json_payload(payload)


def _call_openai_compatible_chat(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.3,
    response_format: dict[str, Any] | None = None,
) -> str | None:
    content, _ = _call_openai_compatible_chat_with_logs(
        messages,
        temperature=temperature,
        response_format=response_format,
    )
    return content


def _call_openai_compatible_chat_with_logs(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.3,
    response_format: dict[str, Any] | None = None,
) -> tuple[str | None, dict[str, Any]]:
    runtime = _resolve_ai_runtime()
    api_key = runtime.get("api_key")
    base_url = (runtime.get("base_url") or "").strip()
    model = runtime.get("model") or ""
    provider = runtime.get("provider") or "unknown"

    min_interval_seconds = _safe_float_env(
        "AI_PROVIDER_MIN_INTERVAL_SECONDS", DEFAULT_MIN_INTERVAL_SECONDS)
    forbidden_cooldown_seconds = _safe_int_env(
        "AI_PROVIDER_FORBIDDEN_COOLDOWN_SECONDS", DEFAULT_FORBIDDEN_COOLDOWN_SECONDS)
    max_retries = _safe_int_env("AI_PROVIDER_MAX_RETRIES", DEFAULT_MAX_RETRIES)
    backoff_seconds = _safe_float_env("AI_PROVIDER_BACKOFF_SECONDS", DEFAULT_BACKOFF_SECONDS)

    logs: dict[str, Any] = {
        "provider": provider,
        "base_url": base_url,
        "model": model,
        "configured": bool(api_key),
        "message_count": len(messages),
    }

    if not api_key:
        logs["error"] = "Missing API key for selected AI provider"
        return None, logs

    now = time.time()
    blocked_until = _PROVIDER_COOLDOWN_UNTIL.get(provider, 0.0)
    if blocked_until > now:
        logs["error"] = "Provider cooldown is active after previous blocking response"
        logs["cooldown_remaining_s"] = round(blocked_until - now, 2)
        return None, logs

    last_request_at = _PROVIDER_LAST_REQUEST_AT.get(provider, 0.0)
    wait_seconds = (last_request_at + min_interval_seconds) - now
    if wait_seconds > 0:
        time.sleep(wait_seconds)
    _PROVIDER_LAST_REQUEST_AT[provider] = time.time()

    endpoint = f"{base_url.rstrip('/')}/chat/completions"
    logs["endpoint"] = endpoint

    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if response_format is not None:
        body["response_format"] = response_format

    data = json.dumps(body).encode("utf-8")

    request = urllib.request.Request(
        endpoint,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Joludi-Backend/1.0 (+https://localhost)",
        },
        method="POST",
    )

    last_error: str | None = None
    retry_count = 0
    for attempt in range(max_retries + 1):
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read().decode("utf-8")
                payload = json.loads(raw)
                content = payload["choices"][0]["message"]["content"].strip()
                logs["status_code"] = response.getcode()
                logs["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
                logs["finish_reason"] = payload.get("choices", [{}])[0].get("finish_reason")
                logs["response_preview"] = content[:500]
                logs["retry_count"] = retry_count
                return content, logs
        except urllib.error.HTTPError as exc:
            error_body = ""
            try:
                error_body = exc.read().decode("utf-8")
            except Exception:
                error_body = str(exc)

            status_code = getattr(exc, "code", None)
            last_error = error_body[:1000]
            logs["status_code"] = status_code
            logs["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)

            is_transient = status_code in {429, 500, 502, 503, 504}
            if is_transient and attempt < max_retries:
                retry_count += 1
                logs["retry_count"] = retry_count
                sleep_for = backoff_seconds * (attempt + 1)
                time.sleep(sleep_for)
                continue

            if status_code == 403:
                _PROVIDER_COOLDOWN_UNTIL[provider] = time.time() + forbidden_cooldown_seconds
                logs["cooldown_seconds"] = forbidden_cooldown_seconds

            logs["error"] = last_error
            logger.warning("AI provider HTTP error: %s", logs)
            return None, logs
        except (KeyError, ValueError, urllib.error.URLError, TimeoutError) as exc:
            last_error = str(exc)
            logs["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
            if attempt < max_retries:
                retry_count += 1
                logs["retry_count"] = retry_count
                sleep_for = backoff_seconds * (attempt + 1)
                time.sleep(sleep_for)
                continue
            logs["error"] = last_error
            logger.warning("AI provider request failed: %s", logs)
            return None, logs

    logs["error"] = last_error or "Unexpected provider call failure"
    logs["retry_count"] = retry_count
    return None, logs


def generate_flight_summary(analysis: dict[str, Any]) -> dict[str, Any]:
    prompt = _build_llm_prompt(analysis)
    metrics = analysis.get("metrics") or {}
    llm_payload = _call_openai_compatible(prompt)
    if llm_payload:
        summary = llm_payload.get("summary")
        if isinstance(summary, str) and summary.strip():
            recommendations = _normalize_recommendations(
                llm_payload.get("recommendations"))
            if not recommendations:
                recommendations = _build_recommendations(analysis)
            return {
                "provider": "llm",
                "summary": summary.strip(),
                "recommendations": recommendations,
                "risk_level": _normalize_risk_level(llm_payload.get("risk_level"), metrics),
            }

    recommendations = _build_recommendations(analysis)
    risk_level = _risk_level_for_metrics(metrics)
    if llm_payload is not None:
        return {
            "provider": "rule-based",
            "summary": _build_rule_based_summary(analysis),
            "recommendations": recommendations,
            "risk_level": risk_level,
        }

    return {
        "provider": "rule-based",
        "summary": _build_rule_based_summary(analysis),
        "recommendations": recommendations,
        "risk_level": risk_level,
    }


def _build_pilot_chat_system_prompt(analysis: dict[str, Any]) -> str:
    metrics = analysis.get("metrics") or {}
    safe_context = {
        "filename": analysis.get("filename"),
        "message_count": analysis.get("message_count"),
        "metrics": metrics,
        "summary": _build_rule_based_summary(analysis),
        "risk_level": _risk_level_for_metrics(metrics),
        "recommendations": _build_recommendations(analysis),
    }
    return (
        "Ти AI-коуч для пілота БПЛА. Твоя задача - допомагати покращувати навички польоту через короткі, практичні, конкретні поради. "
        "Не вигадуй дані, спирайся на передані метрики, summary і діалог. "
        "Пояснюй українською, без води, дружньо але технічно. "
        "Найважливіше: відповідай саме на останнє питання користувача, а не просто повторюй загальний аналіз. "
        "Якщо користувач питає 'що робити першим' або 'з чого почати', дай одну головну дію першою, потім коротко чому саме вона. "
        "Не повторюй слово в слово summary або recommendation з контексту. "
        "Якщо бачиш ризики, радь безпечні зміни профілю польоту, а не ризиковані експерименти. "
        f"Контекст місії: {json.dumps(safe_context, ensure_ascii=False)}"
    )


def _build_pilot_chat_fallback(analysis: dict[str, Any], user_message: str) -> str:
    metrics = analysis.get("metrics") or {}
    risk_level = _risk_level_for_metrics(metrics)
    recommendations = _build_recommendations(analysis)
    lower_message = user_message.lower().strip()
    first_priority = recommendations[0] if recommendations else "Спочатку перевірте профіль польоту на піки швидкості та прискорення."
    if any(
        phrase in lower_message
        for phrase in ["що робити першу", "що мені робити в першу", "з чого почати", "що робити перш", "first", "firstly"]
    ):
        first_line = f"Перший крок: {first_priority}"
    elif any(
        phrase in lower_message
        for phrase in ["вертик", "ривк", "висот", "hover", "тримання висоти"]
    ):
        first_line = "Перший крок: зменште вертикальні прискорення і перевірте висотний контур, бо саме він найбільше впливає на ривки по висоті."
    elif any(
        phrase in lower_message
        for phrase in ["швидк", "агресив", "розгін", "горизонт"]
    ):
        first_line = "Перший крок: обмежте пікову горизонтальну швидкість і спростіть профіль розгону, щоб прибрати зайву агресію в траєкторії."
    else:
        first_line = f"Перший крок: {first_priority}"

    base_lines = [
        f"Оцінка місії: ризик {risk_level}.",
        first_line,
        "Далі варто перевірити:",
    ]
    for item in recommendations[1:4]:
        base_lines.append(f"- {item}")
    if user_message.strip():
        base_lines.append(
            "Якщо хочеш, я можу розібрати окремо швидкість, вертикальні маневри, прискорення або побудувати план тренування на 3-5 польотів."
        )
    return " ".join(base_lines)


def generate_pilot_coach_reply(
    analysis: dict[str, Any],
    messages: list[dict[str, str]],
) -> dict[str, Any]:
    system_prompt = _build_pilot_chat_system_prompt(analysis)
    chat_messages = [{"role": "system", "content": system_prompt}, *messages]
    reply = _call_openai_compatible_chat(chat_messages, temperature=0.35)
    if reply:
        return {"provider": "llm", "reply": reply}

    user_message = messages[-1]["content"] if messages else ""
    return {
        "provider": "rule-based",
        "reply": _build_pilot_chat_fallback(analysis, user_message),
    }


def generate_pilot_coach_reply_with_logs(
    analysis: dict[str, Any],
    messages: list[dict[str, str]],
) -> dict[str, Any]:
    system_prompt = _build_pilot_chat_system_prompt(analysis)
    chat_messages = [{"role": "system", "content": system_prompt}, *messages]
    reply, logs = _call_openai_compatible_chat_with_logs(
        chat_messages,
        temperature=0.35,
    )
    if reply:
        return {
            "provider": "llm",
            "reply": reply,
            "logs": logs,
        }

    user_message = messages[-1]["content"] if messages else ""
    return {
        "provider": "rule-based",
        "reply": _build_pilot_chat_fallback(analysis, user_message),
        "logs": logs,
    }

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


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
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    endpoint = f"{base_url.rstrip('/')}/chat/completions"

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
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
            return payload["choices"][0]["message"]["content"].strip()
    except (KeyError, ValueError, urllib.error.URLError, TimeoutError):
        return None


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

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
        findings.append("Зафіксовано високу горизонтальну швидкість, варто перевірити відповідність профілю місії.")
    if isinstance(max_v_speed, (int, float)) and max_v_speed > 6:
        findings.append("Висока вертикальна динаміка може свідчити про агресивні маневри або турбулентність.")
    if isinstance(max_acc, (int, float)) and max_acc > 20:
        findings.append("Спостерігаються піки прискорення; рекомендовано переглянути ділянки різких змін тяги/курсу.")
    if isinstance(max_gain, (int, float)) and max_gain < 3:
        findings.append("Невеликий набір висоти: місія схожа на низьковисотний або короткий тестовий проліт.")

    findings.append("Для детальнішої діагностики перевірте 3D-траєкторію та профіль швидкості по часу.")
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
        "На основі метрик і частини траєкторії зроби короткий технічний висновок українською (4-6 речень): "
        "1) загальна оцінка польоту, 2) потенційні ризики, 3) що перевірити далі. "
        f"Вхідні дані: {json.dumps(payload, ensure_ascii=False)}"
    )


def _call_openai_compatible(prompt: str) -> str | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    endpoint = f"{base_url.rstrip('/')}/chat/completions"

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Ти інженер-аналітик телеметрії БПЛА."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
    }
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


def generate_flight_summary(analysis: dict[str, Any]) -> dict[str, str]:
    prompt = _build_llm_prompt(analysis)
    llm_summary = _call_openai_compatible(prompt)
    if llm_summary:
        return {"provider": "llm", "summary": llm_summary}

    return {"provider": "rule-based", "summary": _build_rule_based_summary(analysis)}

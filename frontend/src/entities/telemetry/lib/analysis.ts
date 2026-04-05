import type { Metrics } from "../model/types";

export function classifyFlightStyle(maxSpeed?: number, maxAccel?: number) {
  if (typeof maxSpeed !== "number" && typeof maxAccel !== "number") {
    return {
      label: "Невідомо",
      description: "Профіль визначиться після аналізу",
    };
  }

  const speed = maxSpeed ?? 0;
  const accel = maxAccel ?? 0;

  if (speed > 30 || accel > 15) {
    return {
      label: "Агресивний",
      description: "Різкі маневри та високі пікові значення",
    };
  }

  if (speed > 18 || accel > 9) {
    return {
      label: "Динамічний",
      description: "Активний профіль місії",
    };
  }

  return {
    label: "Плавний",
    description: "Стабільна траєкторія без різких змін",
  };
}

export function riskLevelLabel(riskLevel?: "low" | "medium" | "high") {
  if (riskLevel === "high") {
    return "Високий ризик";
  }

  if (riskLevel === "medium") {
    return "Середній ризик";
  }

  if (riskLevel === "low") {
    return "Низький ризик";
  }

  return "Ризик не оцінено";
}

export function deriveRiskLevel(
  metrics?: Metrics | null,
): "low" | "medium" | "high" | null {
  if (!metrics) {
    return null;
  }

  const maxHorizontalSpeed = metrics.max_horizontal_speed_mps;
  const maxVerticalSpeed = metrics.max_vertical_speed_mps;
  const maxAcceleration = metrics.max_acceleration_mps2;

  if (
    (typeof maxHorizontalSpeed === "number" && maxHorizontalSpeed > 30) ||
    (typeof maxVerticalSpeed === "number" && maxVerticalSpeed > 6) ||
    (typeof maxAcceleration === "number" && maxAcceleration > 15)
  ) {
    return "high";
  }

  if (
    (typeof maxHorizontalSpeed === "number" && maxHorizontalSpeed > 18) ||
    (typeof maxVerticalSpeed === "number" && maxVerticalSpeed > 4) ||
    (typeof maxAcceleration === "number" && maxAcceleration > 9)
  ) {
    return "medium";
  }

  return "low";
}

export function derivePilotRecommendations(metrics?: Metrics | null): string[] {
  if (!metrics) {
    return [];
  }

  const recommendations: string[] = [];
  const maxHorizontalSpeed = metrics.max_horizontal_speed_mps;
  const maxVerticalSpeed = metrics.max_vertical_speed_mps;
  const maxAcceleration = metrics.max_acceleration_mps2;
  const maxAltitudeGain = metrics.max_altitude_gain_m;

  if (typeof maxHorizontalSpeed === "number" && maxHorizontalSpeed > 30) {
    recommendations.push(
      "Зменште пікову горизонтальну швидкість і перевірте, чи профіль місії не надто агресивний для задачі.",
    );
  } else if (
    typeof maxHorizontalSpeed === "number" &&
    maxHorizontalSpeed > 18
  ) {
    recommendations.push(
      "Поточний профіль руху динамічний: якщо задача не вимагає швидких розгонів, згладьте горизонтальні маневри.",
    );
  }

  if (typeof maxVerticalSpeed === "number" && maxVerticalSpeed > 6) {
    recommendations.push(
      "Зменште вертикальні прискорення: перевірте висотний контур, hover tuning і стабільність набору/зниження.",
    );
  } else if (typeof maxVerticalSpeed === "number" && maxVerticalSpeed > 4) {
    recommendations.push(
      "Вертикальна динаміка помітна, тому варто переглянути плавність зміни висоти та реакцію на тягу.",
    );
  }

  if (typeof maxAcceleration === "number" && maxAcceleration > 20) {
    recommendations.push(
      "Перевірте калібрування IMU та PID-настройки: піки прискорення виглядають надто різкими.",
    );
  } else if (typeof maxAcceleration === "number" && maxAcceleration > 9) {
    recommendations.push(
      "Зафіксовано активні прискорення: оцініть, чи не занадто різко змінюється тяга або курс.",
    );
  }

  if (typeof maxAltitudeGain === "number" && maxAltitudeGain < 3) {
    recommendations.push(
      "Місія майже не набирала висоту: якщо це не тестовий політ, перевірте задачу місії та обмеження по throttle.",
    );
  }

  if (!recommendations.length) {
    recommendations.push(
      "Профіль польоту виглядає стабільним; для поглибленого аналізу звірте 3D-траєкторію з часовим профілем швидкості.",
    );
  }

  return recommendations.slice(0, 4);
}

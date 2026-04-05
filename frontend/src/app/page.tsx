"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Trajectory3D from "../components/Trajectory3D";

const TrajectoryMap = dynamic(() => import("../components/TrajectoryMap"), {
  ssr: false,
});

type Metrics = {
  duration_s?: number;
  total_distance_m?: number;
  max_horizontal_speed_mps?: number;
  max_vertical_speed_mps?: number;
  max_acceleration_mps2?: number;
  max_altitude_gain_m?: number;
};

type TrajectoryPoint = {
  timestamp_s?: number;
  latitude_deg: number;
  longitude_deg: number;
  altitude_m?: number;
  relative_altitude_m?: number;
  east_m?: number;
  north_m?: number;
  up_m?: number;
  speed_mps?: number;
};

type ParsedPayload = {
  sampling_hz?: {
    gps?: number;
    imu?: number;
  };
  units?: {
    gps?: Record<string, string>;
    imu?: Record<string, string>;
  };
};

type AnalyzeResponse = {
  filename?: string;
  message_count?: number;
  metrics?: Metrics & { error?: string };
  trajectory_enu?: TrajectoryPoint[];
  plotly_figure?: Record<string, unknown>;
  parsed?: ParsedPayload;
};

type SummaryResponse = {
  provider: string;
  summary: string;
  recommendations?: string[];
  risk_level?: "low" | "medium" | "high";
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8501";
const CARD_BASE =
  "group relative overflow-hidden rounded-2xl border border-line/70 bg-[linear-gradient(165deg,rgba(255,253,248,0.96)_0%,rgba(242,235,226,0.92)_100%)] p-4 shadow-[0_12px_30px_rgba(27,35,33,0.08)] backdrop-blur-sm transition-transform duration-300 hover:-translate-y-0.5";

const sectionAnimation = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

function formatNumber(value: number | undefined, digits = 2): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: digits,
  }).format(value);
}

function metricValue(
  value: number | undefined,
  suffix: string,
  digits = 2,
): string {
  const formatted = formatNumber(value, digits);
  if (formatted === "-") {
    return formatted;
  }
  return `${formatted} ${suffix}`;
}

function labelValue(value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") {
    return "—";
  }
  return String(value);
}

function formatBytes(bytes: number | undefined): string {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return "—";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${formatNumber(size, 1)} ${units[unitIndex]}`;
}

function formatCoordinate(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return value.toFixed(4);
}

function classifyFlightStyle(maxSpeed?: number, maxAccel?: number) {
  if (typeof maxSpeed !== "number" && typeof maxAccel !== "number") {
    return {
      label: "Невідомо",
      description: "Стиль визначиться після аналізу",
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
      description: "Активний профіль польоту",
    };
  }
  return {
    label: "Плавний",
    description: "Стабільна траєкторія без різких змін",
  };
}

function riskLevelLabel(riskLevel?: "low" | "medium" | "high") {
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

function deriveRiskLevel(
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

function derivePilotRecommendations(metrics?: Metrics | null): string[] {
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
  } else if (typeof maxHorizontalSpeed === "number" && maxHorizontalSpeed > 18) {
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

export default function Home() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [activeView, setActiveView] = useState<"map" | "threeD">("map");
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [easterTaps, setEasterTaps] = useState<number[]>([]);
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  const trajectoryTimeline = useMemo(() => {
    const raw = result?.trajectory_enu ?? [];
    return raw
      .filter(
        (point) =>
          typeof point.timestamp_s === "number" &&
          typeof point.latitude_deg === "number" &&
          typeof point.longitude_deg === "number",
      )
      .map((point) => ({
        ...point,
        timestamp_s: point.timestamp_s as number,
      }))
      .sort((a, b) => (a.timestamp_s as number) - (b.timestamp_s as number));
  }, [result]);

  const metrics = result?.metrics;
  const analysisReady = Boolean(result && !loading);
  const telemetryOk = Boolean(result && !metrics?.error);
  const hasTrajectory = trajectoryTimeline.length > 1;
  const pilotRecommendations = summary?.recommendations?.length
    ? summary.recommendations
    : derivePilotRecommendations(metrics);
  const pilotRiskLevel = summary?.risk_level ?? deriveRiskLevel(metrics) ?? undefined;

  const mapPoints = useMemo(
    () =>
      trajectoryTimeline.map(
        (point) =>
          [point.latitude_deg, point.longitude_deg] as [number, number],
      ),
    [trajectoryTimeline],
  );

  const timeRange = useMemo(() => {
    if (!trajectoryTimeline.length) {
      return null;
    }
    return {
      min: trajectoryTimeline[0].timestamp_s as number,
      max: trajectoryTimeline[trajectoryTimeline.length - 1]
        .timestamp_s as number,
    };
  }, [trajectoryTimeline]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem("joludi_auth");
      if (!raw) {
        setIsAuthorized(false);
        return;
      }
      const parsed = JSON.parse(raw) as {
        session?: { access_token?: string | null } | null;
      };
      setIsAuthorized(Boolean(parsed?.session?.access_token));
    } catch {
      setIsAuthorized(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem("joludi_history_view");
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as AnalyzeResponse | null;
      if (parsed) {
        setResult(parsed);
        setChatMessages([]);
        setChatInput("");
        void fetchPilotSummary(parsed);
        setError(null);
      }
    } catch {
      // Ignore malformed history view payloads.
    }
  }, []);

  async function handleLogout() {
    if (typeof window === "undefined") {
      return;
    }

    setLogoutLoading(true);
    try {
      const raw = window.localStorage.getItem("joludi_auth");
      const stored = raw
        ? (JSON.parse(raw) as {
          session?: { refresh_token?: string | null } | null;
        })
        : null;

      const refreshToken = stored?.session?.refresh_token;
      if (refreshToken) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      }
    } catch {
      // Ignore logout API or storage parsing failures and clear the local session anyway.
    } finally {
      window.localStorage.removeItem("joludi_auth");
      window.localStorage.removeItem("joludi_history_view");
      setIsAuthorized(false);
      setLogoutLoading(false);
    }
  }

  function readAccessToken(): string | null {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const raw = window.localStorage.getItem("joludi_auth");
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as {
        session?: { access_token?: string | null } | null;
      };
      return parsed?.session?.access_token ?? null;
    } catch {
      return null;
    }
  }

  async function fetchPilotSummary(data: AnalyzeResponse) {
    if (data.metrics?.error) {
      setSummary(null);
      return;
    }

    try {
      const summaryResponse = await fetch(`${API_BASE}/api/ai/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: data }),
      });

      if (summaryResponse.ok) {
        const summaryData = (await summaryResponse.json()) as SummaryResponse;
        setSummary({
          ...summaryData,
          recommendations:
            summaryData.recommendations?.length
              ? summaryData.recommendations
              : derivePilotRecommendations(data.metrics),
          risk_level: summaryData.risk_level ?? deriveRiskLevel(data.metrics) ?? undefined,
        });
        return;
      }
    } catch {
      setSummary({
        provider: "fallback",
        summary:
          "Не вдалося отримати AI-висновок, тому рекомендації згенеровано локально з метрик.",
        recommendations: derivePilotRecommendations(data.metrics),
        risk_level: deriveRiskLevel(data.metrics) ?? undefined,
      });
    }
  }

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result || !chatInput.trim() || chatLoading) {
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: chatInput.trim() };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: result, messages: nextMessages }),
      });

      if (!response.ok) {
        throw new Error(`AI chat request failed: ${response.status}`);
      }

      const data = (await response.json()) as { provider?: string; reply?: string };
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            data.reply ??
            "Не вдалося отримати відповідь від AI. Спробуйте поставити питання ще раз.",
        },
      ]);
    } catch {
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            "Не вдалося зв'язатися з AI-коучем. Перевір модель, API ключ або endpoint.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  useEffect(() => {
    if (!timeRange) {
      setCurrentTime(null);
      setIsPlaying(false);
      return;
    }
    setCurrentTime(timeRange.min);
    setIsPlaying(false);
  }, [timeRange?.min, timeRange?.max]);

  useEffect(() => {
    if (!isPlaying || !timeRange) {
      return;
    }

    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        const start = timeRange.min;
        const end = timeRange.max;
        const baseline = prev ?? start;
        const next = baseline + 0.1 * playbackSpeed;
        if (next >= end) {
          window.clearInterval(interval);
          setIsPlaying(false);
          return end;
        }
        return next;
      });
    }, 100);

    return () => window.clearInterval(interval);
  }, [isPlaying, playbackSpeed, timeRange?.min, timeRange?.max]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSummary(null);
    setChatMessages([]);
    setChatInput("");

    if (!file) {
      setError("Оберіть .bin файл перед аналізом.");
      return;
    }

    setLoading(true);
    try {
      const body = new FormData();
      body.append("file", file);

      const accessToken = readAccessToken();
      const headers: HeadersInit = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers,
        body,
      });

      if (!response.ok) {
        throw new Error(`Помилка API: ${response.status}`);
      }

      const data = (await response.json()) as AnalyzeResponse;
      setResult(data);

      if (data.metrics?.error) {
        setError(data.metrics.error);
      } else {
        await fetchPilotSummary(data);
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Не вдалося виконати аналіз.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const flightStyle = classifyFlightStyle(
    metrics?.max_horizontal_speed_mps,
    metrics?.max_acceleration_mps2,
  );

  const metricCards = [
    {
      label: "Тривалість місії",
      value: formatNumber(metrics?.duration_s, 1),
      unit: "s",
      description: "від старту до фінішу",
    },
    {
      label: "Пройдена дистанція",
      value: formatNumber(metrics?.total_distance_m, 1),
      unit: "m",
      description: "сумарна довжина треку",
    },
    {
      label: "Макс. гориз. швидкість",
      value: formatNumber(metrics?.max_horizontal_speed_mps, 1),
      unit: "m/s",
      description: "пікова горизонтальна швидкість",
    },
    {
      label: "Макс. вертикальна",
      value: formatNumber(metrics?.max_vertical_speed_mps, 1),
      unit: "m/s",
      description: "пікова швидкість набору або зниження",
    },
    {
      label: "Макс. прискорення",
      value: formatNumber(metrics?.max_acceleration_mps2, 1),
      unit: "m/s^2",
      description: "максимальний імпульс",
    },
    {
      label: "Макс. набір висоти",
      value: formatNumber(metrics?.max_altitude_gain_m, 1),
      unit: "m",
      description: "найвища точка місії",
    },
  ];

  const overviewCards = [
    {
      label: "Файл",
      value: labelValue(result?.filename ?? file?.name),
      tone: "bg-brand/10 text-brand-ink",
    },
    {
      label: "Розмір",
      value: file ? formatBytes(file.size) : "—",
      tone: "bg-surface-soft text-foreground/65",
    },
    {
      label: "Повідомлень",
      value: formatNumber(result?.message_count, 0),
      tone: "bg-accent/20 text-accent-ink",
    },
    {
      label: "GPS точки",
      value: result ? formatNumber(trajectoryTimeline.length, 0) : "—",
      tone: "bg-brand/10 text-brand-ink",
    },
  ];

  const statusPills = [
    {
      label: loading
        ? "Парсинг логу"
        : analysisReady
          ? "Аналіз готовий"
          : "Очікує лог",
      tone:
        loading || analysisReady
          ? "bg-brand/15 text-brand-ink"
          : "bg-surface-soft text-foreground/55",
    },
    {
      label: metrics?.error
        ? "GPS фільтрація"
        : telemetryOk
          ? "Телеметрія чиста"
          : "Телеметрія очікує",
      tone: metrics?.error
        ? "bg-accent/20 text-accent-ink"
        : telemetryOk
          ? "bg-brand/10 text-brand-ink"
          : "bg-surface-soft text-foreground/55",
    },
    {
      label: summary
        ? summary.provider === "llm"
          ? "AI live"
          : "AI fallback"
        : "AI idle",
      tone: summary
        ? "bg-brand/10 text-brand-ink"
        : "bg-surface-soft text-foreground/55",
    },
    {
      label: hasTrajectory ? "Трек готовий" : "Трек відсутній",
      tone: hasTrajectory
        ? "bg-brand/10 text-brand-ink"
        : "bg-surface-soft text-foreground/55",
    },
  ];

  const checklistItems = [
    {
      label: "Лог завантажено",
      status: file ? "ok" : "idle",
    },
    {
      label: "Парсинг завершено",
      status: analysisReady ? (metrics?.error ? "warn" : "ok") : "idle",
    },
    {
      label: "Траєкторія побудована",
      status: hasTrajectory ? "ok" : "idle",
    },
    {
      label: "AI резюме",
      status: summary ? "ok" : "idle",
    },
  ];

  const insightCards = [
    {
      label: "Стан телеметрії",
      value: telemetryOk
        ? "Чисто"
        : metrics?.error
          ? "Фільтрація"
          : "Очікує лог",
      description: metrics?.error
        ? "Знайдено GPS-аномалії, застосовано фільтр"
        : telemetryOk
          ? "Сигнал стабільний, без різких стрибків"
          : "Дані з'являться після завантаження",
    },
    {
      label: "Стиль польоту",
      value: flightStyle.label,
      description: flightStyle.description,
    },
    {
      label: "GPS точки",
      value: result ? formatNumber(trajectoryTimeline.length, 0) : "—",
      description: hasTrajectory
        ? "Кадри траєкторії в треку"
        : "Трек ще не сформований",
    },
    {
      label: "Підйом",
      value: metricValue(metrics?.max_altitude_gain_m, "m", 1),
      description: "Максимальний набір висоти",
    },
  ];

  const heroHighlights = [
    {
      title: "Смарт-парсинг",
      description: "Нормалізація GPS і фільтр аномалій у реальному часі",
    },
    {
      title: "Mission timeline",
      description: "Керування відтворенням і фокус на активній точці",
    },
    {
      title: "OSM + 3D",
      description: "Перемикай перегляд без втрати контексту",
    },
  ];

  const playbackDuration = timeRange
    ? Math.max(0, timeRange.max - timeRange.min)
    : 0;
  const elapsedTime =
    timeRange && currentTime !== null
      ? Math.max(0, currentTime - timeRange.min)
      : 0;

  const activeIndex = useMemo(() => {
    if (!trajectoryTimeline.length || currentTime === null) {
      return -1;
    }
    let low = 0;
    let high = trajectoryTimeline.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midTime = trajectoryTimeline[mid].timestamp_s as number;
      if (midTime <= currentTime) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return Math.max(0, low - 1);
  }, [trajectoryTimeline, currentTime]);

  const activePoint = activeIndex >= 0 ? trajectoryTimeline[activeIndex] : null;
  const activeAltitudeMsl = activePoint?.altitude_m ?? activePoint?.up_m;
  const mapMeta = activePoint
    ? {
      time_s: elapsedTime,
      speed_mps: activePoint.speed_mps,
      altitude_m: activeAltitudeMsl,
    }
    : null;

  const telemetryCards = [
    {
      label: "GPS sampling",
      value: metricValue(result?.parsed?.sampling_hz?.gps, "Hz", 1),
      description: "частота GPS повідомлень",
    },
    {
      label: "IMU sampling",
      value: metricValue(result?.parsed?.sampling_hz?.imu, "Hz", 1),
      description: "частота IMU повідомлень",
    },
    {
      label: "Позиція",
      value: activePoint
        ? `${formatCoordinate(activePoint.latitude_deg)}, ${formatCoordinate(activePoint.longitude_deg)}`
        : "—",
      description: "координати поточного кадру",
    },
    {
      label: "Швидкість",
      value: metricValue(activePoint?.speed_mps, "m/s", 1),
      description: "швидкість у поточному кадрі",
    },
    {
      label: "Висота над рівнем моря",
      value: metricValue(activeAltitudeMsl, "m", 1),
      description: "MSL висота за GPS",
    },
    {
      label: "Elapsed",
      value: `${formatNumber(elapsedTime, 1)} s`,
      description: "час від старту",
    },
  ];

  const snapshotCards = [
    {
      label: "Speed",
      value: metricValue(activePoint?.speed_mps, "m/s", 1),
    },
    {
      label: "Altitude (MSL)",
      value: metricValue(activeAltitudeMsl, "m", 1),
    },
    {
      label: "Elapsed",
      value: `${formatNumber(elapsedTime, 1)} s`,
    },
  ];

  function handleSecretTap(
    event: React.MouseEvent<HTMLSpanElement, MouseEvent>,
  ) {
    if (!event.altKey || !event.shiftKey) {
      return;
    }

    const now = Date.now();
    setEasterTaps((current) => {
      const recent = current.filter((stamp) => now - stamp < 1200);
      const next = [...recent, now];
      if (next.length >= 4) {
        setShowEasterEgg(true);
        return [];
      }
      return next;
    });
  }

  useEffect(() => {
    if (!showEasterEgg) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowEasterEgg(false);
    }, 12000);

    return () => window.clearTimeout(timeoutId);
  }, [showEasterEgg]);

  return (
    <main className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-[radial-gradient(60%_90%_at_50%_10%,rgba(11,93,87,0.22),transparent)]" />
      <div className="pointer-events-none absolute left-0 top-24 -z-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(208,138,75,0.18),transparent_65%)] blur-2xl" />
      <div className="pointer-events-none absolute right-0 top-56 -z-10 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(11,93,87,0.14),transparent_65%)] blur-2xl" />

      <motion.header
        className="relative grid gap-6 overflow-hidden rounded-[2.5rem] border border-line/60 bg-[linear-gradient(145deg,rgba(255,253,248,0.92)_0%,rgba(242,235,226,0.88)_100%)] p-6 shadow-[0_28px_70px_rgba(27,35,33,0.12)] backdrop-blur-sm md:grid-cols-[1.2fr_0.8fr] md:p-8"
        initial="hidden"
        animate="visible"
        variants={sectionAnimation}
        transition={{ duration: 0.45 }}
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="inline-flex w-fit rounded-full border border-brand/20 bg-brand/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-ink">
              Mission Control
            </p>
            <span
              onClick={handleSecretTap}
              className="rounded-full border border-line/70 bg-surface/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-foreground/55"
            >
              Telemetry Deck
            </span>
            {isAuthorized ? (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/history"
                  className="inline-flex items-center rounded-full border border-brand/20 bg-brand px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-brand-ink"
                >
                  Історія
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={logoutLoading}
                  className="inline-flex items-center rounded-full border border-accent/25 bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {logoutLoading ? "Вихід..." : "Logout"}
                </button>
              </div>
            ) : (
              <Link
                href="/auth"
                className="inline-flex items-center rounded-full border border-brand/20 bg-brand px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-brand-ink"
              >
                Авторизація
              </Link>
            )}
          </div>
          <h1 className="text-3xl font-semibold leading-tight text-foreground md:text-4xl">
            Система аналізу телеметрії та 3D-візуалізації польотів БПЛА
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-foreground/75 md:text-base">
            Автоматичний розбір Ardupilot логів, миттєвий розрахунок метрик,
            анімована OpenStreetMap-траєкторія та ENU 3D-перегляд для аналізу
            місії.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {heroHighlights.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-line/60 bg-surface/80 p-3 shadow-[0_8px_20px_rgba(27,35,33,0.08)]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/55">
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-foreground/65">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {statusPills.map((pill) => (
              <span
                key={pill.label}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${pill.tone}`}
              >
                {pill.label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-[1.5rem] border border-line/70 bg-surface/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">
              Backend Endpoint
            </p>
            <p className="mt-2 break-all font-mono text-sm text-brand-ink">
              {API_BASE}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              {overviewCards.map((card) => (
                <div
                  key={card.label}
                  className={`rounded-xl border border-line/60 px-3 py-2 ${card.tone}`}
                >
                  <p className="opacity-70">{card.label}</p>
                  <p className="mt-1 font-semibold">{card.value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-line/70 bg-surface/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">
                Live snapshot
              </p>
              <span className="text-xs text-foreground/40">
                Syncs with playback
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              {snapshotCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-line/60 bg-surface px-3 py-2"
                >
                  <p className="text-[11px] uppercase tracking-[0.12em] text-foreground/45">
                    {card.label}
                  </p>
                  <p className="mt-1 font-semibold text-foreground">
                    {card.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.header>

      <motion.section
        className="rounded-3xl border border-line/70 bg-surface/85 p-5 shadow-[0_16px_46px_rgba(27,35,33,0.09)] backdrop-blur-sm md:p-6"
        initial="hidden"
        animate="visible"
        variants={sectionAnimation}
        transition={{ duration: 0.45, delay: 0.05 }}
      >
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <form className="space-y-4" onSubmit={onSubmit}>
            <label
              className={`flex min-h-[170px] cursor-pointer flex-col justify-between rounded-2xl border border-dashed px-4 py-4 text-sm transition ${isDragging
                ? "border-brand/70 bg-brand/10"
                : "border-line/70 bg-surface"
                }`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                const droppedFile = event.dataTransfer.files?.[0];
                if (droppedFile) {
                  setFile(droppedFile);
                }
              }}
            >
              <input
                type="file"
                accept=".bin"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                }}
              />
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line/60 bg-surface-soft text-brand-ink">
                  <svg
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 16V4m0 0l-3.5 3.5M12 4l3.5 3.5"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {file ? file.name : "Перетягни .bin файл сюди"}
                  </p>
                  <p className="mt-1 text-xs text-foreground/55">
                    {file
                      ? `${formatBytes(file.size)} · telemetry log`
                      : "або натисни, щоб обрати файл"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/50">
                <span>Формат: .bin (Ardupilot)</span>
                <span>{isDragging ? "Drop to upload" : "Drag & drop"}</span>
              </div>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(11,93,87,0.35)] transition hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {loading ? "Аналіз і побудова" : "Запустити аналіз"}
              </button>
              {file && !loading && (
                <button
                  type="button"
                  className="h-11 rounded-xl border border-line bg-surface px-4 text-xs font-semibold uppercase tracking-wide text-foreground/60 transition hover:border-brand/40"
                  onClick={() => setFile(null)}
                >
                  Очистити
                </button>
              )}
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
          </form>

          <div className="rounded-2xl border border-line/70 bg-surface/90 p-4 shadow-[0_10px_28px_rgba(27,35,33,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">
              Mission checklist
            </p>
            <div className="mt-3 space-y-2">
              {checklistItems.map((item) => {
                const tone =
                  item.status === "ok"
                    ? "bg-brand"
                    : item.status === "warn"
                      ? "bg-accent"
                      : "bg-line";
                const statusLabel =
                  item.status === "ok"
                    ? "OK"
                    : item.status === "warn"
                      ? "Check"
                      : "Idle";
                return (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-xl border border-line/60 bg-surface px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${tone}`} />
                      <span className="font-semibold text-foreground/75">
                        {item.label}
                      </span>
                    </div>
                    <span className="text-foreground/45">{statusLabel}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-foreground/55">
              Порада: перемикай швидкість відтворення, щоб швидко знайти піки.
            </p>
          </div>
        </div>
      </motion.section>

      {loading && (
        <motion.section
          className="grid gap-3 rounded-3xl border border-line/70 bg-surface/85 p-5 shadow-[0_14px_44px_rgba(20,33,29,0.08)] backdrop-blur-sm md:grid-cols-[0.9fr_1.1fr] md:p-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="space-y-3">
            <div className="h-3 w-28 animate-pulse rounded-full bg-surface-soft" />
            <div className="h-8 w-2/3 animate-pulse rounded-2xl bg-surface-soft" />
            <div className="h-4 w-full animate-pulse rounded-full bg-surface-soft" />
            <div className="h-4 w-5/6 animate-pulse rounded-full bg-surface-soft" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-28 animate-pulse rounded-2xl bg-surface-soft" />
            <div className="h-28 animate-pulse rounded-2xl bg-surface-soft" />
            <div className="h-28 animate-pulse rounded-2xl bg-surface-soft" />
            <div className="h-28 animate-pulse rounded-2xl bg-surface-soft" />
          </div>
        </motion.section>
      )}

      <motion.section
        className="space-y-3"
        initial="hidden"
        animate="visible"
        variants={sectionAnimation}
        transition={{ duration: 0.45, delay: 0.12 }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground md:text-xl">
              Mission metrics
            </h2>
            <p className="text-xs text-foreground/55">
              Ключові показники польоту після обробки логів
            </p>
          </div>
          <span className="rounded-full border border-line/70 bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-foreground/55">
            Metric units
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {metricCards.map((card, index) => (
            <motion.article
              key={card.label}
              className={CARD_BASE}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.14 + index * 0.04 }}
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs uppercase tracking-[0.14em] text-foreground/55">
                  {card.label}
                </p>
                <span className="h-2 w-2 rounded-full bg-brand/50" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-foreground">
                {card.value}
                {card.value !== "-" && (
                  <span className="ml-1 text-xs font-semibold text-foreground/50">
                    {card.unit}
                  </span>
                )}
              </p>
              <p className="mt-2 text-xs text-foreground/55">
                {card.description}
              </p>
            </motion.article>
          ))}
        </div>
      </motion.section>

      <motion.section
        className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]"
        initial="hidden"
        animate="visible"
        variants={sectionAnimation}
        transition={{ duration: 0.45, delay: 0.16 }}
      >
        <div className="rounded-3xl border border-line/70 bg-[linear-gradient(145deg,rgba(255,245,227,0.88)_0%,rgba(255,236,207,0.92)_100%)] p-5 shadow-[0_12px_30px_rgba(122,61,20,0.18)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-ink">
              AI-порадник пілота
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent/40 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-ink">
                {summary ? summary.provider : "standby"}
              </span>
              <span className="rounded-full border border-accent/40 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-ink">
                {riskLevelLabel(pilotRiskLevel)}
              </span>
            </div>
          </div>
          <p className="mt-3 text-sm leading-7 text-amber-950">
            {summary?.summary
              ? summary.summary
              : "AI резюме з'явиться після аналізу. Поки що переглянь метрики та трек для швидкої оцінки польоту."}
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-2xl border border-accent/30 bg-white/65 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-ink/70">
                Основна порада
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-950">
                {pilotRecommendations[0] ?? "Порада з'явиться після аналізу місії."}
              </p>
            </div>
            <div className="rounded-2xl border border-accent/30 bg-white/65 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-ink/70">
                Що перевірити далі
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-950">
                {pilotRecommendations.length > 0 ? (
                  pilotRecommendations.slice(0, 3).map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 h-2 w-2 rounded-full bg-accent-ink/70" />
                      <span>{item}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-amber-950/70">
                    Після аналізу тут з'являться короткі actionable рекомендації.
                  </li>
                )}
              </ul>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink">
            <span className="rounded-full border border-accent/40 bg-white/60 px-3 py-1">
              {telemetryOk ? "Telemetry clean" : "Telemetry review"}
            </span>
            <span className="rounded-full border border-accent/40 bg-white/60 px-3 py-1">
              {hasTrajectory ? "Track ready" : "Track pending"}
            </span>
            <span className="rounded-full border border-accent/40 bg-white/60 px-3 py-1">
              {analysisReady ? "Analysis ready" : "Awaiting data"}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {insightCards.map((card) => (
            <article
              key={card.label}
              className="rounded-2xl border border-line/70 bg-surface/90 p-4 shadow-[0_10px_26px_rgba(27,35,33,0.08)]"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-foreground/45">
                {card.label}
              </p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {card.value}
              </p>
              <p className="mt-1 text-xs leading-5 text-foreground/55">
                {card.description}
              </p>
            </article>
          ))}
        </div>
      </motion.section>

      <motion.section
        className="grid gap-4 rounded-3xl border border-line/70 bg-surface/90 p-5 shadow-[0_16px_48px_rgba(27,35,33,0.1)] backdrop-blur-sm lg:grid-cols-[1.1fr_0.9fr] md:p-6"
        initial="hidden"
        animate="visible"
        variants={sectionAnimation}
        transition={{ duration: 0.45, delay: 0.19 }}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand/75">
                AI coach
              </p>
              <h2 className="mt-2 text-lg font-semibold text-foreground md:text-xl">
                Поговори з AI-тренером
              </h2>
              <p className="mt-1 text-sm text-foreground/60">
                Питай про помилки, ризики, тренування або конкретні маневри. Асистент бачить поточний аналіз місії.
              </p>
            </div>
            <div className="rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-ink">
              {summary ? summary.provider : "standby"}
            </div>
          </div>

          <div className="max-h-[22rem] space-y-3 overflow-y-auto rounded-2xl border border-line/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(248,242,234,0.92)_100%)] p-4">
            {chatMessages.length > 0 ? (
              chatMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}-${message.content.slice(0, 20)}`}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${message.role === "user"
                      ? "bg-brand text-white"
                      : "border border-line/60 bg-surface text-foreground"
                      }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex h-full min-h-[12rem] items-center justify-center rounded-2xl border border-dashed border-line/60 bg-white/50 p-4 text-center text-sm text-foreground/60">
                Напиши перше питання, наприклад: як зменшити ривки по вертикалі або як тренувати плавні розгони.
              </div>
            )}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-line/60 bg-surface px-4 py-3 text-sm text-foreground/60">
                  AI формує відповідь...
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-line/70 bg-surface/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          <form className="space-y-3" onSubmit={sendChatMessage}>
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">
                Твоє питання
              </span>
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                rows={5}
                placeholder="Наприклад: що мені змінити, щоб політ був плавніший?"
                className="w-full resize-none rounded-2xl border border-line/70 bg-surface px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand/50"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!result || chatLoading || !chatInput.trim()}
                className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                {chatLoading ? "Відправляю..." : "Запитати AI"}
              </button>
              <button
                type="button"
                onClick={() => setChatInput("")}
                className="rounded-full border border-line/70 bg-surface px-4 py-2 text-sm font-medium text-foreground/70 transition hover:border-brand/40"
              >
                Очистити
              </button>
            </div>
          </form>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/50">
              Швидкі запити
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                "Як зменшити вертикальні ривки?",
                "Що змінити, щоб політ був плавнішим?",
                "Склади 3 тренування для кращого контролю.",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setChatInput(prompt)}
                  className="rounded-full border border-accent/30 bg-accent/10 px-3 py-2 text-left text-xs font-medium text-accent-ink transition hover:bg-accent/15"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-brand/15 bg-brand/5 p-4 text-sm leading-6 text-foreground/70">
            AI-коуч використовує поточний аналіз місії як контекст. Якщо хочеш, я можу ще додати режим збереження діалогу в history або окремі тренувальні сценарії для пілота.
          </div>
        </div>
      </motion.section>

      <motion.section
        className="grid gap-4 rounded-3xl border border-line/70 bg-surface/85 p-5 shadow-[0_16px_48px_rgba(27,35,33,0.1)] backdrop-blur-sm md:p-6 xl:grid-cols-[1.15fr_0.85fr]"
        initial="hidden"
        animate="visible"
        variants={sectionAnimation}
        transition={{ duration: 0.45, delay: 0.2 }}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground md:text-xl">
                Візуалізація траєкторії
              </h2>
              <p className="text-sm text-foreground/60">
                Контролюй таймлайн, фокусуйся на активній точці та перемикай
                режими.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveView("map")}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeView === "map"
                  ? "bg-brand text-white shadow-[0_10px_22px_rgba(11,93,87,0.3)]"
                  : "border border-line bg-surface text-foreground/75"
                  }`}
              >
                OSM 2D
              </button>
              <button
                type="button"
                onClick={() => setActiveView("threeD")}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeView === "threeD"
                  ? "bg-brand text-white shadow-[0_10px_22px_rgba(11,93,87,0.3)]"
                  : "border border-line bg-surface text-foreground/75"
                  }`}
              >
                3D ENU
              </button>
            </div>
          </div>

          {trajectoryTimeline.length > 1 && timeRange ? (
            <div className="rounded-2xl border border-line/70 bg-surface/90 p-4 shadow-[0_12px_30px_rgba(27,35,33,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-foreground/45">
                    Flight timeline
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    t+{formatNumber(elapsedTime, 1)}s /{" "}
                    {formatNumber(playbackDuration, 1)}s
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPlaying((prev) => !prev)}
                    className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70"
                  >
                    {isPlaying ? "Pause" : "Play"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (timeRange) {
                        setCurrentTime(timeRange.min);
                        setIsPlaying(false);
                      }
                    }}
                    className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <input
                  type="range"
                  min={0}
                  max={playbackDuration}
                  step={0.1}
                  value={elapsedTime}
                  onChange={(event) => {
                    if (!timeRange) {
                      return;
                    }
                    setCurrentTime(timeRange.min + Number(event.target.value));
                    setIsPlaying(false);
                  }}
                  className="w-full"
                  style={{ accentColor: "var(--color-brand)" }}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-foreground/60">
                  <span>Start</span>
                  <div className="flex flex-wrap gap-2">
                    {[0.5, 1, 2, 4].map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setPlaybackSpeed(speed)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${playbackSpeed === speed
                          ? "bg-brand text-white"
                          : "border border-line bg-surface text-foreground/65"
                          }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                  <span>End</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-surface-soft/70 p-4 text-xs text-foreground/60">
              Таймлайн стане доступним після аналізу траєкторії.
            </div>
          )}

          {activeView === "map" && mapPoints.length > 1 ? (
            <motion.div
              key="map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <TrajectoryMap
                points={mapPoints}
                activeIndex={activeIndex}
                activeMeta={mapMeta}
              />
            </motion.div>
          ) : activeView === "threeD" ? (
            <motion.div
              key="3d"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <Trajectory3D
                figure={result?.plotly_figure ?? null}
                activePoint={
                  activePoint &&
                    typeof activePoint.east_m === "number" &&
                    typeof activePoint.north_m === "number" &&
                    typeof activePoint.up_m === "number"
                    ? {
                      east_m: activePoint.east_m,
                      north_m: activePoint.north_m,
                      up_m: activePoint.up_m,
                    }
                    : null
                }
              />
            </motion.div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-surface-soft/70 p-6 text-sm text-foreground/60">
              Після аналізу тут зʼявиться трек польоту.
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {telemetryCards.map((item) => (
            <article
              key={item.label}
              className="rounded-2xl border border-line/70 bg-[linear-gradient(180deg,rgba(255,253,248,0.95)_0%,rgba(242,235,226,0.9)_100%)] p-4 shadow-[0_10px_26px_rgba(27,35,33,0.08)]"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-foreground/45">
                {item.label}
              </p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {item.value}
              </p>
              <p className="mt-1 text-xs leading-5 text-foreground/55">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </motion.section>

      {showEasterEgg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          onClick={() => setShowEasterEgg(false)}
          role="presentation"
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Secret easter egg"
          >
            <Image
              src="/assets/secret-tech-lead.jpg"
              alt="Secret team shot"
              width={900}
              height={1200}
              className="h-auto w-full object-cover"
              priority
            />
            <button
              type="button"
              onClick={() => setShowEasterEgg(false)}
              className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

import {
  clearHistoryView,
  clearStoredAuth,
  getAccessToken,
  getRefreshToken,
  readHistoryView,
} from "@/entities/auth/model/storage";
import {
  classifyFlightStyle,
  derivePilotRecommendations,
  deriveRiskLevel,
} from "@/entities/telemetry/lib/analysis";
import type {
  AnalyzeResponse,
  ChatMessage,
  SummaryResponse,
} from "@/entities/telemetry/model/types";
import {
  analyzeLogFile,
  requestPilotChat,
  requestPilotSummary,
} from "@/features/analysis/api/analysis-api";
import { logoutByRefreshToken } from "@/features/auth/api/auth-api";
import {
  formatBytes,
  formatCoordinate,
  formatNumber,
  labelValue,
  metricValue,
} from "@/shared/lib/formatters";
import { FormEvent, useEffect, useMemo, useState } from "react";

export type ActiveView = "map" | "threeD";

export function useDashboardState() {
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
  const [activeView, setActiveView] = useState<ActiveView>("map");
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [, setEasterTaps] = useState<number[]>([]);
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
  const pilotRiskLevel =
    summary?.risk_level ?? deriveRiskLevel(metrics) ?? undefined;

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
      const token = getAccessToken();
      setIsAuthorized(Boolean(token));
    } catch {
      setIsAuthorized(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const parsed = readHistoryView<AnalyzeResponse>();
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
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        await logoutByRefreshToken(refreshToken);
      }
    } catch {
      // Ignore logout API failures and clear local session anyway.
    } finally {
      clearStoredAuth();
      clearHistoryView();
      setIsAuthorized(false);
      setLogoutLoading(false);
    }
  }

  async function fetchPilotSummary(data: AnalyzeResponse) {
    if (data.metrics?.error) {
      setSummary(null);
      return;
    }

    try {
      const summaryData = await requestPilotSummary(data);
      setSummary({
        ...summaryData,
        recommendations: summaryData.recommendations?.length
          ? summaryData.recommendations
          : derivePilotRecommendations(data.metrics),
        risk_level:
          summaryData.risk_level ?? deriveRiskLevel(data.metrics) ?? undefined,
      });
      return;
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

    const userMessage: ChatMessage = {
      role: "user",
      content: chatInput.trim(),
    };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const reply = await requestPilotChat(result, nextMessages);
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: reply,
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
  }, [timeRange]);

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
  }, [isPlaying, playbackSpeed, timeRange]);

  async function submitLog(event: FormEvent<HTMLFormElement>) {
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
      const data = await analyzeLogFile(file, getAccessToken());
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
        ? "Обробка логу"
        : analysisReady
          ? "Аналіз готовий"
          : "Очікує файл",
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
          ? "AI активний"
          : "AI fallback"
        : "AI очікує",
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

  const checklistItems: Array<{
    label: string;
    status: "ok" | "warn" | "idle";
  }> = [
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
      label: "Статус телеметрії",
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
      label: "Стиль маневру",
      value: flightStyle.label,
      description: flightStyle.description,
    },
    {
      label: "Точки треку",
      value: result ? formatNumber(trajectoryTimeline.length, 0) : "—",
      description: hasTrajectory
        ? "Кадри траєкторії в треку"
        : "Трек ще не сформований",
    },
    {
      label: "Набір висоти",
      value: metricValue(metrics?.max_altitude_gain_m, "m", 1),
      description: "Максимальний набір висоти",
    },
  ];

  const heroHighlights = [
    {
      title: "Rapid debrief",
      description: "Нормалізація GPS і фільтр аномалій у реальному часі",
    },
    {
      title: "Mission timeline",
      description: "Керування відтворенням і фокус на активній точці",
    },
    {
      title: "HUD + 3D",
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
      label: "Частота GPS",
      value: metricValue(result?.parsed?.sampling_hz?.gps, "Hz", 1),
      description: "частота GPS повідомлень",
    },
    {
      label: "Частота IMU",
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
      label: "Висота MSL",
      value: metricValue(activeAltitudeMsl, "m", 1),
      description: "MSL висота за GPS",
    },
    {
      label: "Час",
      value: `${formatNumber(elapsedTime, 1)} s`,
      description: "час від старту",
    },
  ];

  const snapshotCards = [
    {
      label: "Швидкість",
      value: metricValue(activePoint?.speed_mps, "m/s", 1),
    },
    {
      label: "Висота MSL",
      value: metricValue(activeAltitudeMsl, "m", 1),
    },
    {
      label: "Час",
      value: `${formatNumber(elapsedTime, 1)} s`,
    },
  ];

  function handleSecretTap(event: React.MouseEvent<HTMLSpanElement>) {
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

  function setDroppedFile(droppedFile: File | null) {
    setFile(droppedFile);
  }

  function clearSelectedFile() {
    setFile(null);
  }

  function resetTimeline() {
    if (!timeRange) {
      return;
    }

    setCurrentTime(timeRange.min);
    setIsPlaying(false);
  }

  function updateTimelineByElapsed(nextElapsed: number) {
    if (!timeRange) {
      return;
    }

    setCurrentTime(timeRange.min + nextElapsed);
    setIsPlaying(false);
  }

  function getActivePoint3D(): {
    east_m: number;
    north_m: number;
    up_m: number;
  } | null {
    if (
      !activePoint ||
      typeof activePoint.east_m !== "number" ||
      typeof activePoint.north_m !== "number" ||
      typeof activePoint.up_m !== "number"
    ) {
      return null;
    }

    return {
      east_m: activePoint.east_m,
      north_m: activePoint.north_m,
      up_m: activePoint.up_m,
    };
  }

  return {
    isAuthorized,
    logoutLoading,
    file,
    loading,
    error,
    result,
    summary,
    chatMessages,
    chatInput,
    chatLoading,
    activeView,
    currentTime,
    isPlaying,
    playbackSpeed,
    isDragging,
    showEasterEgg,
    trajectoryTimeline,
    metrics,
    analysisReady,
    telemetryOk,
    hasTrajectory,
    pilotRecommendations,
    pilotRiskLevel,
    mapPoints,
    timeRange,
    flightStyle,
    metricCards,
    overviewCards,
    statusPills,
    checklistItems,
    insightCards,
    heroHighlights,
    playbackDuration,
    elapsedTime,
    activeIndex,
    activePoint,
    mapMeta,
    telemetryCards,
    snapshotCards,
    handleLogout,
    sendChatMessage,
    submitLog,
    setChatInput,
    setActiveView,
    setIsPlaying,
    setPlaybackSpeed,
    setIsDragging,
    handleSecretTap,
    setShowEasterEgg,
    setDroppedFile,
    clearSelectedFile,
    resetTimeline,
    updateTimelineByElapsed,
    getActivePoint3D,
  };
}

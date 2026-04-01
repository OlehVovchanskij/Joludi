"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
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
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8501";
const CARD_BASE =
  "rounded-2xl border border-line/70 bg-surface/90 p-4 shadow-[0_8px_32px_rgba(20,33,29,0.07)] backdrop-blur-sm transition-transform duration-300 hover:-translate-y-0.5";

const sectionAnimation = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

function metricValue(value: number | undefined, suffix: string): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return `${value.toFixed(2)} ${suffix}`;
}

function labelValue(value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") {
    return "—";
  }
  return String(value);
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [activeView, setActiveView] = useState<"map" | "threeD">("map");
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

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

  const mapPoints = useMemo(
    () => trajectoryTimeline.map((point) => [point.latitude_deg, point.longitude_deg] as [number, number]),
    [trajectoryTimeline],
  );

  const timeRange = useMemo(() => {
    if (!trajectoryTimeline.length) {
      return null;
    }
    return {
      min: trajectoryTimeline[0].timestamp_s as number,
      max: trajectoryTimeline[trajectoryTimeline.length - 1].timestamp_s as number,
    };
  }, [trajectoryTimeline]);

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

    if (!file) {
      setError("Оберіть .bin файл перед аналізом.");
      return;
    }

    setLoading(true);
    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
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
        try {
          const summaryResponse = await fetch(`${API_BASE}/api/ai/summary`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ analysis: data }),
          });

          if (summaryResponse.ok) {
            const summaryData = (await summaryResponse.json()) as SummaryResponse;
            setSummary(summaryData);
          }
        } catch {
          setSummary(null);
        }
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

  const metrics = result?.metrics;
  const analysisReady = Boolean(result && !loading);
  const metricCards = [
    { label: "Тривалість", value: metricValue(metrics?.duration_s, "s") },
    { label: "Дистанція", value: metricValue(metrics?.total_distance_m, "m") },
    {
      label: "Макс. горизонтальна швидкість",
      value: metricValue(metrics?.max_horizontal_speed_mps, "m/s"),
    },
    {
      label: "Макс. вертикальна швидкість",
      value: metricValue(metrics?.max_vertical_speed_mps, "m/s"),
    },
    {
      label: "Макс. прискорення",
      value: metricValue(metrics?.max_acceleration_mps2, "m/s^2"),
    },
    {
      label: "Макс. набір висоти",
      value: metricValue(metrics?.max_altitude_gain_m, "m"),
    },
  ];

  const overviewCards = [
    {
      label: "Файл",
      value: labelValue(result?.filename ?? file?.name),
      tone: "bg-brand/10 text-brand-ink",
    },
    {
      label: "Повідомлень",
      value: labelValue(result?.message_count),
      tone: "bg-amber-100 text-amber-900",
    },
    {
      label: "GPS sampling",
      value: metricValue(result?.parsed?.sampling_hz?.gps, "Hz"),
      tone: "bg-emerald-100 text-emerald-900",
    },
    {
      label: "IMU sampling",
      value: metricValue(result?.parsed?.sampling_hz?.imu, "Hz"),
      tone: "bg-sky-100 text-sky-900",
    },
  ];

  const statusPills = [
    { label: loading ? "Processing" : analysisReady ? "Ready" : "Idle", active: true },
    { label: result?.metrics?.error ? "GPS issue" : "Telemetry OK", active: !result?.metrics?.error },
    { label: summary?.provider === "llm" ? "AI enabled" : "AI fallback", active: Boolean(summary) },
  ];

  const playbackDuration = timeRange ? Math.max(0, timeRange.max - timeRange.min) : 0;
  const elapsedTime = currentTime && timeRange ? Math.max(0, currentTime - timeRange.min) : 0;

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

  return (
    <main className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-[radial-gradient(60%_90%_at_50%_10%,rgba(15,118,110,0.18),transparent)]" />
      <div className="pointer-events-none absolute left-0 top-24 -z-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(201,114,59,0.16),transparent_65%)] blur-2xl" />
      <div className="pointer-events-none absolute right-0 top-56 -z-10 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(15,118,110,0.12),transparent_65%)] blur-2xl" />

      <motion.header
        className="grid gap-4 rounded-[2rem] border border-line/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.86)_0%,rgba(237,243,239,0.74)_100%)] p-6 shadow-[0_20px_60px_rgba(20,33,29,0.08)] backdrop-blur-sm md:grid-cols-[1.15fr_0.85fr] md:p-8"
        initial="hidden"
        animate="visible"
        variants={sectionAnimation}
        transition={{ duration: 0.45 }}
      >
        <div className="space-y-4">
          <p className="inline-flex w-fit rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-ink">
            UAV Mission Intelligence
          </p>
          <h1 className="text-3xl font-bold leading-tight text-foreground md:text-4xl">
            Система аналізу телеметрії та 3D-візуалізації польотів БПЛА
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-foreground/75 md:text-base">
            Автоматичний розбір Ardupilot логів, миттєвий розрахунок метрик,
            анімована OpenStreetMap-траєкторія та ENU 3D-перегляд для аналізу місії.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {statusPills.map((pill) => (
              <span
                key={pill.label}
                className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${
                  pill.active
                    ? "bg-brand/10 text-brand-ink"
                    : "bg-surface-soft text-foreground/55"
                }`}
              >
                {pill.label}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-line/70 bg-surface/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Backend Endpoint
          </p>
          <p className="mt-2 break-all font-mono text-sm text-brand-ink">{API_BASE}</p>
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
      </motion.header>

      <motion.section
        className="rounded-3xl border border-line/70 bg-surface/85 p-5 shadow-[0_14px_44px_rgba(20,33,29,0.08)] backdrop-blur-sm md:p-6"
        initial="hidden"
        animate="visible"
        variants={sectionAnimation}
        transition={{ duration: 0.45, delay: 0.05 }}
      >
        <form
          className="flex flex-col gap-4 md:flex-row md:items-end"
          onSubmit={onSubmit}
        >
          <label className="flex-1 text-sm font-medium text-foreground/80">
            Log file (.bin)
            <input
              type="file"
              accept=".bin"
              className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="h-11 rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-[0_8px_26px_rgba(15,118,110,0.35)] transition hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Аналіз і побудова..." : "Запустити аналіз"}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
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
        className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6"
        initial="hidden"
        animate="visible"
        variants={sectionAnimation}
        transition={{ duration: 0.45, delay: 0.12 }}
      >
        {metricCards.map((card, index) => (
          <motion.article
            key={card.label}
            className={CARD_BASE}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.14 + index * 0.04 }}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs uppercase tracking-wide text-foreground/55">{card.label}</p>
              <span className="h-2 w-2 rounded-full bg-brand/50" />
            </div>
            <p className="mt-3 text-xl font-bold text-foreground">{card.value}</p>
          </motion.article>
        ))}
      </motion.section>

      {summary?.summary && (
        <motion.section
          className="rounded-2xl border border-amber-300/70 bg-[linear-gradient(135deg,#fff5df_0%,#ffeccf_100%)] p-5 shadow-[0_10px_28px_rgba(117,77,16,0.15)]"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
            AI Summary ({summary.provider})
          </p>
          <p className="mt-2 text-sm leading-7 text-amber-950">{summary.summary}</p>
        </motion.section>
      )}

      <motion.section
        className="grid gap-4 rounded-3xl border border-line/70 bg-surface/85 p-5 shadow-[0_14px_44px_rgba(20,33,29,0.08)] backdrop-blur-sm md:p-6 xl:grid-cols-[1.15fr_0.85fr]"
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
                Перемикайся між картою та 3D-моделлю без втрати контексту.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveView("map")}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeView === "map"
                    ? "bg-brand text-white shadow-[0_8px_18px_rgba(15,118,110,0.32)]"
                    : "border border-line bg-surface text-foreground/75"
                }`}
              >
                OSM 2D
              </button>
              <button
                type="button"
                onClick={() => setActiveView("threeD")}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeView === "threeD"
                    ? "bg-brand text-white shadow-[0_8px_18px_rgba(15,118,110,0.32)]"
                    : "border border-line bg-surface text-foreground/75"
                }`}
              >
                3D ENU
              </button>
            </div>
          </div>

            {trajectoryTimeline.length > 1 && timeRange ? (
              <div className="rounded-2xl border border-line/70 bg-surface/90 p-4 shadow-[0_12px_30px_rgba(20,33,29,0.08)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-foreground/45">Flight timeline</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      t+{elapsedTime.toFixed(1)}s / {playbackDuration.toFixed(1)}s
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPlaying((prev) => !prev)}
                      className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground/70"
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
                      className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground/70"
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
                    className="w-full accent-emerald-600"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-foreground/60">
                    <span>Start</span>
                    <div className="flex flex-wrap gap-2">
                      {[0.5, 1, 2, 4].map((speed) => (
                        <button
                          key={speed}
                          type="button"
                          onClick={() => setPlaybackSpeed(speed)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            playbackSpeed === speed
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
                <TrajectoryMap points={mapPoints} activeIndex={activeIndex} />
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
          {[
            {
              label: "GPS sampling",
              value: metricValue(result?.parsed?.sampling_hz?.gps, "Hz"),
              description: "частота семплювання GPS повідомлень",
            },
            {
              label: "IMU sampling",
              value: metricValue(result?.parsed?.sampling_hz?.imu, "Hz"),
              description: "частота семплювання IMU повідомлень",
            },
            {
              label: "Records",
              value: labelValue(result?.message_count),
              description: "кількість зчитаних повідомлень",
            },
            {
              label: "Visualization",
              value: activeView === "map" ? "OSM 2D" : "3D ENU",
              description: "активний режим перегляду",
            },
            {
              label: "Current point",
              value: activePoint
                ? `${activePoint.latitude_deg.toFixed(4)}, ${activePoint.longitude_deg.toFixed(4)}`
                : "—",
              description: "координати поточного кадру",
            },
            {
              label: "Elapsed",
              value: `${elapsedTime.toFixed(1)}s`,
              description: "час від старту",
            },
          ].map((item) => (
            <article key={item.label} className="rounded-2xl border border-line/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.9)_0%,rgba(237,243,239,0.78)_100%)] p-4 shadow-[0_10px_26px_rgba(20,33,29,0.06)]">
              <p className="text-xs uppercase tracking-[0.12em] text-foreground/45">{item.label}</p>
              <p className="mt-2 text-xl font-bold text-foreground">{item.value}</p>
              <p className="mt-1 text-xs leading-5 text-foreground/55">{item.description}</p>
            </article>
          ))}
        </div>
      </motion.section>
    </main>
  );
}

import Trajectory3D from "@/components/Trajectory3D";
import { formatNumber } from "@/shared/lib/formatters";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import type { ActiveView } from "../model/use-dashboard-state";

const TrajectoryMap = dynamic(() => import("@/components/TrajectoryMap"), {
  ssr: false,
});

type TelemetryCard = {
  label: string;
  value: string;
  description: string;
};

type DashboardTrackSectionProps = {
  sectionAnimation: {
    hidden: { opacity: number; y: number };
    visible: { opacity: number; y: number };
  };
  activeView: ActiveView;
  trajectoryTimelineLength: number;
  timeRange: { min: number; max: number } | null;
  elapsedTime: number;
  playbackDuration: number;
  playbackSpeed: number;
  isPlaying: boolean;
  mapPoints: Array<[number, number]>;
  activeIndex: number;
  mapMeta: { time_s: number; speed_mps?: number; altitude_m?: number } | null;
  plotlyFigure: Record<string, unknown> | null;
  activePoint3D: { east_m: number; north_m: number; up_m: number } | null;
  telemetryCards: TelemetryCard[];
  onChangeView: (view: ActiveView) => void;
  onTogglePlay: () => void;
  onResetTimeline: () => void;
  onChangeTimeline: (elapsed: number) => void;
  onChangePlaybackSpeed: (speed: number) => void;
};

export function DashboardTrackSection({
  sectionAnimation,
  activeView,
  trajectoryTimelineLength,
  timeRange,
  elapsedTime,
  playbackDuration,
  playbackSpeed,
  isPlaying,
  mapPoints,
  activeIndex,
  mapMeta,
  plotlyFigure,
  activePoint3D,
  telemetryCards,
  onChangeView,
  onTogglePlay,
  onResetTimeline,
  onChangeTimeline,
  onChangePlaybackSpeed,
}: DashboardTrackSectionProps) {
  return (
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
              Tactical track
            </h2>
            <p className="text-sm text-foreground/60">
              Контролюй таймлайн, фокусуйся на активній точці та перемикай
              режими.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChangeView("map")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeView === "map"
                  ? "bg-brand text-white shadow-[0_10px_22px_rgba(11,93,87,0.3)]"
                  : "border border-line bg-surface text-foreground/75"
              }`}
            >
              OSM 2D
            </button>
            <button
              type="button"
              onClick={() => onChangeView("threeD")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeView === "threeD"
                  ? "bg-brand text-white shadow-[0_10px_22px_rgba(11,93,87,0.3)]"
                  : "border border-line bg-surface text-foreground/75"
              }`}
            >
              3D ENU
            </button>
          </div>
        </div>

        {trajectoryTimelineLength > 1 && timeRange ? (
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
                  onClick={onTogglePlay}
                  className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70"
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button
                  type="button"
                  onClick={onResetTimeline}
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
                onChange={(event) =>
                  onChangeTimeline(Number(event.target.value))
                }
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
                      onClick={() => onChangePlaybackSpeed(speed)}
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
            <Trajectory3D figure={plotlyFigure} activePoint={activePoint3D} />
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
  );
}

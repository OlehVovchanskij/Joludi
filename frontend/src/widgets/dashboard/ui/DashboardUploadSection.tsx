import { formatBytes } from "@/shared/lib/formatters";
import { motion } from "framer-motion";
import { FormEvent } from "react";

type ChecklistItem = {
  label: string;
  status: "ok" | "warn" | "idle";
};

type DashboardUploadSectionProps = {
  sectionAnimation: {
    hidden: { opacity: number; y: number };
    visible: { opacity: number; y: number };
  };
  file: File | null;
  loading: boolean;
  error: string | null;
  isDragging: boolean;
  checklistItems: ChecklistItem[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSetDragging: (dragging: boolean) => void;
  onSetDroppedFile: (file: File | null) => void;
  onClearFile: () => void;
};

export function DashboardUploadSection({
  sectionAnimation,
  file,
  loading,
  error,
  isDragging,
  checklistItems,
  onSubmit,
  onSetDragging,
  onSetDroppedFile,
  onClearFile,
}: DashboardUploadSectionProps) {
  return (
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
            className={`flex min-h-[170px] cursor-pointer flex-col justify-between rounded-2xl border border-dashed px-4 py-4 text-sm transition ${
              isDragging
                ? "border-brand/70 bg-brand/10"
                : "border-line/70 bg-surface"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              onSetDragging(true);
            }}
            onDragLeave={() => onSetDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              onSetDragging(false);
              const droppedFile = event.dataTransfer.files?.[0];
              onSetDroppedFile(droppedFile ?? null);
            }}
          >
            <input
              type="file"
              accept=".bin"
              className="sr-only"
              onChange={(event) => {
                onSetDroppedFile(event.target.files?.[0] ?? null);
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
                onClick={onClearFile}
              >
                Очистити
              </button>
            )}
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </form>

        <div className="rounded-2xl border border-line/70 bg-surface/90 p-4 shadow-[0_10px_28px_rgba(27,35,33,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">
            Ops checklist
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
  );
}

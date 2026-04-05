import { motion } from "framer-motion";

type InsightCard = {
  label: string;
  value: string;
  description: string;
};

type DashboardAiSummarySectionProps = {
  sectionAnimation: {
    hidden: { opacity: number; y: number };
    visible: { opacity: number; y: number };
  };
  summaryProvider?: string;
  summaryText?: string;
  pilotRiskLabel: string;
  pilotRecommendations: string[];
  telemetryOk: boolean;
  hasTrajectory: boolean;
  analysisReady: boolean;
  insightCards: InsightCard[];
};

export function DashboardAiSummarySection({
  sectionAnimation,
  summaryProvider,
  summaryText,
  pilotRiskLabel,
  pilotRecommendations,
  telemetryOk,
  hasTrajectory,
  analysisReady,
  insightCards,
}: DashboardAiSummarySectionProps) {
  return (
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
            Field analyst
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/40 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-ink">
              {summaryProvider ?? "standby"}
            </span>
            <span className="rounded-full border border-accent/40 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-ink">
              {pilotRiskLabel}
            </span>
          </div>
        </div>
        <p className="mt-3 text-sm leading-7 text-amber-950">
          {summaryText
            ? summaryText
            : "AI резюме з'явиться після аналізу. Поки що переглянь метрики та трек для швидкої оцінки місії."}
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-accent/30 bg-white/65 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-ink/70">
              Primary callout
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-950">
              {pilotRecommendations[0] ??
                "Порада з'явиться після аналізу місії."}
            </p>
          </div>
          <div className="rounded-2xl border border-accent/30 bg-white/65 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-ink/70">
              What to inspect next
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
                  Після аналізу тут з&apos;являться короткі actionable
                  рекомендації.
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
  );
}

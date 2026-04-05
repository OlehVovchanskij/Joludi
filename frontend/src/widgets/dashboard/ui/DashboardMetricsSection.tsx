import { motion } from "framer-motion";

const CARD_BASE =
  "group relative overflow-hidden rounded-[1.75rem] border border-line/65 bg-[linear-gradient(165deg,rgba(255,253,248,0.98)_0%,rgba(242,235,226,0.94)_100%)] p-4 shadow-[0_12px_28px_rgba(27,35,33,0.08)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(27,35,33,0.11)]";

type MetricCard = {
  label: string;
  value: string;
  unit: string;
  description: string;
};

type DashboardMetricsSectionProps = {
  sectionAnimation: {
    hidden: { opacity: number; y: number };
    visible: { opacity: number; y: number };
  };
  metricCards: MetricCard[];
};

export function DashboardMetricsSection({
  sectionAnimation,
  metricCards,
}: DashboardMetricsSectionProps) {
  return (
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
            Recon metrics
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
  );
}

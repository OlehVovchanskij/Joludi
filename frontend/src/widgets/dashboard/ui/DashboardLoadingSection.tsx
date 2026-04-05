import { motion } from "framer-motion";

export function DashboardLoadingSection() {
  return (
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
  );
}

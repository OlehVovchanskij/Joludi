import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

const tacticalVisuals = [
  {
    src: "https://images.pexels.com/photos/32769115/pexels-photo-32769115.jpeg?cs=srgb&dl=pexels-shox-32769115.jpg&fm=jpg",
    alt: "Compact military drone on camouflage gear",
    label: "UAV hardware",
    caption: "Tactical drone platform",
  },
  {
    src: "https://images.pexels.com/photos/32026165/pexels-photo-32026165.jpeg?cs=srgb&dl=pexels-keysi-estrada-2151553493-32026165.jpg&fm=jpg",
    alt: "Futuristic command station with digital displays",
    label: "Command center",
    caption: "Digital operations room",
  },
  {
    src: "https://images.pexels.com/photos/35988355/pexels-photo-35988355.jpeg?cs=srgb&dl=pexels-peter-xie-371876898-35988355.jpg&fm=jpg",
    alt: "Radar tower against a clear sky",
    label: "Radar line",
    caption: "Surveillance and tracking",
  },
];

type StatusPill = {
  label: string;
  tone: string;
};

type OverviewCard = {
  label: string;
  value: string;
  tone: string;
};

type SnapshotCard = {
  label: string;
  value: string;
};

type Highlight = {
  title: string;
  description: string;
};

type DashboardHeroProps = {
  sectionAnimation: {
    hidden: { opacity: number; y: number };
    visible: { opacity: number; y: number };
  };
  isAuthorized: boolean;
  logoutLoading: boolean;
  onLogout: () => void;
  onSecretTap: (event: React.MouseEvent<HTMLSpanElement>) => void;
  heroHighlights: Highlight[];
  statusPills: StatusPill[];
  apiBase: string;
  overviewCards: OverviewCard[];
  snapshotCards: SnapshotCard[];
};

export function DashboardHero({
  sectionAnimation,
  isAuthorized,
  logoutLoading,
  onLogout,
  onSecretTap,
  heroHighlights,
  statusPills,
  apiBase,
  overviewCards,
  snapshotCards,
}: DashboardHeroProps) {
  return (
    <motion.header
      className="relative grid gap-6 overflow-hidden rounded-[2.5rem] border border-line/60 bg-[linear-gradient(145deg,rgba(255,253,248,0.96)_0%,rgba(242,235,226,0.92)_100%)] p-6 shadow-[0_28px_70px_rgba(27,35,33,0.12)] backdrop-blur-sm md:grid-cols-[1.15fr_0.85fr] md:p-8"
      initial="hidden"
      animate="visible"
      variants={sectionAnimation}
      transition={{ duration: 0.45 }}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="inline-flex w-fit rounded-full border border-brand/20 bg-brand/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-ink">
            Recon deck
          </p>
          <span
            onClick={onSecretTap}
            className="rounded-full border border-line/70 bg-surface/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-foreground/55"
          >
            Ops console
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
                onClick={onLogout}
                disabled={logoutLoading}
                className="inline-flex items-center rounded-full border border-accent/25 bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-70"
              >
                {logoutLoading ? "Вихід..." : "Вийти"}
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
          Tactical telemetry for UAV missions, with live track, metrics, and AI
          support.
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-foreground/75 md:text-base">
          Завантаж лог, швидко перевір ключові показники, переглянь траєкторію в
          2D або 3D та використай AI-analyst як швидкий інструмент оцінки
          ризиків.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {heroHighlights.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-line/60 bg-surface/85 p-3 shadow-[0_8px_20px_rgba(27,35,33,0.08)]"
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
        <div className="overflow-hidden rounded-[1.5rem] border border-line/70 bg-[linear-gradient(160deg,rgba(17,27,23,0.94)_0%,rgba(35,48,41,0.92)_100%)] shadow-[0_16px_38px_rgba(17,27,23,0.26)]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.18em] text-white/60">
            <span>Visual intel</span>
            <span>Pexels curated</span>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="relative min-h-[14rem] overflow-hidden rounded-2xl border border-white/10 bg-slate-900 sm:row-span-2">
              <Image
                src={tacticalVisuals[0].src}
                alt={tacticalVisuals[0].alt}
                fill
                sizes="(max-width: 768px) 100vw, 28vw"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1)_0%,rgba(3,10,8,0.72)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
                  {tacticalVisuals[0].label}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {tacticalVisuals[0].caption}
                </p>
              </div>
            </div>
            {tacticalVisuals.slice(1).map((item) => (
              <div
                key={item.label}
                className="relative min-h-[6.75rem] overflow-hidden rounded-2xl border border-white/10 bg-slate-900"
              >
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 14vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08)_0%,rgba(3,10,8,0.7)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm font-medium">{item.caption}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-line/70 bg-surface/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">
            Backend endpoint
          </p>
          <p className="mt-2 break-all font-mono text-sm text-brand-ink">
            {apiBase}
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
              Живий snapshot
            </p>
            <span className="text-xs text-foreground/40">
              Синхронізується з таймлайном
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
  );
}

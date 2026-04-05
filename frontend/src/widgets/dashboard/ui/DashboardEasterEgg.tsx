import Image from "next/image";

type DashboardEasterEggProps = {
  show: boolean;
  onClose: () => void;
};

export function DashboardEasterEgg({ show, onClose }: DashboardEasterEggProps) {
  if (!show) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      onClick={onClose}
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
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/90"
        >
          Close
        </button>
      </div>
    </div>
  );
}

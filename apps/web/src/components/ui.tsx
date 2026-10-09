import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, OctagonAlert } from "lucide-react";
import type { Verdict } from "../lib/api";
import { useApp } from "../lib/store";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({ variant = "ghost", className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }) {
  return (
    <button
      {...p}
      className={cx(
        "focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]",
        variant === "primary" && "bg-accent text-accent-ink shadow-[0_0_0_1px_var(--accent),0_8px_24px_-8px_var(--accent)] hover:brightness-110",
        variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
        variant === "outline" && "border border-line-2 text-ink hover:border-accent hover:text-accent",
        className,
      )}
    >
      {children}
    </button>
  );
}

const TONE: Record<string, string> = {
  green: "text-good bg-good/12 ring-good/30",
  amber: "text-warn bg-warn/12 ring-warn/30",
  red: "text-crit bg-crit/12 ring-crit/30",
  slate: "text-muted bg-surface-2 ring-line-2",
};
const TONE_ICON = { green: CheckCircle2, amber: AlertTriangle, red: OctagonAlert, slate: CircleDashed };

export function VerdictBadge({ v, size = "md" }: { v: Verdict; size?: "sm" | "md" }) {
  const Icon = TONE_ICON[v.tone] || CircleDashed;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full font-semibold ring-1 ring-inset", TONE[v.tone], size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs")}>
      <Icon size={size === "sm" ? 11 : 13} aria-hidden /> {v.label}
    </span>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-surface p-4", className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-[13px] font-semibold tracking-wide text-ink-2 uppercase">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function EvidenceChip({ ids, label = "Evidence", title }: { ids: (string | undefined | null)[]; label?: string; title?: string }) {
  const { openEvidence } = useApp();
  const clean = ids.filter(Boolean) as string[];
  if (!clean.length) return null;
  return (
    <button
      onClick={() => openEvidence(clean, title)}
      className="focus-ring inline-flex items-center gap-1 rounded-md border border-line-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2 transition hover:border-accent hover:text-accent"
      title="Open the source evidence"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {label}
      {clean.length > 1 && <span className="text-muted">×{clean.length}</span>}
    </button>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className={cx("tnum mt-0.5 text-xl font-semibold", tone)}>{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}

export function Meter({ value, label, tone = "var(--accent)" }: { value: number; label?: string; tone?: string }) {
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="animate-grow-x h-full origin-left rounded-full" style={{ width: `${Math.max(2, Math.min(100, value * 100))}%`, background: tone }} />
      </div>
      {label && <div className="mt-1 text-[11px] text-muted">{label}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line-2 p-4 text-center text-[13px] text-muted">{children}</div>;
}

export function PageShell({ title, kicker, children, actions }: { title: string; kicker?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-20 pb-16 sm:px-6">
      <div className="animate-fade-up mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          {kicker && <div className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">{kicker}</div>}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        </div>
        {actions}
      </div>
      <div className="stagger space-y-4">{children}</div>
    </main>
  );
}

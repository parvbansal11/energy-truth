import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Verdict } from "../lib/api";
import { useApp } from "../lib/store";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Logo mark: a survey triangle with an energy core. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M16 3.5 29 27H3z" fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16 11.5 22.2 22.5H9.8z" fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeLinejoin="round" opacity="0.9" />
      <circle cx="16" cy="18.6" r="1.9" fill="var(--accent)" />
    </svg>
  );
}

export function Button({ variant = "ghost", className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "solid" }) {
  return (
    <button
      {...p}
      className={cx(
        "focus-ring inline-flex items-center justify-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-[12px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-accent text-accent-ink hover:brightness-110",
        variant === "solid" && "bg-ink text-bg hover:bg-white",
        variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
        variant === "outline" && "border border-line-2 text-ink-2 hover:border-ink-2 hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

const TONE: Record<string, string> = {
  green: "text-ok border-ok/35 bg-ok/10",
  amber: "text-accent border-accent/40 bg-accent/10",
  red: "text-crit border-crit/40 bg-crit/10",
  slate: "text-muted border-line-2 bg-surface-2",
};

export function VerdictTag({ v, className }: { v: Verdict; className?: string }) {
  return <span className={cx("map-chip inline-flex items-center gap-1.5 rounded-[3px] border px-1.5 py-0.5 text-[10px] font-medium tracking-[0.08em] uppercase", TONE[v.tone], className)} title={v.text}>{v.label}</span>;
}

export function Dot({ tone }: { tone: string }) {
  return <span className={cx("inline-block h-1.5 w-1.5 rounded-full", tone === "green" ? "bg-ok" : tone === "amber" ? "bg-accent" : tone === "red" ? "bg-crit" : "bg-faint")} />;
}

export function Section({ label, action, children, className }: { label?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("border-b border-line px-4 py-3.5 last:border-b-0", className)}>
      {(label || action) && (
        <header className="mb-2.5 flex items-center justify-between gap-2">
          {label && <h3 className="eyebrow">{label}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("border border-line bg-surface", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          {title && <h3 className="eyebrow">{title}</h3>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EvidenceChip({ ids, label = "Evidence", title }: { ids: (string | undefined | null)[]; label?: string; title?: string }) {
  const { openEvidence } = useApp();
  const clean = ids.filter(Boolean) as string[];
  if (!clean.length) return null;
  return (
    <button onClick={() => openEvidence(clean, title)} title="Open source evidence"
      className="focus-ring map-chip inline-flex items-center gap-1.5 rounded-[3px] border border-line-2 px-1.5 py-0.5 text-[10px] tracking-wide text-ink-2 transition hover:border-accent hover:text-accent">
      <span className="h-1 w-1 bg-accent" /> {label}{clean.length > 1 && <span className="text-faint">×{clean.length}</span>}
    </button>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow !text-[9px]">{label}</div>
      <div className={cx("tnum mt-1 text-[20px] leading-none font-light", tone)}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export function Meter({ value, tone = "var(--accent)" }: { value: number; tone?: string }) {
  return (
    <div className="h-[3px] overflow-hidden bg-surface-3">
      <div className="animate-grow-x h-full origin-left" style={{ width: `${Math.max(2, Math.min(100, value * 100))}%`, background: tone }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="border border-dashed border-line-2 p-4 text-center text-[12px] text-muted">{children}</div>;
}

export function PageShell({ title, kicker, children, actions }: { title: string; kicker?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-[76px] pb-16 sm:px-6">
      <div className="animate-fade-up mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          {kicker && <div className="eyebrow">{kicker}</div>}
          <h1 className="mt-1.5 text-[26px] font-light tracking-[-0.01em]">{title}</h1>
        </div>
        {actions}
      </div>
      <div className="stagger space-y-3">{children}</div>
    </main>
  );
}

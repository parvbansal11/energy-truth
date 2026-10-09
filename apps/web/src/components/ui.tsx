import type { ButtonHTMLAttributes, ReactNode } from "react";
import { FileText } from "lucide-react";
import type { Verdict } from "../lib/api";
import { useApp } from "../lib/store";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Logo mark: a soft evergreen tile with a spark rising from a baseline (energy, checked). */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M8 21.5c3.2 0 4.2-9 8-9s4.8 9 8 9" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="12.5" r="2.2" fill="#f3d9a4" />
    </svg>
  );
}

export function Wordmark({ size = 19 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <Mark size={size + 7} />
      <span className="serif font-medium text-ink" style={{ fontSize: size }}>Energy Truth</span>
    </span>
  );
}

export function Button({ variant = "ghost", size = "md", className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "accent" | "ghost" | "outline"; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...p}
      className={cx(
        "focus-ring inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]",
        size === "sm" && "h-7 rounded-lg px-2.5 text-[12px]",
        size === "md" && "h-9 rounded-xl px-3.5 text-[13px]",
        size === "lg" && "h-11 rounded-xl px-5 text-[14px]",
        variant === "primary" && "bg-ink text-white shadow-sm hover:bg-black",
        variant === "accent" && "bg-accent text-white shadow-sm hover:brightness-110",
        variant === "ghost" && "text-ink-2 hover:bg-surface-3 hover:text-ink",
        variant === "outline" && "border border-line-2 bg-surface text-ink hover:border-ink-2/40 hover:shadow-sm",
        className,
      )}
    >
      {children}
    </button>
  );
}

const TONE: Record<string, string> = {
  green: "bg-ok-soft text-ok",
  amber: "bg-sun-soft text-sun",
  red: "bg-crit-soft text-crit",
  slate: "bg-surface-3 text-muted",
};
const DOT: Record<string, string> = { green: "bg-ok", amber: "bg-sun", red: "bg-crit", slate: "bg-faint" };

export function VerdictTag({ v, className }: { v: Verdict; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap", TONE[v.tone], className)} title={v.text}>
      <span className={cx("h-1.5 w-1.5 rounded-full", DOT[v.tone])} />{v.label}
    </span>
  );
}

export function Dot({ tone }: { tone: string }) {
  return <span className={cx("inline-block h-2 w-2 rounded-full", DOT[tone] || "bg-faint")} />;
}

export function Switch({ on }: { on: boolean }) {
  return <span className="switch" data-on={on} aria-hidden />;
}

export function Section({ label, action, children, className }: { label?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("px-5 py-4", className)}>
      {(label || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {label && <h3 className="text-[12.5px] font-medium text-muted">{label}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("card shadow-[var(--shadow-sm)]", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 px-5 pt-4">
          {title && <h3 className="text-[13px] font-medium text-ink-2">{title}</h3>}
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EvidenceChip({ ids, label = "Sources", title }: { ids: (string | undefined | null)[]; label?: string; title?: string }) {
  const { openEvidence } = useApp();
  const clean = ids.filter(Boolean) as string[];
  if (!clean.length) return null;
  return (
    <button onClick={() => openEvidence(clean, title)} title="Open the source evidence" data-tour="evidence"
      className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] text-ink-2 transition hover:border-accent/40 hover:bg-accent-soft hover:text-accent">
      <FileText size={11} /> {label}{clean.length > 1 && <span className="text-faint">{clean.length}</span>}
    </button>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={cx("tnum mt-1 text-[22px] leading-none font-medium tracking-tight", tone)}>{value}</div>
      {sub && <div className="mt-1.5 text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}

export function Meter({ value, tone = "var(--accent)" }: { value: number; tone?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
      <div className="animate-grow-x h-full origin-left rounded-full" style={{ width: `${Math.max(2, Math.min(100, value * 100))}%`, background: tone }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line-2 p-6 text-center text-[13px] text-muted">{children}</div>;
}

export function PageShell({ title, kicker, children, actions }: { title: string; kicker?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-[92px] pb-20 sm:px-8">
      <div className="animate-fade-up mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          {kicker && <div className="text-[13px] text-muted">{kicker}</div>}
          <h1 className="serif mt-1 text-[38px] leading-tight font-normal">{title}</h1>
        </div>
        {actions}
      </div>
      <div className="stagger space-y-4">{children}</div>
    </main>
  );
}

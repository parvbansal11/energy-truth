import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BookOpen, FileText, FlaskConical, Map as MapIcon, Moon, Radar, Search, Sparkles, Sun } from "lucide-react";
import { go, type Route } from "../lib/router";
import { useApp } from "../lib/store";
import { cx } from "./ui";

const NAV: { page: Route["page"]; label: string; icon: typeof MapIcon }[] = [
  { page: "map", label: "Map", icon: MapIcon },
  { page: "grid", label: "Grid desk", icon: Radar },
  { page: "whatif", label: "What-if", icon: Sparkles },
  { page: "alerts", label: "Alerts", icon: Bell },
  { page: "reports", label: "Reports", icon: FileText },
  { page: "eval", label: "Chronos eval", icon: FlaskConical },
  { page: "methodology", label: "Method", icon: BookOpen },
];

const DOT: Record<string, string> = { green: "bg-good", amber: "bg-warn", red: "bg-crit", slate: "bg-muted" };

export function TopBar({ route }: { route: Route }) {
  const { companies, selected, select, theme, toggleTheme } = useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  return (
    <>
      <header className="no-print glass fixed inset-x-2 top-2 z-40 flex items-center gap-2 rounded-2xl px-2.5 py-2 sm:inset-x-3 sm:px-3">
        <button onClick={() => go("map")} className="focus-ring flex shrink-0 items-center gap-2 rounded-lg pr-1" aria-label="ENERGY TRUTH home">
          <Logo />
          <span className="hidden text-[13px] font-bold tracking-[0.14em] sm:inline">ENERGY<span className="text-accent"> TRUTH</span></span>
        </button>
        <div className="mx-1 hidden h-5 w-px bg-line-2 md:block" />
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]" aria-label="Primary">
          {NAV.map(({ page, label, icon: Icon }) => (
            <button key={page} onClick={() => go(page, page === "whatif" ? selected : undefined)}
              className={cx("focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium transition", route.page === page ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}
              aria-current={route.page === page ? "page" : undefined}>
              <Icon size={14} /> <span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </nav>
        <div className="hidden items-center gap-1 xl:flex" role="group" aria-label="Demo companies">
          {companies.map((c) => (
            <button key={c.symbol} onClick={() => { select(c.symbol); if (route.page !== "map" && route.page !== "whatif") go("map"); if (route.page === "whatif") go("whatif", c.symbol); }}
              className={cx("focus-ring inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition", selected === c.symbol ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2")}>
              <span className={cx("h-1.5 w-1.5 rounded-full", DOT[c.verdict.tone])} />{c.short}
            </button>
          ))}
        </div>
        <button onClick={() => setOpen(true)} className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line-2 px-2 py-1.5 text-[12px] text-muted hover:text-ink" aria-label="Search companies and plants">
          <Search size={14} /><span className="hidden md:inline">Search</span><kbd className="hidden rounded bg-surface-2 px-1 font-mono text-[10px] md:inline">⌘K</kbd>
        </button>
        <button onClick={toggleTheme} className="focus-ring rounded-lg p-1.5 text-muted hover:text-ink" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>
      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </>
  );
}

export function Logo() {
  return (
    <span className="relative grid h-7 w-7 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/40">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" fill="var(--accent)" />
      </svg>
      <span className="absolute -inset-px animate-[pulse-ring_2.4s_ease-out_infinite] rounded-lg" />
    </span>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const { companies, assets, select, openPlant, startAudit, scorecards } = useApp();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const cs = companies.flatMap((c) => [
      { key: `c-${c.symbol}`, label: c.name, hint: `${c.sector} · open scorecard`, run: () => { select(c.symbol); go("map"); } },
      { key: `a-${c.symbol}`, label: `Audit ${c.short}`, hint: "run the LangGraph agent", run: () => { go("map"); startAudit(c.symbol); } },
    ]);
    const ps = assets.filter((a) => a.ct).map((a) => ({ key: a.asset_id, label: a.name, hint: `${scorecards[a.company]?.short} · plant`, run: () => { select(a.company); go("map"); setTimeout(() => openPlant(a.asset_id), 50); } }));
    return [...cs, ...ps].filter((x) => !t || x.label.toLowerCase().includes(t) || x.hint.toLowerCase().includes(t)).slice(0, 12);
  }, [q, companies, assets]);
  const run = (k: number) => { items[k]?.run(); onClose(); };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-start justify-center bg-black/45 px-4 pt-[14vh] backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command search">
      <div className="animate-fade-up w-full max-w-lg overflow-hidden rounded-2xl border border-line-2 bg-surface shadow-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-muted" />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} placeholder="Company, plant, or “Audit NTPC”…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            onKeyDown={(e) => { if (e.key === "ArrowDown") setI((x) => Math.min(items.length - 1, x + 1)); if (e.key === "ArrowUp") setI((x) => Math.max(0, x - 1)); if (e.key === "Enter") run(i); if (e.key === "Escape") onClose(); }} />
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5" role="listbox">
          {items.map((it, k) => (
            <li key={it.key} role="option" aria-selected={k === i}>
              <button onMouseEnter={() => setI(k)} onClick={() => run(k)} className={cx("flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px]", k === i ? "bg-accent/12 text-ink" : "text-ink-2")}>
                <span className="truncate">{it.label}</span><span className="shrink-0 text-[11px] text-muted">{it.hint}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="px-3 py-6 text-center text-sm text-muted">No matches</li>}
        </ul>
      </div>
    </div>
  );
}

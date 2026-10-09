import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BookOpen, Check, ChevronDown, FileText, FlaskConical, LayoutGrid, LogOut, Map as MapIcon, Play, Radar, Search, Sparkles } from "lucide-react";
import { api, reportHref } from "../lib/api";
import type { Session } from "../lib/auth";
import { go, type Page, type Route } from "../lib/router";
import { useApp } from "../lib/store";
import { cx, Mark } from "./ui";

const PAGES: { page: Page; label: string; icon: typeof MapIcon }[] = [
  { page: "map", label: "Console", icon: MapIcon },
  { page: "grid", label: "Grid desk", icon: Radar },
  { page: "whatif", label: "What-if", icon: Sparkles },
  { page: "alerts", label: "Alerts", icon: Bell },
  { page: "reports", label: "Reports", icon: FileText },
  { page: "eval", label: "Chronos eval", icon: FlaskConical },
  { page: "methodology", label: "Method", icon: BookOpen },
];

export function ConsoleBar({ route, session, onSignOut }: { route: Route; session: Session; onSignOut: () => void }) {
  const app = useApp();
  const { scorecard: sc, selected, companies, plant, assets, audit, startAudit, openPlant, setPanel, reportUrl, setReportUrl, select } = app;
  const [menu, setMenu] = useState<"pages" | "user" | null>(null);
  const [search, setSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alerts, setAlerts] = useState(0);
  useEffect(() => { api.alerts().then((a) => setAlerts(a.length)).catch(() => {}); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch((o) => !o); }
      if (e.key === "Escape") setMenu(null);
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  const idx = Math.max(0, companies.findIndex((c) => c.symbol === selected)) + 1;
  const plantName = assets.find((a) => a.asset_id === plant)?.name;
  const onConsole = route.page === "map";

  const report = async () => {
    if (reportUrl) return window.open(reportHref(reportUrl), "_blank");
    setBusy(true);
    try { const r = await api.report(selected); setReportUrl(r.url); window.open(reportHref(r.url), "_blank"); } finally { setBusy(false); }
  };
  const steps = [
    { n: 1, label: "Company", done: Boolean(sc), active: !audit.running && !plant, run: () => { openPlant(undefined); setPanel("score"); app.command({ kind: "fly_company" }); } },
    { n: 2, label: "Audit", done: Boolean(audit.result && audit.company === selected), active: audit.running, run: () => startAudit(selected) },
    { n: 3, label: "Review", done: Boolean(audit.result && audit.company === selected), active: Boolean(audit.hitl), run: () => setPanel("agent") },
    { n: 4, label: "Plant", done: Boolean(plant), active: Boolean(plant), run: () => { const top = [...(app.assetsBy[selected] || [])].filter((a) => a.ct).sort((a, b) => b.ct!.emissions_t["2024"] - a.ct!.emissions_t["2024"])[0]; if (top) openPlant(top.asset_id); } },
    { n: 5, label: "Report", done: Boolean(reportUrl), active: busy, run: report },
  ];

  return (
    <>
      <header className="no-print fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-3 border-b border-line bg-bg/85 px-3 backdrop-blur-md">
        <button onClick={() => go("map")} className="focus-ring flex shrink-0 items-center gap-2.5" aria-label="Energy Truth console">
          <Mark size={22} />
          <span className="hidden text-[11.5px] font-semibold tracking-[0.3em] sm:inline">ENERGY TRUTH</span>
        </button>
        <div className="hidden h-5 w-px bg-line-2 md:block" />
        <button onClick={() => setSearch(true)} className="focus-ring hidden items-center gap-2 rounded-[3px] border border-line-2 bg-surface px-2 py-1 md:flex" title="Search (⌘K)">
          <span className="map-chip text-[10px] tracking-[0.12em] text-muted">CO-{String(idx).padStart(2, "0")}</span>
          <span className="text-[12px]">{sc?.short || selected}</span>
          {plantName && <><span className="text-faint">/</span><span className="max-w-40 truncate text-[12px] text-accent">{plantName.replace(/ power station/i, "")}</span></>}
          <Search size={12} className="ml-1 text-faint" />
        </button>

        <nav className="no-scrollbar mx-auto flex min-w-0 items-center gap-1 overflow-x-auto" aria-label={onConsole ? "Workflow" : "Pages"}>
          {onConsole
            ? steps.map((s) => (
                <button key={s.n} onClick={s.run} className={cx("focus-ring flex shrink-0 items-center gap-2 rounded-[3px] px-2 py-1 text-[12px] transition", s.active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}>
                  <span className={cx("map-chip grid h-[18px] w-[18px] place-items-center rounded-[2px] text-[10px]", s.active ? "bg-accent text-accent-ink" : s.done ? "bg-ok/20 text-ok" : "border border-line-2 text-muted")}>
                    {s.done && !s.active ? <Check size={11} strokeWidth={3} /> : s.n}
                  </span>
                  <span className="hidden lg:inline">{s.label}</span>
                </button>
              ))
            : PAGES.map(({ page, label, icon: Icon }) => (
                <button key={page} onClick={() => go(page, page === "whatif" ? selected : undefined)}
                  className={cx("focus-ring flex shrink-0 items-center gap-1.5 rounded-[3px] px-2 py-1 text-[12px] transition", route.page === page ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}>
                  <Icon size={13} /><span className="hidden lg:inline">{label}</span>
                </button>
              ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          {onConsole && (
            <button onClick={() => { select("NTPC"); startAudit("NTPC"); }} className="focus-ring hidden items-center gap-1.5 rounded-[3px] border border-line-2 px-2 py-1 text-[12px] text-ink-2 hover:border-ink-2 hover:text-ink xl:flex">
              <Play size={11} /> Guided demo
            </button>
          )}
          <span className="map-chip hidden items-center gap-1.5 rounded-[3px] border border-ok/35 bg-ok/10 px-2 py-1 text-[10px] tracking-[0.12em] text-ok uppercase lg:flex">
            <span className="relative h-1.5 w-1.5 rounded-full bg-ok text-ok ping" /> Public data only
          </span>
          <button onClick={() => go("alerts")} className="map-chip hidden items-center gap-1.5 rounded-[3px] border border-line-2 px-2 py-1 text-[10px] tracking-[0.12em] text-ink-2 uppercase hover:text-ink sm:flex">
            <span className="h-1.5 w-1.5 bg-accent" />{alerts} alerts
          </button>
          <span className="map-chip hidden rounded-[3px] border border-line-2 px-2 py-1 text-[10px] tracking-[0.12em] text-muted md:block">{sc?.fy || "FY2024-25"}</span>
          <div className="relative">
            <button onClick={() => setMenu(menu === "pages" ? null : "pages")} className="focus-ring grid h-7 w-7 place-items-center rounded-[3px] border border-line-2 text-ink-2 hover:text-ink" aria-label="Pages" aria-expanded={menu === "pages"}>
              <LayoutGrid size={13} />
            </button>
            {menu === "pages" && (
              <Menu onClose={() => setMenu(null)}>
                {PAGES.map(({ page, label, icon: Icon }) => (
                  <button key={page} onClick={() => { setMenu(null); go(page, page === "whatif" ? selected : undefined); }} className={cx("flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-surface-2", route.page === page ? "text-accent" : "text-ink-2")}>
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </Menu>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setMenu(menu === "user" ? null : "user")} className="focus-ring map-chip flex h-7 items-center gap-1 rounded-[3px] bg-surface-3 px-1.5 text-[10.5px] tracking-wider text-ink" aria-label="Account" aria-expanded={menu === "user"}>
              {session.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}<ChevronDown size={11} className="text-muted" />
            </button>
            {menu === "user" && (
              <Menu onClose={() => setMenu(null)}>
                <div className="border-b border-line px-3 py-2.5">
                  <div className="text-[12.5px]">{session.name}</div>
                  <div className="eyebrow !text-[9px]">{session.role} · {session.method === "demo" ? "demo session" : "Cognito"}</div>
                </div>
                <button onClick={onSignOut} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-ink-2 hover:bg-surface-2"><LogOut size={13} /> Sign out</button>
              </Menu>
            )}
          </div>
        </div>
      </header>
      {search && <CommandPalette onClose={() => setSearch(false)} />}
    </>
  );
}

function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => addEventListener("click", on));
    return () => removeEventListener("click", on);
  }, [onClose]);
  return <div ref={ref} className="animate-fade-up absolute top-9 right-0 z-50 w-52 border border-line-2 bg-surface py-1 shadow-2xl">{children}</div>;
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
      { key: `c-${c.symbol}`, label: c.name, hint: "company", run: () => { go("map"); select(c.symbol); } },
      { key: `a-${c.symbol}`, label: `Audit ${c.short}`, hint: "run agent", run: () => { go("map"); select(c.symbol); startAudit(c.symbol); } },
    ]);
    const ps = assets.filter((a) => a.ct).map((a) => ({ key: a.asset_id, label: a.name, hint: scorecards[a.company]?.short || "", run: () => { go("map"); select(a.company); setTimeout(() => openPlant(a.asset_id), 60); } }));
    return [...cs, ...ps].filter((x) => !t || x.label.toLowerCase().includes(t) || x.hint.toLowerCase().includes(t)).slice(0, 10);
  }, [q, companies, assets]);
  const run = (k: number) => { items[k]?.run(); onClose(); };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-start justify-center bg-black/60 px-4 pt-[14vh] backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Search">
      <div className="animate-fade-up w-full max-w-lg border border-line-2 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={14} className="text-muted" />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} placeholder="Company, plant or “audit NTPC”" className="h-11 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
            onKeyDown={(e) => { if (e.key === "ArrowDown") setI((x) => Math.min(items.length - 1, x + 1)); if (e.key === "ArrowUp") setI((x) => Math.max(0, x - 1)); if (e.key === "Enter") run(i); if (e.key === "Escape") onClose(); }} />
          <kbd className="map-chip text-[10px] text-faint">ESC</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto py-1" role="listbox">
          {items.map((it, k) => (
            <li key={it.key} role="option" aria-selected={k === i}>
              <button onMouseEnter={() => setI(k)} onClick={() => run(k)} className={cx("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12.5px]", k === i ? "bg-surface-2 text-ink" : "text-ink-2")}>
                <span className="truncate">{it.label}</span><span className="eyebrow shrink-0 !text-[9px]">{it.hint}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="px-3 py-6 text-center text-[12px] text-muted">No matches</li>}
        </ul>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BookOpen, Check, ChevronDown, ChevronRight, Compass, FileText, FlaskConical, LayoutGrid, LogOut, Map as MapIcon, Radar, Search, Sparkles, ScatterChart } from "lucide-react";
import { api, reportHref } from "../lib/api";
import type { Session } from "../lib/auth";
import { go, type Page, type Route } from "../lib/router";
import { useApp } from "../lib/store";
import { cx, Wordmark } from "./ui";

const PAGES: { page: Page; label: string; icon: typeof MapIcon }[] = [
  { page: "map", label: "Map", icon: MapIcon },
  { page: "compare", label: "Compare", icon: ScatterChart },
  { page: "grid", label: "Grid", icon: Radar },
  { page: "whatif", label: "What-if", icon: Sparkles },
  { page: "alerts", label: "Alerts", icon: Bell },
  { page: "reports", label: "Reports", icon: FileText },
  { page: "eval", label: "Forecast check", icon: FlaskConical },
  { page: "methodology", label: "Method", icon: BookOpen },
];

export function ConsoleBar({ route, session, onSignOut, onTour }: { route: Route; session: Session; onSignOut: () => void; onTour: () => void }) {
  const app = useApp();
  const { scorecard: sc, selected, plant, assets, audit, startAudit, openPlant, setPanel, reportUrl, setReportUrl } = app;
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
  const plantName = assets.find((a) => a.asset_id === plant)?.name;
  const onMap = route.page === "map";

  const report = async () => {
    if (reportUrl) return window.open(reportHref(reportUrl), "_blank");
    setBusy(true);
    try { const r = await api.report(selected); setReportUrl(r.url); window.open(reportHref(r.url), "_blank"); } finally { setBusy(false); }
  };
  const ran = Boolean(audit.result && audit.company === selected);
  const activeIdx = audit.hitl ? 2 : audit.running ? 1 : plant ? 3 : busy ? 4 : 0;
  const steps = [
    { label: "Company", done: activeIdx > 0 || ran, run: () => { openPlant(undefined); setPanel("score"); app.command({ kind: "fly_company" }); } },
    { label: "Audit", done: ran, run: () => startAudit(selected) },
    { label: "Review", done: ran, run: () => setPanel("agent") },
    { label: "Plant", done: false, run: () => { const top = [...(app.assetsBy[selected] || [])].filter((a) => a.ct).sort((a, b) => b.ct!.emissions_t["2024"] - a.ct!.emissions_t["2024"])[0]; if (top) openPlant(top.asset_id); } },
    { label: "Report", done: Boolean(reportUrl), run: report },
  ].map((s, i) => ({ ...s, active: i === activeIdx }));

  return (
    <>
      <header className="no-print fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md">
        <button onClick={() => go("map")} className="focus-ring shrink-0 rounded-lg" aria-label="Energy Truth"><Wordmark size={17} /></button>
        <button onClick={() => setSearch(true)} className="focus-ring ml-2 hidden items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow)] md:flex" title="Search (⌘K)">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent">{(sc?.short || selected).slice(0, 2).toUpperCase()}</span>
          <span className="text-[13px]">{sc?.short || selected}</span>
          {plantName && <><ChevronRight size={13} className="text-faint" /><span className="max-w-44 truncate text-[13px] text-accent">{plantName.replace(/ power station/i, "")}</span></>}
          <Search size={13} className="ml-1 text-faint" />
        </button>

        <nav data-tour="stepper" className="no-scrollbar mx-auto flex min-w-0 items-center gap-1 overflow-x-auto rounded-full p-1" aria-label={onMap ? "Workflow" : "Pages"}>
          {onMap
            ? steps.map((s, i) => (
                <div key={s.label} className="flex shrink-0 items-center">
                  {i > 0 && <span className="mx-0.5 hidden h-px w-3 bg-line-2 xl:block" />}
                  <button onClick={s.run} className={cx("focus-ring flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-[13px] transition", s.active ? "bg-ink text-white shadow-sm" : "text-ink-2 hover:bg-surface-3")}>
                    <span className={cx("grid h-6 w-6 place-items-center rounded-full text-[11px] font-medium transition", s.active ? "bg-white/15" : s.done ? "bg-ok-soft text-ok" : "bg-surface-3 text-muted")}>
                      {s.done && !s.active ? <Check size={12} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="hidden lg:inline">{s.label}</span>
                  </button>
                </div>
              ))
            : PAGES.map(({ page, label, icon: Icon }) => (
                <button key={page} onClick={() => go(page, page === "whatif" ? selected : undefined)}
                  className={cx("focus-ring flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition", route.page === page ? "bg-ink text-white" : "text-ink-2 hover:bg-surface-3")}>
                  <Icon size={14} /><span className="hidden lg:inline">{label}</span>
                </button>
              ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <button onClick={onTour} className="focus-ring hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-2 shadow-[var(--shadow-sm)] hover:text-ink sm:flex">
            <Compass size={14} /> Tour
          </button>
          <span className="hidden items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1.5 text-[12px] text-ok xl:flex">
            <span className="relative h-1.5 w-1.5 rounded-full bg-ok text-ok ping" /> Public data only
          </span>
          <button onClick={() => go("alerts")} className="focus-ring hidden items-center gap-1.5 rounded-full bg-sun-soft px-3 py-1.5 text-[12px] text-sun hover:brightness-95 md:flex">
            <Bell size={12} /> {alerts}
          </button>
          <div className="relative">
            <button onClick={() => setMenu(menu === "pages" ? null : "pages")} className="focus-ring grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:text-ink" aria-label="Pages" aria-expanded={menu === "pages"}>
              <LayoutGrid size={14} />
            </button>
            {menu === "pages" && (
              <Menu onClose={() => setMenu(null)}>
                {PAGES.map(({ page, label, icon: Icon }) => (
                  <button key={page} onClick={() => { setMenu(null); go(page, page === "whatif" ? selected : undefined); }} className={cx("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface-3", route.page === page ? "text-accent" : "text-ink-2")}>
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </Menu>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setMenu(menu === "user" ? null : "user")} className="focus-ring flex h-8 items-center gap-1 rounded-full bg-ink pr-2 pl-1 text-white" aria-label="Account" aria-expanded={menu === "user"}>
              <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-[10.5px] font-medium">{session.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
              <ChevronDown size={12} className="opacity-70" />
            </button>
            {menu === "user" && (
              <Menu onClose={() => setMenu(null)}>
                <div className="px-3 py-2">
                  <div className="text-[13px] font-medium">{session.name}</div>
                  <div className="text-[12px] text-muted capitalize">{session.role} · {session.method === "demo" ? "demo session" : "Cognito"}</div>
                </div>
                <div className="my-1 h-px bg-line" />
                <button onClick={onTour} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-ink-2 hover:bg-surface-3"><Compass size={14} /> Replay the tour</button>
                <button onClick={onSignOut} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-ink-2 hover:bg-surface-3"><LogOut size={14} /> Sign out</button>
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
  return <div ref={ref} className="animate-pop absolute top-10 right-0 z-50 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow)]">{children}</div>;
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
      { key: `c-${c.symbol}`, label: c.name, hint: "Company", run: () => { go("map"); select(c.symbol); } },
      { key: `a-${c.symbol}`, label: `Audit ${c.short}`, hint: "Run the agent", run: () => { go("map"); select(c.symbol); startAudit(c.symbol); } },
    ]);
    const ps = assets.filter((a) => a.ct).map((a) => ({ key: a.asset_id, label: a.name, hint: scorecards[a.company]?.short || "", run: () => { go("map"); select(a.company); setTimeout(() => openPlant(a.asset_id), 60); } }));
    return [...cs, ...ps].filter((x) => !t || x.label.toLowerCase().includes(t) || x.hint.toLowerCase().includes(t)).slice(0, 10);
  }, [q, companies, assets]);
  const run = (k: number) => { items[k]?.run(); onClose(); };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-start justify-center bg-ink/25 px-4 pt-[14vh] backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Search">
      <div className="animate-pop w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="text-faint" />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} placeholder="Search a company or plant" className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
            onKeyDown={(e) => { if (e.key === "ArrowDown") setI((x) => Math.min(items.length - 1, x + 1)); if (e.key === "ArrowUp") setI((x) => Math.max(0, x - 1)); if (e.key === "Enter") run(i); if (e.key === "Escape") onClose(); }} />
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5" role="listbox">
          {items.map((it, k) => (
            <li key={it.key} role="option" aria-selected={k === i}>
              <button onMouseEnter={() => setI(k)} onClick={() => run(k)} className={cx("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px]", k === i ? "bg-surface-3 text-ink" : "text-ink-2")}>
                <span className="truncate">{it.label}</span><span className="shrink-0 text-[12px] text-faint">{it.hint}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="px-3 py-6 text-center text-[13px] text-muted">No matches</li>}
        </ul>
      </div>
    </div>
  );
}

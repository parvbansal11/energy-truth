import { useEffect, useMemo, useRef } from "react";
import { Check, CircleAlert, FileDown, Loader2, MapPin, ShieldQuestion, Wrench, X } from "lucide-react";
import { reportHref } from "../lib/api";
import { pct, qty, signed } from "../lib/format";
import { useApp, type AgentEvent } from "../lib/store";
import { Button, cx, EvidenceChip, VerdictBadge } from "./ui";

const NODE_LABEL: Record<string, string> = {
  Resolver: "Resolve company",
  DisclosureExtractor: "Read BRSR",
  AssetEnergyEstimator: "Sum plants",
  GridScope2Agent: "Grid · Scope 2",
  SatelliteEnergyVerifier: "Satellite check",
  ChronosForecaster: "Chronos forecast",
  FusionUncertainty: "Fuse + z-score",
  AuditorExplainer: "Explain (cited)",
  ReportGenerator: "Audit PDF",
};

type NodeState = { status: "pending" | "running" | "done" | "error" | "waiting"; summary?: string; label?: string; events: AgentEvent[]; t0?: number; t1?: number };

export function AgentConsole() {
  const { audit, closeAudit, resume, scorecards, openEvidence } = useApp();
  const scroller = useRef<HTMLDivElement>(null);
  const nodes = useMemo(() => {
    const st: Record<string, NodeState> = Object.fromEntries((audit.nodes.length ? audit.nodes : Object.keys(NODE_LABEL)).map((n) => [n, { status: "pending", events: [] } as NodeState]));
    for (const e of audit.events) {
      if (!e.node || !st[e.node]) continue;
      const n = st[e.node];
      if (e.type === "node") {
        if (e.status === "start") { n.status = "running"; n.label = e.label; n.t0 = e.ts; }
        if (e.status === "end") { n.status = "done"; n.summary = e.summary; n.t1 = e.ts; }
        if (e.status === "error") { n.status = "error"; n.summary = e.summary; }
      } else n.events.push(e);
      if (e.type === "hitl" && n.status === "running") n.status = "waiting";
    }
    return st;
  }, [audit.events, audit.nodes]);
  const narrative = audit.events.find((e) => e.type === "narrative");
  const result = audit.result;
  const done = Object.values(nodes).filter((n) => n.status === "done").length;
  const total = Object.keys(nodes).length;
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [audit.events.length, audit.hitl]);
  const sc = audit.company ? scorecards[audit.company] : undefined;
  const est = result?.estimates as Record<string, { z?: number; gap_pct?: number; verdict?: { label: string; tone: "green" | "amber" | "red" | "slate"; code: string; text: string }; independent?: { value_t: number; sigma_t: number }; reported?: { value_t: number } }> | undefined;

  return (
    <aside className="glass animate-slide-in-right flex h-full flex-col overflow-hidden rounded-2xl" aria-label="Agent audit console" aria-live="polite">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.16em] text-accent uppercase">Agent audit · LangGraph</div>
          <div className="truncate text-sm font-semibold">{sc?.name || audit.company}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="tnum text-xs text-muted">{done}/{total}</span>
          <button onClick={closeAudit} className="focus-ring rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close console"><X size={16} /></button>
        </div>
      </header>
      <div className="h-0.5 bg-surface-2"><div className="h-full bg-accent transition-all duration-700" style={{ width: `${(done / total) * 100}%` }} /></div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {Object.entries(nodes).map(([name, n], i) => (
          <div key={name} className={cx("relative pl-8 transition-opacity", n.status === "pending" && "opacity-45")}>
            {i < total - 1 && <span className={cx("absolute top-6 bottom-[-6px] left-[11px] w-px", n.status === "done" ? "bg-accent/50" : "bg-line-2")} />}
            <span className={cx("absolute top-1 left-0 grid h-[22px] w-[22px] place-items-center rounded-full border text-[10px] transition-colors",
              n.status === "done" && "border-accent bg-accent text-accent-ink",
              n.status === "running" && "node-running border-accent bg-surface text-accent",
              n.status === "waiting" && "border-warn bg-warn/15 text-warn",
              n.status === "error" && "border-crit bg-crit/15 text-crit",
              n.status === "pending" && "border-line-2 bg-surface text-muted")}>
              {n.status === "done" ? <Check size={12} strokeWidth={3} /> : n.status === "running" ? <Loader2 size={12} className="animate-spin" /> : n.status === "waiting" ? <ShieldQuestion size={12} /> : n.status === "error" ? <CircleAlert size={12} /> : i + 1}
            </span>
            <div className="pb-2">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[13px] font-semibold">{NODE_LABEL[name] || name} <span className="font-mono text-[10px] font-normal text-muted">{name}</span></div>
                {n.t0 && n.t1 && <span className="tnum font-mono text-[10px] text-muted">{(n.t1 - n.t0).toFixed(1)}s</span>}
              </div>
              {n.status === "running" && n.label && <div className="text-[12px] text-ink-2">{n.label}<span className="animate-blink">▍</span></div>}
              {n.summary && <div className="animate-fade-up text-[12px] text-ink-2">{n.summary}</div>}
              {n.events.length > 0 && n.status !== "pending" && (
                <div className="mt-1 space-y-0.5">
                  {n.events.map((e, k) => <EventLine key={k} e={e} />)}
                </div>
              )}
            </div>
          </div>
        ))}

        {audit.hitl && (
          <div className="animate-fade-up rounded-xl border border-warn/40 bg-warn/10 p-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-warn"><ShieldQuestion size={15} /> Human review needed</div>
            <p className="mt-1 text-[12px] text-ink-2">{audit.hitl.items.length} entity match(es) scored below the {audit.hitl.threshold} threshold. Include them in the rebuild, or exclude them?</p>
            <ul className="mt-2 space-y-1 text-[12px]">
              {audit.hitl.items.map((h) => (
                <li key={h.asset_id} className="flex justify-between gap-2 rounded-md bg-surface/70 px-2 py-1"><span className="truncate">{h.name}</span><span className="tnum shrink-0 font-mono text-muted">{h.reason === "unmatched" ? "no GEM match" : `score ${h.score.toFixed(2)}`}</span></li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Button variant="primary" onClick={() => resume("accept")} className="flex-1">Include</Button>
              <Button variant="outline" onClick={() => resume("exclude")} className="flex-1">Exclude</Button>
            </div>
          </div>
        )}

        {narrative?.text && (
          <div className="animate-fade-up rounded-xl border border-line bg-surface p-3">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[12px] font-semibold text-ink-2">Auditor note</div>
              <span className="font-mono text-[10px] text-muted">{narrative.engine}</span>
            </div>
            <CitedText text={narrative.text} onCite={(id) => openEvidence([id], "Cited evidence")} />
          </div>
        )}

        {result && est?.S1 && (
          <div className="animate-fade-up rounded-xl border border-accent/40 bg-accent/8 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-semibold">Result</div>
              {est.S1.verdict && <VerdictBadge v={est.S1.verdict} size="sm" />}
            </div>
            <div className="tnum mt-2 grid grid-cols-3 gap-2 text-center text-[12px]">
              <div><div className="text-[10px] text-muted uppercase">Reported</div>{qty(est.S1.reported?.value_t)}</div>
              <div><div className="text-[10px] text-muted uppercase">Independent</div>{qty(est.S1.independent?.value_t)}</div>
              <div><div className="text-[10px] text-muted uppercase">Gap · z</div>{pct(est.S1.gap_pct)} · {signed(est.S1.z)}</div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {result.report_url && <a href={reportHref(result.report_url)} target="_blank" rel="noreferrer"><Button variant="primary"><FileDown size={14} /> Audit PDF</Button></a>}
              <EvidenceChip ids={result.evidence_ids || []} label={`${result.evidence_ids?.length || 0} evidence`} title="All evidence collected in this run" />
            </div>
            <div className="mt-1 font-mono text-[10px] text-muted">forecast: {result.forecast_mode}</div>
          </div>
        )}
        {audit.error && <div className="rounded-lg bg-crit/10 p-2 text-[12px] text-crit ring-1 ring-crit/30">{audit.error}</div>}
      </div>
    </aside>
  );
}

function EventLine({ e }: { e: AgentEvent }) {
  if (e.type === "map") {
    return <div className="animate-fade-up flex items-center gap-1 font-mono text-[10.5px] text-accent"><MapPin size={10} /> map · {e.action?.replace(/_/g, " ")} {e.asset_ids?.length ? `(${e.asset_ids.length})` : ""}</div>;
  }
  if (e.type === "tool") {
    const input = e.input && typeof e.input === "object" ? Object.entries(e.input as Record<string, unknown>).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ") : "";
    return (
      <div className="animate-fade-up rounded-md bg-surface-2/70 px-2 py-1 font-mono text-[10.5px] leading-snug">
        <div className="flex gap-1 text-ink-2"><Wrench size={10} className="mt-0.5 shrink-0 text-muted" /><span className="text-ink">{e.tool}</span>{input && <span className="truncate text-muted">{input}</span>}</div>
        {e.output && <div className="pl-3.5 text-ink-2">→ {e.output}</div>}
        {e.image && <img src={e.image} alt="Sentinel-2 preview" className="mt-1 ml-3.5 h-20 rounded border border-line object-cover" loading="lazy" />}
      </div>
    );
  }
  if (e.type === "hitl") return <div className="font-mono text-[10.5px] text-warn">⏸ {e.label}</div>;
  return null;
}

export function CitedText({ text, onCite }: { text: string; onCite: (id: string) => void }) {
  const parts = text.split(/(\[ev_[a-z_]+_[0-9a-f]{10}\])/g);
  let n = 0;
  const idx: Record<string, number> = {};
  return (
    <p className="text-[12.5px] leading-relaxed text-ink">
      {parts.map((p, i) => {
        const m = p.match(/^\[(ev_[a-z_]+_[0-9a-f]{10})\]$/);
        if (!m) return <span key={i}>{p}</span>;
        idx[m[1]] ??= ++n;
        return (
          <button key={i} onClick={() => onCite(m[1])} title={m[1]} className="focus-ring mx-0.5 inline-grid h-4 min-w-4 place-items-center rounded bg-accent/15 px-1 align-text-top font-mono text-[10px] font-semibold text-accent hover:bg-accent hover:text-accent-ink">
            {idx[m[1]]}
          </button>
        );
      })}
    </p>
  );
}

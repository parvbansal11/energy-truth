import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, CircleAlert, FileDown, Loader2, ShieldQuestion } from "lucide-react";
import { reportHref } from "../lib/api";
import { pct, qty, signed } from "../lib/format";
import { useApp, type AgentEvent } from "../lib/store";
import { Button, cx, EvidenceChip, VerdictTag } from "./ui";

const NODE_LABEL: Record<string, string> = {
  Resolver: "Resolve company",
  DisclosureExtractor: "Read BRSR",
  AssetEnergyEstimator: "Sum plants",
  GridScope2Agent: "Grid · Scope 2",
  SatelliteEnergyVerifier: "Satellite check",
  ChronosForecaster: "Chronos forecast",
  FusionUncertainty: "Fuse + z-score",
  AuditorExplainer: "Explain, cited",
  ReportGenerator: "Audit PDF",
};

type NodeState = { status: "pending" | "running" | "done" | "error" | "waiting"; summary?: string; label?: string; events: AgentEvent[]; t0?: number; t1?: number };

export function AgentConsole() {
  const { audit, resume, scorecards, openEvidence, startAudit, selected } = useApp();
  const scroller = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<string | null>(null);
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
  const est = result?.estimates as Record<string, { z?: number; gap_pct?: number; verdict?: { label: string; tone: "green" | "amber" | "red" | "slate"; code: string; text: string }; independent?: { value_t: number }; reported?: { value_t: number } }> | undefined;

  if (!audit.events.length && !audit.running) {
    return (
      <div className="p-4">
        <div className="eyebrow">Agent audit · LangGraph</div>
        <p className="mt-2 text-[12.5px] text-ink-2">Nine agents resolve the company, read its BRSR, sum the plants, check grid and satellites, forecast, fuse and write a cited note.</p>
        <Button variant="primary" className="mt-3 w-full py-2" onClick={() => startAudit(selected)}>Run audit · {scorecards[selected]?.short}</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="Agent audit console" aria-live="polite">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="eyebrow">Audit · {sc?.short || audit.company}</div>
        <span className="map-chip tnum text-[10px] text-muted">{done}/{total} {audit.running && <Loader2 size={10} className="ml-1 inline animate-spin" />}</span>
      </div>
      <div className="h-px bg-line"><div className="h-full bg-accent transition-all duration-700" style={{ width: `${(done / total) * 100}%` }} /></div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <ol className="py-1.5">
          {Object.entries(nodes).map(([name, n], i) => {
            const expanded = open === name || n.status === "running" || n.status === "waiting";
            const tools = n.events.filter((e) => e.type === "tool" && e.output);
            return (
              <li key={name} className={cx("transition-opacity", n.status === "pending" && "opacity-40")}>
                <button onClick={() => setOpen(open === name ? null : name)} disabled={n.status === "pending"} className="flex w-full items-center gap-2.5 px-4 py-1.5 text-left hover:bg-surface-2/50">
                  <span className={cx("grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[2px] text-[9.5px]",
                    n.status === "done" && "bg-ok/15 text-ok",
                    n.status === "running" && "node-running bg-accent text-accent-ink",
                    n.status === "waiting" && "bg-accent/20 text-accent",
                    n.status === "error" && "bg-crit/20 text-crit",
                    n.status === "pending" && "border border-line-2 text-muted")}>
                    {n.status === "done" ? <Check size={11} strokeWidth={3} /> : n.status === "running" ? <Loader2 size={11} className="animate-spin" /> : n.status === "waiting" ? <ShieldQuestion size={11} /> : n.status === "error" ? <CircleAlert size={11} /> : <span className="map-chip">{i + 1}</span>}
                  </span>
                  <span className={cx("text-[12.5px]", n.status === "running" ? "text-ink" : "text-ink-2")}>{NODE_LABEL[name] || name}</span>
                  {n.t0 && n.t1 && <span className="map-chip tnum ml-auto text-[10px] text-faint">{(n.t1 - n.t0).toFixed(1)}s</span>}
                  {n.status === "done" && tools.length > 0 && <ChevronRight size={12} className={cx("text-faint transition-transform", expanded && "rotate-90", !(n.t0 && n.t1) && "ml-auto")} />}
                </button>
                {n.summary && <div className="truncate pr-4 pl-11 text-[11px] text-muted" title={n.summary}>{n.summary}</div>}
                {expanded && tools.length > 0 && (
                  <div className="mt-1 mb-1.5 ml-11 mr-4 space-y-1 border-l border-line-2 pl-2.5">
                    {tools.map((e, k) => (
                      <div key={k} className="animate-fade-up map-chip text-[10px] leading-snug">
                        <span className="text-faint">{e.tool}</span> <span className="text-ink-2">{e.output}</span>
                        {e.image && <img src={e.image} alt="Sentinel-2 preview" className="mt-1 h-16 rounded-[2px] border border-line object-cover" loading="lazy" />}
                      </div>
                    ))}
                  </div>
                )}
                {n.status === "running" && n.label && !tools.length && <div className="pl-11 text-[11px] text-muted">{n.label}<span className="animate-[blink_1s_steps(2,start)_infinite]">▍</span></div>}
              </li>
            );
          })}
        </ol>

        {audit.hitl && (
          <div className="animate-fade-up mx-3 mb-3 border border-accent/40 bg-accent/5 p-3">
            <div className="eyebrow flex items-center gap-1.5 !text-accent"><ShieldQuestion size={12} /> Review needed</div>
            <p className="mt-1.5 text-[12px] text-ink-2">{audit.hitl.items.length} match{audit.hitl.items.length > 1 ? "es" : ""} below {audit.hitl.threshold}</p>
            <ul className="mt-2 space-y-px">
              {audit.hitl.items.map((h) => (
                <li key={h.asset_id} className="flex justify-between gap-2 bg-surface px-2 py-1 text-[11.5px]"><span className="truncate">{h.name}</span><span className="map-chip tnum shrink-0 text-[10px] text-muted">{h.reason === "unmatched" ? "no GEM match" : h.score.toFixed(2)}</span></li>
              ))}
            </ul>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              <Button variant="primary" onClick={() => resume("accept")}>Include</Button>
              <Button variant="outline" onClick={() => resume("exclude")}>Exclude</Button>
            </div>
          </div>
        )}

        {result && est?.S1 && (
          <div className="animate-fade-up mx-3 mb-3 border border-line-2 bg-surface">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="eyebrow">Result</span>
              {est.S1.verdict && <VerdictTag v={est.S1.verdict} />}
            </div>
            <div className="tnum grid grid-cols-3 divide-x divide-line text-center">
              {[["Reported", qty(est.S1.reported?.value_t)], ["Rebuilt", qty(est.S1.independent?.value_t)], ["z", signed(est.S1.z)]].map(([l, v]) => (
                <div key={l} className="py-2"><div className="eyebrow !text-[8.5px]">{l}</div><div className="mt-0.5 text-[14px] font-light">{v}</div></div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 border-t border-line px-3 py-2">
              {result.report_url && <a href={reportHref(result.report_url)} target="_blank" rel="noreferrer"><Button variant="solid"><FileDown size={13} /> Audit PDF</Button></a>}
              <EvidenceChip ids={result.evidence_ids || []} label={`${result.evidence_ids?.length || 0} sources`} title="Evidence collected in this run" />
              <span className="map-chip ml-auto text-[9.5px] text-faint">{pct(est.S1.gap_pct)}</span>
            </div>
          </div>
        )}

        {narrative?.text && (
          <div className="animate-fade-up mx-3 mb-3 border-l-2 border-accent pl-3">
            <div className="eyebrow mb-1">Auditor note · {narrative.engine}</div>
            <CitedText text={narrative.text} onCite={(id) => openEvidence([id], "Cited evidence")} />
          </div>
        )}
        {audit.error && <div className="mx-3 mb-3 border border-crit/40 bg-crit/10 p-2 text-[12px] text-crit">{audit.error}</div>}
      </div>
    </div>
  );
}

export function CitedText({ text, onCite }: { text: string; onCite: (id: string) => void }) {
  const parts = text.split(/(\[ev_[a-z_]+_[0-9a-f]{10}\])/g);
  let n = 0;
  const idx: Record<string, number> = {};
  return (
    <p className="text-[12px] leading-relaxed text-ink-2">
      {parts.map((p, i) => {
        const m = p.match(/^\[(ev_[a-z_]+_[0-9a-f]{10})\]$/);
        if (!m) return <span key={i}>{p}</span>;
        idx[m[1]] ??= ++n;
        return (
          <button key={i} onClick={() => onCite(m[1])} title={m[1]} className="focus-ring map-chip mx-0.5 inline-grid h-[15px] min-w-[15px] place-items-center rounded-[2px] bg-accent/15 px-0.5 align-text-top text-[9.5px] text-accent hover:bg-accent hover:text-accent-ink">
            {idx[m[1]]}
          </button>
        );
      })}
    </p>
  );
}

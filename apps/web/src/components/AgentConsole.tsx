import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronRight, CircleAlert, FileDown, Loader2, UserRoundCheck } from "lucide-react";
import { reportHref } from "../lib/api";
import { pct, qty, signed } from "../lib/format";
import { useApp, type AgentEvent } from "../lib/store";
import { Button, cx, EvidenceChip, VerdictTag } from "./ui";

const NODE_LABEL: Record<string, string> = {
  Resolver: "Find the company",
  DisclosureExtractor: "Read the BRSR filing",
  AssetEnergyEstimator: "Add up owned plants",
  GridScope2Agent: "Check grid electricity",
  SatelliteEnergyVerifier: "Look at satellite data",
  ChronosForecaster: "Forecast with Chronos-2",
  FusionUncertainty: "Compare and weigh",
  AuditorExplainer: "Write a cited note",
  ReportGenerator: "Prepare the PDF",
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
      <div className="p-5">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-soft text-accent"><Bot size={20} /></div>
        <div className="serif mt-4 text-[22px] leading-snug">Let the agents run the audit</div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">Nine small agents read the filing, add up the plants, check the grid and satellites, forecast, compare, and write a short note with sources. It takes about fifteen seconds.</p>
        <Button variant="primary" size="lg" className="mt-5 w-full" onClick={() => startAudit(selected)}><Bot size={15} /> Audit {scorecards[selected]?.short}</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="Agent audit console" aria-live="polite">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="text-[13px] text-ink">Auditing {sc?.short || audit.company}</div>
          <span className="tnum text-[12px] text-muted">{done} of {total}{audit.running && <Loader2 size={11} className="ml-1.5 inline animate-spin" />}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${(done / total) * 100}%` }} /></div>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto pb-3">
        <ol className="px-2.5">
          {Object.entries(nodes).map(([name, n], i) => {
            const expanded = open === name || n.status === "running" || n.status === "waiting";
            const tools = n.events.filter((e) => e.type === "tool" && e.output);
            return (
              <li key={name} className={cx("rounded-xl transition", n.status === "pending" && "opacity-45", n.status === "running" && "bg-accent-soft/60")}>
                <button onClick={() => setOpen(open === name ? null : name)} disabled={n.status === "pending"} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-surface-3/60">
                  <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] transition",
                    n.status === "done" && "bg-ok-soft text-ok",
                    n.status === "running" && "node-running bg-accent text-white",
                    n.status === "waiting" && "bg-sun-soft text-sun",
                    n.status === "error" && "bg-crit-soft text-crit",
                    n.status === "pending" && "bg-surface-3 text-muted")}>
                    {n.status === "done" ? <Check size={12} strokeWidth={3} /> : n.status === "running" ? <Loader2 size={12} className="animate-spin" /> : n.status === "waiting" ? <UserRoundCheck size={12} /> : n.status === "error" ? <CircleAlert size={12} /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-[13px]", n.status === "running" ? "text-ink" : "text-ink-2")}>{NODE_LABEL[name] || name}</span>
                    {n.summary && <span className="block truncate text-[11.5px] text-muted" title={n.summary}>{n.summary}</span>}
                    {n.status === "running" && !n.summary && n.label && <span className="block text-[11.5px] text-muted">{n.label}…</span>}
                  </span>
                  {n.status === "done" && tools.length > 0 && <ChevronRight size={13} className={cx("shrink-0 text-faint transition-transform", expanded && "rotate-90")} />}
                </button>
                {expanded && tools.length > 0 && (
                  <div className="mr-3 mb-2 ml-[46px] space-y-1.5 rounded-lg bg-surface-3/60 p-2.5">
                    {tools.map((e, k) => (
                      <div key={k} className="animate-fade-up text-[11.5px] leading-snug text-ink-2">
                        {e.output}
                        {e.image && <img src={e.image} alt="Sentinel-2 preview" className="mt-1.5 h-20 rounded-lg object-cover" loading="lazy" />}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {audit.hitl && (
          <div className="animate-pop mx-3 mt-2 rounded-2xl bg-sun-soft p-4">
            <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink"><UserRoundCheck size={15} className="text-sun" /> Quick check needed</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">The agent wasn't fully sure {audit.hitl.items.length === 1 ? "this plant belongs" : "these plants belong"} to the company. Should we count {audit.hitl.items.length === 1 ? "it" : "them"}?</p>
            <ul className="mt-2.5 space-y-1">
              {audit.hitl.items.map((h) => (
                <li key={h.asset_id} className="flex justify-between gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-[12.5px]"><span className="truncate">{h.name}</span><span className="tnum shrink-0 text-muted">{h.reason === "unmatched" ? "no match found" : `${Math.round(h.score * 100)}% match`}</span></li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="primary" onClick={() => resume("accept")}>Yes, include</Button>
              <Button variant="outline" onClick={() => resume("exclude")}>Leave out</Button>
            </div>
          </div>
        )}

        {result && est?.S1 && (
          <div className="animate-pop mx-3 mt-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between">
              <span className="serif text-[18px]">Result</span>
              {est.S1.verdict && <VerdictTag v={est.S1.verdict} />}
            </div>
            <div className="tnum mt-3 grid grid-cols-3 gap-2 text-center">
              {[["Reported", qty(est.S1.reported?.value_t)], ["Rebuilt", qty(est.S1.independent?.value_t)], ["Gap", pct(est.S1.gap_pct)]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-surface-3/70 py-2"><div className="text-[11.5px] text-muted">{l}</div><div className="mt-0.5 text-[15px] font-medium">{v}</div></div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              {result.report_url && <a href={reportHref(result.report_url)} target="_blank" rel="noreferrer"><Button variant="primary" size="sm"><FileDown size={13} /> Audit PDF</Button></a>}
              <EvidenceChip ids={result.evidence_ids || []} label={`${result.evidence_ids?.length || 0} sources`} title="Evidence collected in this run" />
              <span className="tnum ml-auto text-[11.5px] text-muted">z {signed(est.S1.z)}</span>
            </div>
          </div>
        )}

        {narrative?.text && (
          <div className="animate-fade-up mx-3 mt-3 rounded-2xl bg-surface-3/60 p-4">
            <div className="text-[12px] text-muted">Auditor's note</div>
            <div className="mt-1.5"><CitedText text={narrative.text} onCite={(id) => openEvidence([id], "Cited evidence")} /></div>
          </div>
        )}
        {audit.error && <div className="mx-3 mt-3 rounded-xl bg-crit-soft p-3 text-[12.5px] text-crit">{audit.error}</div>}
      </div>
    </div>
  );
}

export function CitedText({ text, onCite }: { text: string; onCite: (id: string) => void }) {
  const parts = text.split(/(\[ev_[a-z_]+_[0-9a-f]{10}\])/g);
  let n = 0;
  const idx: Record<string, number> = {};
  return (
    <p className="text-[13px] leading-relaxed text-ink-2">
      {parts.map((p, i) => {
        const m = p.match(/^\[(ev_[a-z_]+_[0-9a-f]{10})\]$/);
        if (!m) return <span key={i}>{p}</span>;
        idx[m[1]] ??= ++n;
        return (
          <button key={i} onClick={() => onCite(m[1])} title={m[1]} className="focus-ring mx-0.5 inline-grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent-soft px-1 align-text-top text-[10px] font-medium text-accent hover:bg-accent hover:text-white">
            {idx[m[1]]}
          </button>
        );
      })}
    </p>
  );
}

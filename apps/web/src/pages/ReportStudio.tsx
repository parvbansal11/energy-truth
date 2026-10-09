import { useState } from "react";
import { Bot, FileDown, MessageSquareText } from "lucide-react";
import { api, reportHref } from "../lib/api";
import { qty } from "../lib/format";
import { useApp } from "../lib/store";
import { Button, PageShell, Panel, VerdictBadge } from "../components/ui";

/** Report Studio (plan §4 item 9) + the Strands "Judge Agent" Q&A (plan §8.1). */
export function ReportStudio() {
  const { companies } = useApp();
  const [links, setLinks] = useState<Record<string, { url: string; bytes: number; evidence_count: number }>>({});
  const [busy, setBusy] = useState<string>();
  const [q, setQ] = useState("Which demo company's disclosure diverges most from the independent rebuild, and can we trust that gap?");
  const [ans, setAns] = useState<{ available: boolean; answer?: string; reason?: string; model?: string }>();
  const [asking, setAsking] = useState(false);
  const make = async (s: string) => {
    setBusy(s);
    try { const r = await api.report(s); setLinks((l) => ({ ...l, [s]: r })); } finally { setBusy(undefined); }
  };
  return (
    <PageShell title="Report Studio" kicker="BRSR-style Energy & GHG audit PDFs — every number cited">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {companies.map((c) => (
          <Panel key={c.symbol}>
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-semibold">{c.name}</div><div className="text-[12px] text-muted">{c.fy} · {c.boundary}</div></div>
              <VerdictBadge v={c.verdict} size="sm" />
            </div>
            <div className="tnum mt-3 grid grid-cols-2 gap-2 text-[12px]">
              <div><div className="text-muted">Reported S1</div><b>{qty(c.reported_t)}</b></div>
              <div><div className="text-muted">Independent S1</div><b>{qty(c.independent_t)}</b></div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button variant="outline" onClick={() => make(c.symbol)} disabled={busy === c.symbol}><FileDown size={14} /> {busy === c.symbol ? "Rendering…" : "Generate PDF"}</Button>
              {links[c.symbol] && <a href={reportHref(links[c.symbol].url)} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-accent hover:underline">Open ({Math.round(links[c.symbol].bytes / 1024)} KB · {links[c.symbol].evidence_count} sources)</a>}
            </div>
          </Panel>
        ))}
      </div>
      <Panel title={<span className="inline-flex items-center gap-1.5"><Bot size={14} /> Judge agent · Strands Agents SDK</span>}>
        <p className="mb-2 text-[12.5px] text-ink-2">A Strands agent wraps the same tools as the LangGraph audit (scorecards, plants, grid, evidence lookup) and answers questions with evidence ids.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={q} onChange={(e) => setQ(e.target.value)} className="h-9 flex-1 rounded-lg border border-line-2 bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" aria-label="Question for the judge agent" />
          <Button variant="primary" disabled={asking} onClick={async () => { setAsking(true); try { setAns(await api.judge(q)); } finally { setAsking(false); } }}><MessageSquareText size={14} /> {asking ? "Thinking…" : "Ask"}</Button>
        </div>
        {ans && (
          <div className="mt-3 rounded-xl bg-surface-2 p-3 text-[13px]">
            {ans.available ? <><div className="whitespace-pre-wrap">{ans.answer}</div><div className="mt-1 font-mono text-[10px] text-muted">{ans.model}</div></> : <span className="text-warn">{ans.reason}</span>}
          </div>
        )}
      </Panel>
    </PageShell>
  );
}

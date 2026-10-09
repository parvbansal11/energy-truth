import { useEffect, useState } from "react";
import { ArrowRight, Bot, MessageSquareText, X } from "lucide-react";
import { AgentConsole } from "../components/AgentConsole";
import { LeftRail } from "../components/LeftRail";
import { MapView } from "../components/MapView";
import { PlantDrawer } from "../components/PlantDrawer";
import { ScorecardPanel } from "../components/ScorecardPanel";
import { cx } from "../components/ui";
import { api } from "../lib/api";
import { useApp } from "../lib/store";

function useDesktop() {
  const q = "(min-width: 1024px)";
  const [d, setD] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setD(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return d;
}

const TABS = [["score", "Scorecard"], ["agent", "Agent"], ["plant", "Plant"]] as const;

function RightPanel() {
  const { panel, setPanel, plant, audit } = useApp();
  return (
    <aside className="panel animate-slide-in-right flex h-full w-[372px] flex-col overflow-hidden">
      <div className="grid shrink-0 grid-cols-3 border-b border-line" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={panel === k} onClick={() => setPanel(k)} disabled={k === "plant" && !plant}
            className={cx("focus-ring eyebrow relative py-2.5 transition disabled:opacity-30", panel === k ? "!text-ink" : "hover:!text-ink-2")}>
            {l}{k === "agent" && audit.running && <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent align-middle" />}
            {panel === k && <span className="absolute inset-x-3 bottom-0 h-px bg-accent" />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {panel === "score" && <ScorecardPanel />}
        {panel === "agent" && <AgentConsole />}
        {panel === "plant" && <PlantDrawer />}
      </div>
    </aside>
  );
}

/** "Ask" step: an empty prompt runs the audit; a question goes to the Strands judge agent. */
function AskBar() {
  const { scorecard, selected, startAudit, audit } = useApp();
  const [q, setQ] = useState("");
  const [ans, setAns] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return startAudit(selected);
    setBusy(true);
    try {
      const r = await api.judge(q);
      setAns(r.available ? { text: r.answer || "", ok: true } : { text: r.reason || "Unavailable", ok: false });
    } catch (x) { setAns({ text: String((x as Error).message), ok: false }); } finally { setBusy(false); }
  };
  return (
    <div className="pointer-events-auto w-full max-w-[520px]">
      <form onSubmit={submit} className="panel flex items-center gap-2 py-1 pr-1 pl-3">
        <MessageSquareText size={14} className="shrink-0 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask about ${scorecard?.short || selected}, or run the audit`} className="h-8 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-faint" aria-label="Ask a question" />
        <button type="submit" disabled={busy || audit.running} className="focus-ring flex h-7 shrink-0 items-center gap-1.5 rounded-[2px] bg-ink px-2.5 text-[12px] font-medium text-bg hover:bg-white disabled:opacity-40">
          {q.trim() ? <>Ask <ArrowRight size={12} /></> : <><Bot size={12} /> Run audit</>}
        </button>
      </form>
      {ans && (
        <div className="panel animate-fade-up mt-1.5 flex gap-2 p-3 text-[12px]">
          <div className={cx("flex-1 whitespace-pre-wrap", ans.ok ? "text-ink-2" : "text-accent")}>{ans.text}</div>
          <button onClick={() => setAns(null)} className="self-start text-muted hover:text-ink" aria-label="Close answer"><X size={13} /></button>
        </div>
      )}
    </div>
  );
}

export function MapPage() {
  const { plant, loadError, panel, setPanel, audit } = useApp();
  const desktop = useDesktop();
  const [sheet, setSheet] = useState<"tools" | "score" | "agent" | "plant">("score");
  useEffect(() => { if (!desktop) setSheet(panel); }, [panel, desktop]);
  return (
    <div className="fixed inset-0 overflow-hidden">
      <div className="absolute inset-x-0 top-12 bottom-0 isolate z-0"><MapView /></div>
      {loadError && (
        <div className="panel absolute top-20 left-1/2 z-30 max-w-md -translate-x-1/2 p-4 text-[12.5px]">
          <b className="text-crit">API unavailable.</b> <span className="text-ink-2">Run <code className="font-mono">make api</code> and <code className="font-mono">make pipeline</code>. ({loadError})</span>
        </div>
      )}
      {desktop ? (
        <div className="pointer-events-none absolute inset-x-3 top-[60px] bottom-3 z-10 flex gap-3">
          <div className="pointer-events-auto"><LeftRail /></div>
          <div className="flex min-w-0 flex-1 justify-center"><AskBar /></div>
          <div className="pointer-events-auto"><RightPanel /></div>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 z-30">
          <div className="px-3 pb-2"><AskBar /></div>
          <div className="panel flex max-h-[54vh] flex-col">
            <div className="grid shrink-0 grid-cols-4 border-b border-line" role="tablist">
              {([["tools", "Map"], ["score", "Score"], ["agent", "Agent"], ["plant", "Plant"]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={sheet === k} disabled={(k === "plant" && !plant) || (k === "agent" && !audit.events.length && !audit.running)}
                  onClick={() => { setSheet(k); if (k !== "tools") setPanel(k); }} className={cx("eyebrow py-2.5 disabled:opacity-30", sheet === k && "!text-ink")}>{l}</button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {sheet === "tools" && <div className="h-[46vh] [&>aside]:w-full [&>aside]:border-0"><LeftRail /></div>}
              {sheet === "score" && <ScorecardPanel />}
              {sheet === "agent" && <div className="h-[46vh]"><AgentConsole /></div>}
              {sheet === "plant" && <PlantDrawer />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

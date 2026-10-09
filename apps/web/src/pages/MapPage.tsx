import { useEffect, useState } from "react";
import { Bot, X } from "lucide-react";
import { AgentConsole } from "../components/AgentConsole";
import { MapControls } from "../components/MapControls";
import { MapView } from "../components/MapView";
import { PlantDrawer } from "../components/PlantDrawer";
import { ScorecardPanel } from "../components/ScorecardPanel";
import { Button, cx } from "../components/ui";
import { useApp } from "../lib/store";

export function MapPage() {
  const { plant, audit, startAudit, companies, loadError } = useApp();
  const [intro, setIntro] = useState(() => { try { return localStorage.getItem("et-intro") !== "seen"; } catch { return true; } });
  const [sheet, setSheet] = useState<"score" | "agent" | "plant">("score");
  useEffect(() => { if (audit.open) setSheet("agent"); }, [audit.open]);
  useEffect(() => { if (plant) setSheet("plant"); }, [plant]);
  const dismiss = () => { setIntro(false); try { localStorage.setItem("et-intro", "seen"); } catch {} };
  const right = plant ? <PlantDrawer /> : audit.open ? <AgentConsole /> : null;

  return (
    <div className="fixed inset-0 overflow-hidden">
      <MapView />

      {loadError && (
        <div className="glass absolute top-20 left-1/2 z-30 max-w-md -translate-x-1/2 rounded-xl p-4 text-sm">
          <b className="text-crit">API unavailable.</b> <span className="text-ink-2">Start it with <code className="font-mono">make api</code> and run <code className="font-mono">make pipeline</code> once. ({loadError})</span>
        </div>
      )}

      {/* desktop */}
      <div className="pointer-events-none absolute inset-x-3 top-[68px] bottom-3 z-10 hidden gap-3 lg:flex">
        <div className="glass animate-slide-in-left pointer-events-auto w-[400px] shrink-0 overflow-y-auto rounded-2xl"><ScorecardPanel /></div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
          <div className="pointer-events-auto"><MapControls /></div>
          {intro && !audit.open && companies.length > 0 && <Intro onClose={dismiss} onAudit={(s) => { dismiss(); startAudit(s); }} />}
        </div>
        {right && <div className="pointer-events-auto w-[420px] shrink-0">{right}</div>}
      </div>

      {/* mobile / tablet: bottom sheet */}
      <div className="absolute inset-x-0 bottom-0 z-30 lg:hidden">
        {intro && !audit.open && companies.length > 0 && <div className="px-3 pb-2"><Intro onClose={dismiss} onAudit={(s) => { dismiss(); startAudit(s); }} /></div>}
        <div className="px-3 pb-2"><div className="pointer-events-auto inline-block"><MapControls /></div></div>
        <div className="glass flex max-h-[52vh] flex-col rounded-t-2xl">
          <div className="flex shrink-0 gap-1 border-b border-line p-1.5" role="tablist">
            {([["score", "Scorecard"], ["agent", "Agent"], ["plant", "Plant"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={sheet === k} disabled={(k === "agent" && !audit.open) || (k === "plant" && !plant)} onClick={() => setSheet(k)}
                className={cx("flex-1 rounded-lg py-1.5 text-[12.5px] font-medium disabled:opacity-35", sheet === k ? "bg-surface-2 text-ink" : "text-muted")}>{l}</button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sheet === "score" && <ScorecardPanel />}
            {sheet === "agent" && audit.open && <div className="h-[44vh]"><AgentConsole /></div>}
            {sheet === "plant" && plant && <PlantDrawer />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Intro({ onClose, onAudit }: { onClose: () => void; onAudit: (s: string) => void }) {
  return (
    <div className="glass animate-fade-up pointer-events-auto relative max-w-md rounded-2xl p-4">
      <button onClick={onClose} className="focus-ring absolute top-2 right-2 rounded-md p-1 text-muted hover:text-ink" aria-label="Dismiss introduction"><X size={14} /></button>
      <div className="text-[11px] font-semibold tracking-[0.16em] text-accent uppercase">Outside-in energy-carbon audit</div>
      <p className="mt-1 text-[13px] leading-snug font-medium sm:text-[14px]">Indian companies self-report the carbon of their energy in BRSR filings. Nobody checks. ENERGY TRUTH rebuilds those numbers from independent public data<span className="hidden sm:inline"> — plants, ownership, grid and satellites —</span> and shows every piece of evidence.</p>
      <ol className="mt-2 hidden space-y-0.5 text-[12px] text-ink-2 sm:block">
        <li><b className="text-ink">1.</b> Pick a company — reported vs independent vs fused.</li>
        <li><b className="text-ink">2.</b> Click a plant on the map for its detail and satellite scene.</li>
        <li><b className="text-ink">3.</b> Run an audit — watch the agent work, then export the cited PDF.</li>
      </ol>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" onClick={() => onAudit("NTPC")}><Bot size={14} /> Audit NTPC</Button>
        <Button variant="outline" onClick={() => onAudit("TATASTEEL")}>Audit Tata Steel</Button>
      </div>
    </div>
  );
}

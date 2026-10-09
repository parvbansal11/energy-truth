import { useEffect, useState } from "react";
import { ExternalLink, Satellite, X } from "lucide-react";
import { api, type AssetDetail } from "../lib/api";
import { FUEL_GROUP, FUEL_LABEL, mt, num, titleCase } from "../lib/format";
import { useApp } from "../lib/store";
import { Ribbon } from "./charts/Ribbon";
import { EvidenceChip, Stat } from "./ui";

/** Plant Energy Detail (plan §4 item 3). */
export function PlantDrawer() {
  const { plant, openPlant, scorecards, layers, setLayers } = useApp();
  const [d, setD] = useState<AssetDetail>();
  const [scene, setScene] = useState<{ id: string; datetime: string; cloud_cover: number; thumbnail: string } | null | undefined>();
  const [sceneEv, setSceneEv] = useState<string>();
  useEffect(() => {
    if (!plant) return;
    setD(undefined);
    setScene(undefined);
    api.asset(plant).then(setD).catch(() => {});
    api.sentinel(plant).then((r) => { setScene(r.scene); setSceneEv(r.evidence?.id); }).catch(() => setScene(null));
  }, [plant]);
  if (!plant) return null;
  const a = d?.asset;
  const monthly = a?.monthly_t ? Object.entries(a.monthly_t).map(([month, value]) => ({ month, value })) : [];
  return (
    <aside className="glass animate-slide-in-right flex max-h-full flex-col overflow-hidden rounded-2xl" aria-label="Plant energy detail">
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.16em] text-accent uppercase">Plant energy detail</div>
          <div className="text-sm leading-snug font-semibold">{a?.name || "Loading…"}</div>
          {a && <div className="text-[11.5px] text-muted">{scorecards[a.company]?.short} · {[a.state, a.country].filter(Boolean).join(", ")}{a.region ? ` · grid ${a.region}` : ""}</div>}
        </div>
        <button onClick={() => openPlant(undefined)} className="focus-ring rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close plant detail"><X size={16} /></button>
      </header>
      {!a ? (
        <div className="space-y-2 p-4">{[80, 120, 60].map((h, i) => <div key={i} className="skeleton rounded-xl" style={{ height: h }} />)}</div>
      ) : (
        <div className="stagger min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {a.ct ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="CY2024" value={<>{mt(a.ct.emissions_t["2024"], 2)}<span className="text-xs text-muted"> Mt</span></>} sub="CO₂e (100-yr)" />
                <Stat label="Weight" value={a.ownership_weight.toFixed(2)} sub={a.weight_source === "gem_ownership_graph" ? "GEM ownership" : "assumed (no GEM link)"} />
                <Stat label="Confidence" value={<span className="text-base">{titleCase(a.ct.confidence)}</span>} sub={`σ ${Math.round(a.ct.rel_sigma * 100)}%`} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                <div className="rounded-lg bg-surface-2/70 p-2"><div className="text-muted">Capacity</div><div className="tnum font-medium">{num(a.ct.capacity)} {a.ct.capacity_units}</div></div>
                <div className="rounded-lg bg-surface-2/70 p-2"><div className="text-muted">Activity 2024</div><div className="tnum font-medium">{num(a.ct.activity)} {a.ct.activity_units}</div></div>
                <div className="rounded-lg bg-surface-2/70 p-2"><div className="text-muted">Emission factor</div><div className="tnum font-medium">{a.ct.emissions_factor?.toFixed(3)} <span className="text-muted">{a.ct.emissions_factor_units?.replace("t of CO2e_100yr per ", "t/")}</span></div></div>
                <div className="rounded-lg bg-surface-2/70 p-2"><div className="text-muted">Type</div><div className="font-medium">{FUEL_LABEL[FUEL_GROUP(a.fuel, a.sector)]}</div></div>
              </div>
              <div className="rounded-xl border border-line p-3">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-[12px] font-semibold text-ink-2">Monthly energy CO₂ · Chronos-2 (T1)</div>
                  <EvidenceChip ids={d?.forecast?.evidence_ids || a.evidence_ids} label="sources" title={`${a.name} sources`} />
                </div>
                <Ribbon label={`${a.name} monthly emissions`} data={{ history: monthly.slice(-24), forecast: d?.forecast || undefined, observed: new Set(d?.forecast?.observed_covariate_months) }} scale={1e3} unit="kt" digits={0} height={130} />
                <p className="mt-1 font-mono text-[10px] text-muted">target_construction = {a.target_construction}</p>
              </div>
              {d?.cluster && (
                <p className="text-[11.5px] text-muted">Also forecast jointly (T4 multivariate) with {d.cluster.names.filter((n) => n !== a.name).slice(0, 3).join(", ")}.</p>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-[12.5px]">
              <b className="text-warn">No independent estimate.</b> GEM lists this {a.gem?.asset_type?.toLowerCase()} as owned ({Math.round((a.gem?.share || 0) * 100)}% effective share) but no Climate TRACE source is linked to {scorecards[a.company]?.short}. This is a coverage gap, not evidence of zero emissions.
            </div>
          )}
          {a.gem && (
            <div className="rounded-xl border border-line p-3 text-[12px]">
              <div className="mb-1 flex items-center justify-between"><span className="font-semibold text-ink-2">GEM record</span>
                <a href={a.gem.wiki_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">gem.wiki <ExternalLink size={11} /></a></div>
              <div className="tnum grid grid-cols-2 gap-x-3 gap-y-0.5 text-ink-2">
                <span className="text-muted">Status</span><span>{a.gem.status} · {a.gem.operating_units}/{a.gem.units} units</span>
                <span className="text-muted">Capacity</span><span>{num(a.gem.capacity, 1)} {a.gem.capacity_unit}</span>
                <span className="text-muted">Equity share</span><span>{(a.gem.share * 100).toFixed(1)}%</span>
                <span className="text-muted">Match</span><span>{a.match.match_method.replace(/\+/g, " + ")}{a.match.match_score != null ? ` (${a.match.match_score.toFixed(2)})` : ""}</span>
              </div>
            </div>
          )}
          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-2"><Satellite size={13} /> Sentinel-2 L2A</span>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
                <input type="checkbox" checked={layers.s2} onChange={(e) => setLayers((l) => ({ ...l, s2: e.target.checked }))} className="accent-[var(--accent)]" /> overlay on map
              </label>
            </div>
            {scene === undefined && <div className="skeleton h-32 rounded-lg" />}
            {scene === null && <div className="text-[12px] text-muted">No low-cloud scene in the last 90 days.</div>}
            {scene && (
              <>
                <img src={scene.thumbnail} alt={`Sentinel-2 scene ${scene.id}`} className="h-40 w-full rounded-lg object-cover" loading="lazy" />
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                  <span className="tnum">{scene.datetime.slice(0, 10)} · cloud {Math.round(scene.cloud_cover)}%</span>
                  <EvidenceChip ids={[sceneEv]} label="STAC item" title="Sentinel-2 scene" />
                </div>
                <p className="mt-1 text-[10.5px] text-muted">Context imagery — shows the site, does not measure CO₂.</p>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

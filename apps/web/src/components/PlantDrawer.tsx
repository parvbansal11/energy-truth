import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api, type AssetDetail } from "../lib/api";
import { FUEL_GROUP, FUEL_LABEL, mt, num, titleCase } from "../lib/format";
import { useApp } from "../lib/store";
import { Ribbon } from "./charts/Ribbon";
import { EvidenceChip, Section } from "./ui";

/** Plant Energy Detail (plan §4 item 3), compact. */
export function PlantDrawer() {
  const { plant, scorecards } = useApp();
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
  if (!plant) return <div className="p-4 text-[12px] text-muted">Select a plant on the map.</div>;
  const a = d?.asset;
  if (!a) return <div className="space-y-2 p-4">{[50, 110, 80].map((h, i) => <div key={i} className="skeleton" style={{ height: h }} />)}</div>;
  const monthly = a.monthly_t ? Object.entries(a.monthly_t).map(([month, value]) => ({ month, value })) : [];
  return (
    <div key={a.asset_id} className="stagger" aria-label="Plant energy detail">
      <Section>
        <div className="eyebrow">{scorecards[a.company]?.short} · {[a.state, a.region && `${a.region} grid`].filter(Boolean).join(" · ")}</div>
        <div className="mt-1 text-[17px] leading-tight font-light">{a.name}</div>
        <div className="mt-1 text-[11px] text-muted">{FUEL_LABEL[FUEL_GROUP(a.fuel, a.sector)]}{a.ct ? ` · CT confidence ${a.ct.confidence}` : ""}</div>
      </Section>
      {a.ct ? (
        <>
          <Section>
            <div className="grid grid-cols-3 gap-px border border-line bg-line">
              {[
                ["CO₂e 2024", `${mt(a.ct.emissions_t["2024"], 2)}`, "Mt"],
                ["Weight", a.ownership_weight.toFixed(2), a.weight_source === "gem_ownership_graph" ? "GEM" : "assumed"],
                ["σ", `${Math.round(a.ct.rel_sigma * 100)}%`, titleCase(a.ct.confidence)],
              ].map(([l, v, s]) => (
                <div key={l} className="bg-surface px-2.5 py-2"><div className="eyebrow !text-[8.5px]">{l}</div><div className="tnum mt-1 text-[16px] leading-none font-light">{v}</div><div className="mt-1 text-[10px] text-muted">{s}</div></div>
              ))}
            </div>
            <dl className="tnum mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
              <dt className="text-muted">Capacity</dt><dd className="text-right">{num(a.ct.capacity)} {a.ct.capacity_units}</dd>
              <dt className="text-muted">Activity</dt><dd className="text-right">{num(a.ct.activity)} {a.ct.activity_units}</dd>
              <dt className="text-muted">Emission factor</dt><dd className="text-right">{a.ct.emissions_factor?.toFixed(3)} {a.ct.emissions_factor_units?.replace("t of CO2e_100yr per ", "t/")}</dd>
            </dl>
          </Section>
          <Section label="Chronos-2 · T1" action={<EvidenceChip ids={d?.forecast?.evidence_ids || a.evidence_ids} label="sources" title={`${a.name} sources`} />}>
            <Ribbon label={`${a.name} monthly emissions`} data={{ history: monthly.slice(-18), forecast: d?.forecast || undefined, observed: new Set(d?.forecast?.observed_covariate_months) }} scale={1e3} unit="kt" digits={0} height={110} />
          </Section>
        </>
      ) : (
        <Section><div className="border border-accent/30 bg-accent/5 p-2.5 text-[12px] text-ink-2"><b className="font-medium text-accent">No independent estimate.</b> Owned per GEM, not linked in Climate TRACE. A coverage gap, not zero emissions.</div></Section>
      )}
      {a.gem && (
        <Section label="GEM record" action={<a href={a.gem.wiki_url} target="_blank" rel="noreferrer" className="eyebrow inline-flex items-center gap-1 !text-accent hover:underline">gem.wiki <ExternalLink size={10} /></a>}>
          <dl className="tnum grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
            <dt className="text-muted">Status</dt><dd className="text-right">{a.gem.status} · {a.gem.operating_units}/{a.gem.units} units</dd>
            <dt className="text-muted">Capacity</dt><dd className="text-right">{num(a.gem.capacity, 1)} {a.gem.capacity_unit}</dd>
            <dt className="text-muted">Equity share</dt><dd className="text-right">{(a.gem.share * 100).toFixed(0)}%</dd>
            <dt className="text-muted">Match</dt><dd className="text-right">{a.match.match_score != null ? a.match.match_score.toFixed(2) : "n/a"}</dd>
          </dl>
        </Section>
      )}
      <Section label="Sentinel-2 L2A">
        {scene === undefined && <div className="skeleton h-28" />}
        {scene === null && <div className="text-[11.5px] text-muted">No low-cloud scene in 90 days.</div>}
        {scene && (
          <>
            <img src={scene.thumbnail} alt={`Sentinel-2 scene ${scene.id}`} className="h-32 w-full rounded-[2px] object-cover" loading="lazy" />
            <div className="mt-1.5 flex items-center justify-between">
              <span className="map-chip tnum text-[10px] text-muted">{scene.datetime.slice(0, 10)} · cloud {Math.round(scene.cloud_cover)}%</span>
              <EvidenceChip ids={[sceneEv]} label="STAC" title="Sentinel-2 scene" />
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

import { useEffect, useState } from "react";
import { ExternalLink, Factory, Gauge, Percent, Zap } from "lucide-react";
import { api, type AssetDetail } from "../lib/api";
import { FUEL_GROUP, FUEL_LABEL, mt, num } from "../lib/format";
import { useApp } from "../lib/store";
import { Ribbon } from "./charts/Ribbon";
import { EvidenceChip, Section } from "./ui";

/** Plant Energy Detail (plan §4 item 3). */
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
  if (!plant) return <div className="p-5 text-[13px] text-muted">Click a plant on the map to see it here.</div>;
  const a = d?.asset;
  if (!a) return <div className="space-y-3 p-5">{[50, 110, 80].map((h, i) => <div key={i} className="skeleton" style={{ height: h }} />)}</div>;
  const monthly = a.monthly_t ? Object.entries(a.monthly_t).map(([month, value]) => ({ month, value })) : [];
  const conf = a.ct?.confidence;
  return (
    <div key={a.asset_id} className="stagger divide-y divide-line" aria-label="Plant energy detail">
      <Section>
        <div className="serif text-[24px] leading-tight">{a.name}</div>
        <div className="mt-1 text-[12.5px] text-muted">{scorecards[a.company]?.name} · {[a.state, a.country === "IND" ? "India" : a.country].filter(Boolean).join(", ")}</div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-surface-3 px-2.5 py-1 text-[11.5px] text-ink-2">{FUEL_LABEL[FUEL_GROUP(a.fuel, a.sector)]}</span>
          {a.region && <span className="rounded-full bg-surface-3 px-2.5 py-1 text-[11.5px] text-ink-2">{a.region} grid</span>}
          {conf && <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[11.5px] text-ok">Data confidence: {conf}</span>}
        </div>
      </Section>
      {a.ct ? (
        <>
          <Section label="Emissions in 2024">
            <div className="flex items-end gap-2">
              <span className="tnum text-[34px] leading-none font-medium tracking-tight">{mt(a.ct.emissions_t["2024"], 2)}</span>
              <span className="pb-1 text-[13px] text-muted">million tonnes CO₂e · ± {Math.round(a.ct.rel_sigma * 100)}%</span>
            </div>
            <div className="mt-4 space-y-2.5">
              <Fact icon={Zap} label="Capacity" value={`${num(a.ct.capacity)} ${a.ct.capacity_units}`} />
              <Fact icon={Factory} label="Output in 2024" value={`${num(a.ct.activity)} ${a.ct.activity_units}`} />
              <Fact icon={Gauge} label="Emissions per unit" value={`${a.ct.emissions_factor?.toFixed(2)} ${a.ct.emissions_factor_units?.replace("t of CO2e_100yr per ", "t per ")}`} />
            </div>
          </Section>
          <Section label="Monthly trend and forecast" action={<EvidenceChip ids={d?.forecast?.evidence_ids || a.evidence_ids} label="Sources" title={`${a.name} sources`} />}>
            <Ribbon label={`${a.name} monthly emissions`} data={{ history: monthly.slice(-18), forecast: d?.forecast || undefined, observed: new Set(d?.forecast?.observed_covariate_months) }} scale={1e3} unit="kt" digits={0} height={110} />
          </Section>
        </>
      ) : (
        <Section><p className="rounded-xl bg-sun-soft p-3.5 text-[13px] text-ink-2"><b className="font-medium text-sun">No independent estimate yet.</b> The company owns this site, but the public plant data doesn't cover it. That's a gap in coverage, not zero emissions.</p></Section>
      )}
      {a.gem && (
        <Section label="Who owns it" action={<a href={a.gem.wiki_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline">GEM wiki <ExternalLink size={11} /></a>}>
          <div className="flex items-center gap-4 rounded-xl bg-surface-3/70 p-3.5">
            <div className="relative h-12 w-12 shrink-0">
              <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--line-2)" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${a.gem.share * 94.2} 94.2`} /></svg>
              <Percent size={13} className="absolute inset-0 m-auto text-accent" />
            </div>
            <div className="text-[13px]">
              <div><b className="font-medium">{Math.round(a.gem.share * 100)}%</b> owned by {scorecards[a.company]?.short}</div>
              <div className="mt-0.5 text-[12px] text-muted">{a.gem.operating_units} of {a.gem.units} units running · {num(a.gem.capacity, 0)} {a.gem.capacity_unit}</div>
            </div>
          </div>
        </Section>
      )}
      <Section label="Latest satellite view">
        {scene === undefined && <div className="skeleton h-32" />}
        {scene === null && <div className="text-[12.5px] text-muted">No clear image in the last 90 days.</div>}
        {scene && (
          <>
            <img src={scene.thumbnail} alt={`Sentinel-2 image of ${a.name}`} className="h-36 w-full rounded-xl object-cover" loading="lazy" />
            <div className="mt-2 flex items-center justify-between">
              <span className="tnum text-[12px] text-muted">Sentinel-2 · {new Date(scene.datetime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {Math.round(scene.cloud_cover)}% cloud</span>
              <EvidenceChip ids={[sceneEv]} label="Image record" title="Sentinel-2 scene" />
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Zap; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface-3 text-muted"><Icon size={13} /></span>
      <span className="text-muted">{label}</span>
      <span className="tnum ml-auto text-ink">{value}</span>
    </div>
  );
}

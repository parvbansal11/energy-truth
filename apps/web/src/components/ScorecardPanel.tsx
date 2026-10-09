import { useState } from "react";
import { Bot, FileDown, Info, Layers, Radar, Sparkles, TriangleAlert } from "lucide-react";
import { api, reportHref } from "../lib/api";
import { FLAG_TEXT, mt, pct, qty, signed } from "../lib/format";
import { go } from "../lib/router";
import { useApp } from "../lib/store";
import { Ribbon } from "./charts/Ribbon";
import { ScopeCompare } from "./charts/ScopeCompare";
import { Button, cx, EvidenceChip, Meter, VerdictBadge } from "./ui";

export function ScorecardPanel() {
  const { scorecard: sc, selected, startAudit, audit, companies } = useApp();
  const [scope, setScope] = useState<"S1" | "S2">("S1");
  const [busy, setBusy] = useState(false);
  const summary = companies.find((c) => c.symbol === selected);
  if (!sc) {
    return (
      <div className="space-y-3 p-4">
        {[60, 140, 90, 120].map((h, i) => <div key={i} className="skeleton rounded-xl" style={{ height: h }} />)}
      </div>
    );
  }
  const s = sc.scopes[scope];
  const cov = sc.coverage;
  const report = async () => {
    setBusy(true);
    try {
      const r = await api.report(sc.symbol);
      window.open(reportHref(r.url), "_blank");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div key={sc.symbol} className="stagger space-y-3 p-4">
      {/* header */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-accent uppercase">Energy carbon scorecard</div>
            <h2 className="truncate text-xl font-semibold tracking-tight">{sc.name}</h2>
            <div className="text-xs text-muted">{sc.sector} · {sc.fy} · {sc.boundary} boundary</div>
          </div>
          {summary?.band_breach && <span className="shrink-0 rounded-md bg-warn/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-warn ring-1 ring-warn/30">BAND BREACH</span>}
        </div>
        <Button variant="primary" className="mt-3 w-full py-2" onClick={() => startAudit(sc.symbol)} disabled={audit.running}>
          <Bot size={15} /> {audit.running && audit.company === sc.symbol ? "Audit running…" : `Audit ${sc.short}`}
        </Button>
      </div>

      {/* verdict */}
      <div className="rounded-xl border border-line bg-surface-2/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-lg bg-surface p-0.5 text-xs" role="tablist" aria-label="Scope">
            {(["S1", "S2"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)}
                className={cx("focus-ring rounded-md px-2.5 py-1 font-medium transition", scope === k ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink")}>
                {k === "S1" ? "Scope 1" : "Scope 2"}
              </button>
            ))}
          </div>
          <VerdictBadge v={s.verdict} size="sm" />
        </div>
        <p className="mt-2 text-[12.5px] leading-snug text-ink-2">{s.verdict.text}</p>
        {s.independent && (
          <div className="mt-3">
            <ScopeCompare scope={s} unitScale={scope === "S2" && (s.independent.value_t < 1e6) ? 1e3 : 1e6} />
            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-line pt-2 text-center">
              <div><div className="text-[10.5px] text-muted uppercase">Gap</div><div className={cx("tnum text-sm font-semibold", (s.gap_pct ?? 0) > 0 ? "text-pos" : "text-neg")}>{pct(s.gap_pct)}</div></div>
              <div><div className="text-[10.5px] text-muted uppercase">z-score</div><div className="tnum text-sm font-semibold">{signed(s.z)}</div></div>
              <div><div className="text-[10.5px] text-muted uppercase">Fused</div><div className="tnum text-sm font-semibold">{qty(s.fused?.value_t)}</div></div>
            </div>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {s.reported && <EvidenceChip ids={[...s.reported.evidence_ids, s.reported.assurance?.evidence_id]} label={`BRSR p.${s.reported.page}`} title="Reported value (BRSR)" />}
          {s.independent && <EvidenceChip ids={s.independent.evidence_ids} label={scope === "S1" ? "CT + GEM sources" : "MWh + CEA EF"} title="Independent rebuild inputs" />}
        </div>
        {scope === "S2" && s.dependency_note && <p className="mt-2 flex gap-1.5 text-[11.5px] text-muted"><Info size={13} className="mt-px shrink-0" />{s.dependency_note}</p>}
      </div>

      {/* coverage */}
      <div className="rounded-xl border border-line p-3">
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-semibold text-ink-2">Ownership coverage</div>
          <EvidenceChip ids={cov.evidence_ids} label="GEM graph" title="Coverage inputs" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <div className="tnum text-2xl font-semibold">{cov.ct_linked_assets}<span className="text-sm text-muted"> / {cov.gem_assets}</span></div>
            <div className="text-[11px] text-muted">CT-linked vs GEM units · ρ = {cov.rho.toFixed(2)}</div>
          </div>
          <div>
            <div className="tnum text-2xl font-semibold">{Math.round(cov.rho_effective * 100)}<span className="text-sm text-muted">%</span></div>
            <div className="text-[11px] text-muted">in-boundary emitters covered (ρ_eff)</div>
          </div>
        </div>
        <div className="mt-2"><Meter value={cov.rho_effective} tone={cov.rho_effective < 0.8 ? "var(--warn)" : "var(--accent)"} /></div>
        {cov.unmatched_emitting.length > 0 && (
          <details className="mt-2 text-[11.5px] text-muted">
            <summary className="cursor-pointer hover:text-ink">{cov.unmatched_emitting.length} owned emitters with no independent estimate</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">{cov.unmatched_emitting.map((n) => <li key={n}>{n}</li>)}</ul>
          </details>
        )}
      </div>

      {/* Chronos band */}
      {sc.forecast && (
        <div className="rounded-xl border border-line p-3">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[12px] font-semibold text-ink-2">Chronos-2 · monthly independent Scope 1</div>
            <span className="font-mono text-[10px] text-muted">{sc.forecast.backend.split(":")[0]}</span>
          </div>
          <Ribbon
            label="Monthly ownership-weighted emissions with Chronos-2 forecast band"
            data={{ history: sc.forecast.history_months.slice(-24).map((m, i, arr) => ({ month: m, value: sc.forecast!.history_t[sc.forecast!.history_t.length - arr.length + i] })),
              forecast: sc.forecast, observed: new Set(sc.forecast.observed_covariate_months) }}
            scale={1e6} unit="Mt" digits={2} height={120}
          />
          {sc.band && (
            <div className={cx("mt-2 rounded-lg px-2.5 py-2 text-[11.5px]", sc.band.breach ? "bg-warn/10 text-ink ring-1 ring-warn/30" : "bg-surface-2 text-ink-2")}>
              <b>{sc.band.fy}</b>: scaled band <span className="tnum">{mt(sc.band.q10_t)}–{mt(sc.band.q90_t)} Mt</span>; BRSR <span className="tnum">{mt(sc.band.reported_t)} Mt</span> →{" "}
              <b className={sc.band.breach ? "text-warn" : "text-good"}>{sc.band.breach ? "outside band" : "inside band"}</b>
              <div className="mt-0.5 text-muted">{sc.band.history_months} observed + {sc.band.forecast_months} forecast months · scaled by {sc.band.scale_rule}</div>
            </div>
          )}
        </div>
      )}

      {/* flags */}
      {(s.flags.length > 0 || sc.flags.length > 0) && (
        <div className="space-y-1.5">
          {[...new Set(s.flags)].map((f) => (
            <div key={f} className="flex gap-2 rounded-lg bg-surface-2/70 px-2.5 py-1.5 text-[11.5px] text-ink-2"><TriangleAlert size={13} className="mt-px shrink-0 text-warn" />{FLAG_TEXT[f] || f}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" onClick={() => go("whatif", sc.symbol)} className="px-2"><Sparkles size={14} /> What-if</Button>
        <Button variant="outline" onClick={report} disabled={busy} className="px-2"><FileDown size={14} /> {busy ? "…" : "PDF"}</Button>
        <Button variant="outline" onClick={() => go("grid")} className="px-2"><Radar size={14} /> Grid</Button>
      </div>
      <p className="flex gap-1.5 text-[10.5px] leading-snug text-muted"><Layers size={12} className="mt-px shrink-0" />CT owner-sum CY2024 (unweighted): {mt(sc.ct_owner_sum_cy_t["2024"])} Mt. {sc.alignment_rule}</p>
    </div>
  );
}

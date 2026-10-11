// Client mirror of packages/fusion/et_fusion/{estimators,fusion}.py so plant toggles recompute instantly.
// Same formulas and constants; the server values stay the reference (shown next to any what-if result).
import type { Asset, Scorecard, Verdict } from "./api";

export const SYSTEMATIC = 0.05;
export const LOW_COVERAGE = 0.8;

export type Rebuild = { value_t: number; sigma_t: number; n: number };

/** Scope 1 independent = sum(weight x FY tonnes); sigma = assets (+) 5% systematic (+) (1 - rho_eff) coverage term. */
export function scope1Independent(assets: Asset[], rhoEff: number): Rebuild {
  const rows = assets.filter((a) => a.ct && a.fy_t != null);
  const total = rows.reduce((s, a) => s + a.ownership_weight * (a.fy_t as number), 0);
  const varAssets = rows.reduce((s, a) => s + (a.ct!.rel_sigma * a.ownership_weight * (a.fy_t as number)) ** 2, 0);
  const varSys = (SYSTEMATIC * total) ** 2;
  const varCov = ((1 - Math.min(Math.max(rhoEff, 0), 1)) * total) ** 2;
  return { value_t: total, sigma_t: Math.sqrt(varAssets + varSys + varCov), n: rows.length };
}

export const discrepancyZ = (xInd: number, sInd: number, xRep: number, sRep: number) => (xInd - xRep) / Math.sqrt(sInd ** 2 + sRep ** 2);

export function verdict(z: number, lowCoverage: boolean): Verdict {
  if (lowCoverage) return { code: "inconclusive_low_coverage", label: "Inconclusive: low coverage", tone: "amber", text: "The independent inventory misses owned assets, so the gap cannot be read as misreporting." };
  const a = Math.abs(z);
  if (a < 1) return { code: "consistent", label: "Consistent", tone: "green", text: "Reported and independent agree within uncertainty." };
  if (a < 2) return { code: "watch", label: "Watch", tone: "amber", text: "Moderate gap; check boundary, period and ownership assumptions." };
  return { code: "significant_gap", label: "Significant gap", tone: "red", text: "Gap exceeds 2 sigma of combined uncertainty; investigate with the evidence below." };
}

/** Re-run the Scope 1 comparison with some plants left out (what-if). rho_eff drops with each excluded matched emitter. */
export function whatIfExclude(sc: Scorecard, assets: Asset[], excluded: Set<string>) {
  const kept = assets.filter((a) => a.ct && !excluded.has(a.asset_id));
  const cov = sc.coverage;
  const dropped = assets.filter((a) => a.ct && excluded.has(a.asset_id)).length;
  const rhoEff = cov.operating_emitting_locations ? Math.max(0, (cov.operating_emitting_matched - dropped) / cov.operating_emitting_locations) : cov.rho_effective;
  const ind = scope1Independent(kept, excluded.size ? rhoEff : cov.rho_effective);
  const rep = sc.scopes.S1.reported;
  if (!rep) return { ind, rhoEff, z: null as number | null, verdict: null as Verdict | null, gapPct: null as number | null };
  const z = discrepancyZ(ind.value_t, ind.sigma_t, rep.value_t, rep.sigma_t);
  return { ind, rhoEff, z, verdict: verdict(z, (excluded.size ? rhoEff : cov.rho_effective) < LOW_COVERAGE), gapPct: ((ind.value_t - rep.value_t) / rep.value_t) * 100 };
}

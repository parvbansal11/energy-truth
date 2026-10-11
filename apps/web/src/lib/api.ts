// Typed client for the ENERGY TRUTH API. Every number rendered in the UI comes from these payloads.
export const API = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";

export function wsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit) return explicit;
  const base = API.startsWith("http") ? API.replace(/^http/, "ws") : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${API}`;
  return `${base}/ws`;
}

export type Verdict = { code: string; label: string; tone: "green" | "amber" | "red" | "slate"; text: string };
export type Assurance = { assured?: boolean; level?: string; provider?: string | null; scope?: string; page?: number; quote?: string; evidence_id?: string };

export type Reported = {
  value_t: number; sigma_t: number; raw: string; raw_unit: string; page: number; quote: string;
  boundary?: string; document_fy: string; assurance?: Assurance; evidence_ids: string[];
};
export type Independent = {
  value_t: number; sigma_t: number; evidence_ids: string[]; estimate_id?: string;
  components?: { assets_t: number; systematic_t: number; coverage_t: number };
  mwh?: number; mwh_raw?: string; mwh_page?: number; ef?: number; ef_version?: string; n_assets?: number;
};
export type Scope = {
  reported: Reported | null; independent: Independent | null; fused?: { value_t: number; sigma_t: number };
  z?: number; gap_t?: number; gap_pct?: number; verdict: Verdict; flags: string[]; dependency_note?: string;
};
export type Coverage = {
  ct_linked_assets: number; gem_assets: number; gem_locations: number; rho: number;
  operating_emitting_locations: number; operating_emitting_matched: number; rho_effective: number;
  unmatched_emitting: string[]; definition: string; boundary: string; evidence_ids: string[];
};
export type Band = {
  fy: string; history_months: number; forecast_months: number; q10_t: number; q50_t: number; q90_t: number;
  scale: number; scale_rule: string; reported_t: number; reported_evidence_id: string; breach: boolean;
  contributors: { asset_id: string; name: string; fy_t: number }[];
};
export type ForecastSeries = { months: string[]; q10: number[]; q50: number[]; q90: number[]; backend: string; target_construction?: string; observed_covariate_months?: string[] };
export type Scorecard = {
  symbol: string; name: string; short: string; sector: string; boundary: string; fy: string;
  coverage: Coverage; alignment_rule: string; scopes: { S1: Scope; S2: Scope }; ct_owner_sum_cy_t: Record<string, number>;
  flags: { code: string; text: string; missing?: string[] }[]; hitl_queue: HitlItem[]; computed_at: string;
  forecast?: ForecastSeries & { history_months: string[]; history_t: number[] }; band?: Band | null;
};
export type CompanySummary = {
  symbol: string; name: string; short: string; sector: string; fy: string; boundary: string;
  reported_t: number | null; independent_t: number; z: number | null; verdict: Verdict;
  coverage: { rho: number; rho_effective: number; ct_linked_assets: number; gem_assets: number };
  has_disclosure: boolean; band_breach: boolean;
};
export type Asset = {
  asset_id: string; company: string; name: string; sector: string | null; subsector: string | null; fuel: string; asset_type: string | null;
  country: string | null; state: string | null; region: string | null; lat: number; lon: number;
  ownership_weight: number; weights: { standalone: number; consolidated: number; equity: number }; weight_source: string;
  match: { match_method: string; match_score: number | null; review_status: string; distance_km?: number | null };
  evidence_ids: string[]; target_construction?: string;
  ct: null | {
    source_id: number; emissions_t: Record<string, number>; confidence: string; rel_sigma: number; capacity: number | null; capacity_units: string | null;
    activity: number | null; activity_units: string | null; emissions_factor: number | null; emissions_factor_units: string | null;
  };
  gem: null | { location_id: string; name: string; asset_type: string; status: string; units: number; operating_units: number; capacity: number; capacity_unit: string; wiki_url: string; share: number };
  fy_t?: number | null; // full-facility tonnes in the comparison FY
};
export type AssetDetail = {
  asset: Asset & { monthly_t?: Record<string, number> };
  forecast: (ForecastSeries & { evidence_ids: string[] }) | null;
  cluster: { company: string; names: string[]; forecast: ForecastSeries } | null;
};
export type Evidence = {
  id: string; kind: string; title: string; publisher: string; url: string; retrieved_at: string; sha256: string;
  local_path: string; page: number | null; quote: string; license: string; meta: Record<string, unknown>;
};
export type Layer = { id: string; matrix: string; max_zoom: number; title: string; why: string; date: string; template: string; evidence_id: string };
export type Meta = { manifest: { generated_at: string; compare_fy: string; ef: number; ef_version: string; companies: string[]; counts: Record<string, number> }; layers: Record<string, Layer>; hitl_threshold: number; bedrock: boolean };
export type Grid = {
  method: string; description: string; months: string[]; series: Record<string, (number | null)[]>; fossil_share_india: number[];
  fuel_mix_mu_per_day: Record<string, (number | null)[]>; evidence_ids: string[]; forecasts: Record<string, ForecastSeries>;
};
export type Alert = { alert_id: string; company: string; type: string; severity: "high" | "medium" | "low"; ts: string; title: string; detail: string; evidence_ids: string[] };
export type HitlItem = { asset_id: string; name: string; reason: string; score: number; candidate_location?: string | null };
export type WhatIfResult = {
  available: boolean; reason?: string; symbol?: string; mwh?: number; region?: string; months?: string[]; intensity_q50?: number[];
  baseline_cea_t?: number; ef_cea?: number; ef_version?: string; forecast_grid_t?: number; forecast_grid_band_t?: [number, number];
  after_shift_t?: number; scenario_t?: number; delta_vs_baseline_t?: number; delta_vs_baseline_pct?: number;
  assumptions?: { re_share_pct: number; shift_pct: number; shift_months_from: string[]; shift_months_to: string[] }; method?: string; evidence_ids?: string[];
};
export type Backtest = {
  experiment: string; run_at: string; model_id: string;
  data: { source_url: string; sha256: string; target: string; n_months: number; first_month: string; last_month: string };
  protocol: { horizon: number; n_origins: number; eval_window: [string, string]; past_only_covariates: string[]; known_future_covariates: string[]; quantiles: number[] };
  results: Record<string, { wql: number; median_mape_pct: number; coverage_80_pct: number | null } | number>;
  inference_seconds: number;
  series: { months: string[]; actual: number[]; origins: { origin: string; months: string[]; q10: number[]; q50: number[]; q90: number[]; q50_univariate: number[]; seasonal_naive: number[] }[] };
};

export type GemHit = { entity_id: string; name: string; country: string | null; listed: boolean; tracked: string | null };
export type AddJob = { job_id: string; status: "queued" | "running" | "done" | "error"; log: { t: number; msg: string }[]; symbol?: string; name: string; error?: string; warning?: string };

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, init);
  if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => "")}`.slice(0, 200));
  return r.json() as Promise<T>;
}

export const api = {
  health: () => j<{ status: string; data_ready: boolean; bedrock: boolean; chronos_backend: string; live_add?: boolean; ai?: { providers: string[] } }>("/health"),
  gemSearch: (q: string) => j<{ results: GemHit[] }>(`/gem/search?q=${encodeURIComponent(q)}`).then((r) => r.results),
  addCompany: (body: { entity_id: string; name: string; sector?: string; brsr_url?: string }) =>
    j<AddJob>("/companies/add", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  job: (id: string) => j<AddJob>(`/jobs/${id}`),
  meta: () => j<Meta>("/meta"),
  companies: () => j<{ companies: CompanySummary[] }>("/companies").then((r) => r.companies),
  scorecard: (s: string) => j<Scorecard>(`/companies/${s}/scorecard`),
  assets: (s: string) => j<{ assets: Asset[] }>(`/companies/${s}/assets`).then((r) => r.assets),
  asset: (id: string) => j<AssetDetail>(`/assets/${encodeURIComponent(id)}`),
  sentinel: (id: string) => j<{ scene: { id: string; datetime: string; cloud_cover: number; thumbnail: string; bbox: number[]; stac_url: string } | null; evidence: Evidence | null }>(`/assets/${encodeURIComponent(id)}/sentinel`),
  evidence: (ids: string[]) => j<{ evidence: Evidence[] }>(`/evidence?ids=${ids.map(encodeURIComponent).join(",")}`).then((r) => r.evidence),
  grid: () => j<Grid>("/grid"),
  regions: () => j<GeoJSON.FeatureCollection>("/grid/regions"),
  backtest: () => j<{ backtest: Backtest; clusters: Record<string, { assets: string[]; names: string[]; forecasts: Record<string, ForecastSeries> }> }>("/eval/chronos"),
  alerts: () => j<{ alerts: Alert[] }>("/alerts").then((r) => r.alerts),
  runAlerts: () => j<{ alerts: Alert[]; published: number; sns_configured: boolean }>("/alerts/run", { method: "POST" }),
  whatif: (body: { symbol: string; re_share_pct: number; shift_pct: number; region?: string | null }) =>
    j<WhatIfResult>("/whatif/scope2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  report: (s: string) => j<{ url: string; bytes: number; evidence_count: number }>(`/reports/${s}`, { method: "POST" }),
  judge: (question: string) => j<{ available: boolean; answer?: string; reason?: string; model?: string }>("/judge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) }),
};

export const reportHref = (url: string) => `${API}${url}`;

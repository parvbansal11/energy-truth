export const mt = (t: number | null | undefined, d = 1) => (t == null || !Number.isFinite(t) ? "—" : (t / 1e6).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }));

/** Mt above 1 Mt, kt below — NTPC Scope 2 is ~65 kt and would read as 0.1 Mt otherwise. */
export const qty = (t: number | null | undefined) => {
  if (t == null || !Number.isFinite(t)) return "—";
  return Math.abs(t) >= 1e6 ? `${mt(t)} Mt` : `${(t / 1e3).toLocaleString("en-IN", { maximumFractionDigits: 1 })} kt`;
};
export const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);
export const num = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: d }));
export const signed = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d)}`);
export const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};
export const titleCase = (s: string) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const FUEL_GROUP = (fuel: string | null | undefined, sector?: string | null): "coal" | "gas" | "steel" | "other" => {
  const f = (fuel || "").toLowerCase();
  if (f === "coal" || f === "mixed fossil" || f === "coal plant") return "coal";
  if (f === "gas" || f.includes("gas plant")) return "gas";
  if (f === "steel" || f.includes("steel")) return "steel";
  if (sector === "power") return "coal";
  return "other";
};
export const FUEL_LABEL = { coal: "Coal power", gas: "Gas power", steel: "Iron & steel", other: "Cement, mining & other" } as const;

export const FLAG_TEXT: Record<string, string> = {
  LOW_COVERAGE: "Low coverage — owned emitters lack an independent estimate",
  OWNERSHIP_WEIGHT_ASSUMED: "Some CT sources have no GEM ownership link (100% assumed)",
  EF_YEAR_MISMATCH: "CEA factor year (FY2023-24) differs from the reporting year",
  EF_GEOGRAPHY_MISMATCH: "Indian grid factor applied to a boundary with non-Indian operations",
  MWH_FROM_TOTAL_CONSUMPTION: "BRSR reports total non-renewable electricity, used as the purchased-power proxy",
  ASSURANCE_COVERS_STANDALONE_ONLY: "External assurance covers standalone figures only",
};

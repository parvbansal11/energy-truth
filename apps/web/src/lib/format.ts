export const mt = (t: number | null | undefined, d = 1) => (t == null || !Number.isFinite(t) ? "n/a" : (t / 1e6).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }));

/** Mt above 1 Mt, kt below: NTPC Scope 2 is ~65 kt and would read as 0.1 Mt otherwise. */
export const qty = (t: number | null | undefined) => {
  if (t == null || !Number.isFinite(t)) return "n/a";
  return Math.abs(t) >= 1e6 ? `${mt(t)} Mt` : `${(t / 1e3).toLocaleString("en-IN", { maximumFractionDigits: 1 })} kt`;
};
export const pct = (v: number | null | undefined, d = 1) => (v == null ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);
export const num = (v: number | null | undefined, d = 0) => (v == null ? "n/a" : v.toLocaleString("en-IN", { maximumFractionDigits: d }));
export const signed = (v: number | null | undefined, d = 2) => (v == null ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(d)}`);
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
  LOW_COVERAGE: "Owned emitters missing from the independent inventory",
  OWNERSHIP_WEIGHT_ASSUMED: "Some plants lack a GEM ownership link (100% assumed)",
  EF_YEAR_MISMATCH: "Grid factor is FY2023-24 (CEA V20)",
  EF_GEOGRAPHY_MISMATCH: "Indian grid factor on non-Indian operations",
  MWH_FROM_TOTAL_CONSUMPTION: "Total electricity used as purchased-power proxy",
  ASSURANCE_COVERS_STANDALONE_ONLY: "Assurance covers standalone figures only",
};
export const FLAG_SHORT: Record<string, string> = {
  LOW_COVERAGE: "Low coverage",
  OWNERSHIP_WEIGHT_ASSUMED: "Weights assumed",
  EF_YEAR_MISMATCH: "EF year",
  EF_GEOGRAPHY_MISMATCH: "EF geography",
  MWH_FROM_TOTAL_CONSUMPTION: "MWh proxy",
  ASSURANCE_COVERS_STANDALONE_ONLY: "Partial assurance",
};

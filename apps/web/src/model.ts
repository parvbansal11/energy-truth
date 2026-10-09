export type Asset = {
  id: number;
  name: string;
  sector: string;
  subsector: string;
  country: string;
  assetType: string;
  centroid: { latitude: number; longitude: number };
  gas: string;
  emissionsQuantity: number;
  capacity: number;
  capacityUnits: string;
  activity: number;
  activityUnits: string;
  year: number;
};
export type Evidence = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  local: string;
  sha256: string;
  year: number;
  count: number;
  retrievedAt: string;
};
export type Company = {
  symbol: string;
  name: string;
  ownerId: string;
  sector: string;
  snapshots: Record<string, Asset[]>;
  evidence: Evidence[];
};
export type Snapshot = { companies: Company[]; methodology: string };
export type Finding = {
  id: string;
  tone: "amber" | "teal" | "blue";
  title: string;
  detail: string;
  action: string;
  evidenceId: string;
  assetId?: number;
};
export type Saved = {
  ids: string[];
  notes: string;
  reviewed: number[];
  ran: boolean;
};
export const emptySaved: Saved = {
  ids: [],
  notes: "",
  reviewed: [],
  ran: false,
};
export const sum = (assets: Asset[]) =>
  assets.reduce((total, a) => total + a.emissionsQuantity, 0);
export const mt = (n: number) =>
  (n / 1e6).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
export const fmt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 1 });
export const fuel = (a: Asset) =>
  a.sector === "power"
    ? a.assetType.includes(",")
      ? "Mixed fossil"
      : a.assetType === "coal"
        ? "Coal"
        : a.assetType === "gas"
          ? "Gas"
          : a.assetType || "Power"
    : a.subsector === "iron-and-steel"
      ? "Steel"
      : a.subsector === "coal-mining"
        ? "Mining"
        : a.subsector
            .split("-")
            .map((s) => s[0].toUpperCase() + s.slice(1))
            .join(" ");
export const colors = ["#0f827d", "#d49b46", "#6e7bb9", "#80a98a", "#a78a76"];
export function assetColor(a: Asset) {
  const label = fuel(a).toLowerCase();
  return label === "coal"
    ? colors[0]
    : label === "gas"
      ? colors[1]
      : label === "steel"
        ? colors[2]
        : label === "mixed fossil"
          ? colors[4]
          : colors[3];
}
export function findingsFor(company: Company, year: number): Finding[] {
  const assets = company.snapshots[year];
  const top = [...assets].sort(
    (a, b) => b.emissionsQuantity - a.emissionsQuantity,
  )[0];
  const eid = `${company.symbol}-${year}`;
  return [
    {
      id: "boundary",
      tone: "amber",
      title: "Confirm the company boundary",
      detail: `The snapshot links ${assets.length} facilities to ${company.name}. It does not establish the complete subsidiary perimeter or equity shares. The facility sum must not be treated as verified company Scope 1.`,
      action: "Request the consolidated facility list and ownership shares.",
      evidenceId: eid,
    },
    {
      id: "disclosure",
      tone: "amber",
      title: "A like-for-like comparison is still open",
      detail: `These estimates cover calendar year ${year}. A company disclosure with a matching period, gases and reporting boundary has not been ingested. A discrepancy verdict is not supported yet.`,
      action:
        "Obtain the BRSR emissions table and reconcile reporting periods.",
      evidenceId: eid,
    },
    {
      id: "priority",
      tone: "blue",
      title: `Start with ${top.name.replace(/ power station| steel plant/gi, "")}`,
      detail: `This is the largest facility estimate in the loaded snapshot: ${mt(top.emissionsQuantity)} Mt CO₂e, or ${((top.emissionsQuantity / sum(assets)) * 100).toFixed(1)}% of its unweighted facility total. Use it as the first evidence-review priority.`,
      action:
        "Inspect the source record, ownership and facility reporting boundary.",
      evidenceId: eid,
      assetId: top.id,
    },
    {
      id: "traceable",
      tone: "teal",
      title: "The facility snapshot is traceable",
      detail: `All ${assets.length} loaded records retain a Climate TRACE source ID, coordinates, year and emissions value. The raw response is cached with a SHA-256 fingerprint. This is provenance, not independent validation of each estimate.`,
      action:
        "Include the source snapshot and method limitations in your brief.",
      evidenceId: eid,
    },
  ];
}
export function readSaved(key: string): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    if (
      v &&
      Array.isArray(v.ids) &&
      typeof v.notes === "string" &&
      Array.isArray(v.reviewed)
    )
      return { ...emptySaved, ...v };
  } catch {}
  return { ...emptySaved };
}
export function download(
  filename: string,
  text: string,
  type = "text/markdown",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function briefText(
  company: Company,
  year: number,
  findings: Finding[],
  saved: Saved,
) {
  const ev = company.evidence.find((e) => e.year === year)!;
  return `# ${company.name} — evidence review\n\nCalendar year: ${year}\nPrepared: ${new Date().toLocaleDateString("en-GB")}\n\n## Scope\nOwner-linked Climate TRACE facility snapshot; full-facility sums are not equity-weighted company Scope 1. No disclosure reconciliation or independent assurance completed.\n\n## Selected findings\n${findings
    .filter((f) => saved.ids.includes(f.id))
    .map(
      (f) =>
        `### ${f.title}\n${f.detail}\n\nNext action: ${f.action}\nSource: ${ev.url}\n`,
    )
    .join(
      "\n",
    )}\n## Analyst notes\n${saved.notes || "No analyst notes added."}\n\n## Provenance\nPublisher: Climate TRACE\nRetrieved: ${ev.retrievedAt}\nRaw source: ${ev.url}\nSHA-256: ${ev.sha256}\nTerms: https://climatetrace.org/terms\n\nGenerated by Energy Truth. Analyst working brief; not an assurance opinion.\n`;
}

export function validateAssets(assets: Asset[], year: number): void {
  if (!assets.length) throw new Error("No facility records are available.");
  if (new Set(assets.map((a) => a.id)).size !== assets.length)
    throw new Error("Duplicate source IDs require investigation.");
  for (const a of assets) {
    if (a.year !== year || a.gas !== "co2e_100yr")
      throw new Error("The reporting period or gas convention does not match.");
    if (!Number.isFinite(a.emissionsQuantity) || a.emissionsQuantity < 0)
      throw new Error("An emissions value is invalid.");
    if (
      !Number.isFinite(a.centroid?.latitude) ||
      Math.abs(a.centroid.latitude) > 90 ||
      !Number.isFinite(a.centroid?.longitude) ||
      Math.abs(a.centroid.longitude) > 180
    )
      throw new Error("A facility location requires review.");
  }
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  briefText,
  findingsFor,
  sum,
  validateAssets,
  type Snapshot,
} from "../apps/web/src/model";
const snapshot: Snapshot = JSON.parse(
  readFileSync("apps/web/public/data/snapshot.json", "utf8"),
);
for (const company of snapshot.companies) {
  for (const year of [2023, 2024, 2025]) {
    const assets = company.snapshots[year];
    validateAssets(assets, year);
    const findings = findingsFor(company, year);
    const priority = findings.find((f) => f.id === "priority")!;
    const maximum = Math.max(...assets.map((a) => a.emissionsQuantity));
    assert.equal(
      assets.find((a) => a.id === priority.assetId)?.emissionsQuantity,
      maximum,
    );
    assert.ok(sum(assets) >= maximum);
    const brief = briefText(company, year, findings, {
      ids: ["priority"],
      notes: "Follow up on ownership.",
      reviewed: [],
      ran: true,
    });
    assert.ok(brief.includes(priority.title));
    assert.ok(!brief.includes("### Confirm the company boundary"));
    assert.ok(
      brief.includes(company.evidence.find((e) => e.year === year)!.sha256),
    );
    assert.ok(brief.includes("not equity-weighted"));
    assert.ok(brief.includes("Follow up on ownership."));
    assert.throws(
      () => validateAssets([...assets, assets[0]], year),
      /Duplicate/,
    );
    assert.throws(() => validateAssets(assets, year - 1), /period/);
    assert.throws(
      () => validateAssets([{ ...assets[0], emissionsQuantity: NaN }], year),
      /invalid/,
    );
  }
}
console.log(
  "Review calculations, provenance and export selection tests passed for both companies and all three years.",
);

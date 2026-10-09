import { expect, test } from "@playwright/test";

// AGENTS.md golden path: "Audit NTPC" streams every node, highlights plants, ends with a cited narrative + PDF.
test("Audit NTPC golden path", async ({ page }) => {
  await page.goto("/#/map");
  await expect(page.getByText("NTPC Ltd").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("327.0 Mt").first()).toBeVisible();
  await page.getByRole("button", { name: "Audit NTPC" }).first().click();
  const consoleEl = page.getByLabel("Agent audit console");
  await expect(consoleEl).toBeVisible();
  // HITL: one low-confidence entity match pauses the Resolver
  const include = consoleEl.getByRole("button", { name: "Include" });
  await include.waitFor({ timeout: 30_000 }).then(() => include.click()).catch(() => {});
  await expect(consoleEl.getByText("9/9")).toBeVisible({ timeout: 90_000 });
  await expect(consoleEl.getByText(/NTPC reported 327\.0 Mt/)).toBeVisible();
  await expect(consoleEl.getByRole("button", { name: "Audit PDF" })).toBeVisible();
  // a citation opens the evidence drawer with the BRSR page
  await consoleEl.locator('button[title^="ev_pdf_page_"]').first().click();
  await expect(page.getByLabel("Evidence drawer")).toContainText("PAGE 17", { ignoreCase: true });
});

test("Tata Steel shows the low-coverage verdict", async ({ page }) => {
  await page.goto("/#/map/TATASTEEL");
  await expect(page.getByText("Tata Steel Ltd").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Inconclusive — low coverage").first()).toBeVisible();
  await expect(page.getByText("78.0 Mt").first()).toBeVisible();
});

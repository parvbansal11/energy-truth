import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, hash = "") {
  await page.goto("/");
  await page.getByRole("button", { name: /Continue as analyst/ }).click();
  await expect(page.getByText("Scope 1 · fuel").first()).toBeVisible({ timeout: 30_000 });
  if (hash) await page.goto(`/#${hash}`);
}

// AGENTS.md golden path: "Audit NTPC" streams every node, highlights plants, ends with a cited narrative + PDF.
test("Audit NTPC golden path", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("327.0 Mt").first()).toBeVisible();
  await page.getByRole("button", { name: /Run audit/ }).first().click();
  const consoleEl = page.getByLabel("Agent audit console");
  await expect(consoleEl).toBeVisible();
  const include = consoleEl.getByRole("button", { name: "Include" });
  await include.waitFor({ timeout: 30_000 }).then(() => include.click()).catch(() => {});
  await expect(consoleEl).toContainText("9/9", { timeout: 90_000 });
  await expect(consoleEl.getByText(/NTPC reported 327\.0 Mt/)).toBeVisible();
  await expect(consoleEl.getByRole("button", { name: "Audit PDF", exact: true })).toBeVisible();
  await consoleEl.locator('button[title^="ev_pdf_page_"]').first().click();
  await expect(page.getByLabel("Evidence drawer")).toContainText("PAGE 17", { ignoreCase: true });
});

test("Tata Steel shows the low-coverage verdict", async ({ page }) => {
  await signIn(page, "/map/TATASTEEL");
  await expect(page.getByText("Tata Steel Ltd").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Inconclusive: low coverage").first()).toBeVisible();
  await expect(page.getByText("78.0 Mt").first()).toBeVisible();
});

test("landing has no em dashes and the sign-in panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Sign in")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain("—");
});

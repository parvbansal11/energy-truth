import { expect, test, type Page } from "@playwright/test";

async function enterDemo(page: Page, hash = "") {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).click();
  // the guided tour opens for first-time users; close it to drive the console directly
  const tour = page.getByLabel("Guided tour");
  await tour.waitFor({ timeout: 20_000 }).then(() => page.keyboard.press("Escape")).catch(() => {});
  await expect(page.getByText("Fuel burned").first()).toBeVisible({ timeout: 30_000 });
  if (hash) await page.goto(`/#${hash}`);
}

// AGENTS.md golden path: "Audit NTPC" streams every node, highlights plants, ends with a cited narrative + PDF.
test("Audit NTPC golden path", async ({ page }) => {
  await enterDemo(page);
  await expect(page.getByText("327.0 Mt").first()).toBeVisible();
  await page.getByRole("button", { name: /Run audit/ }).first().click();
  const consoleEl = page.getByLabel("Agent audit console");
  await expect(consoleEl).toBeVisible();
  const include = consoleEl.getByRole("button", { name: "Yes, include" });
  await include.waitFor({ timeout: 30_000 }).then(() => include.click()).catch(() => {});
  await expect(consoleEl).toContainText("9 of 9", { timeout: 90_000 });
  await expect(consoleEl.getByText(/NTPC reported 327\.0 Mt/)).toBeVisible();
  await expect(consoleEl.getByRole("button", { name: "Audit PDF", exact: true })).toBeVisible();
  await consoleEl.locator('button[title^="ev_pdf_page_"]').first().click();
  await expect(page.getByLabel("Evidence drawer")).toContainText("PAGE 17", { ignoreCase: true });
});

test("Tata Steel shows the low-coverage verdict", async ({ page }) => {
  await enterDemo(page, "/map/TATASTEEL");
  await expect(page.getByText("Tata Steel Ltd").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Inconclusive: low coverage").first()).toBeVisible();
  await expect(page.getByText("78.0 Mt").first()).toBeVisible();
});

test("guided tour walks through every step", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).click();
  const tour = page.getByLabel("Guided tour");
  await expect(tour).toContainText("Welcome to Energy Truth", { timeout: 20_000 });
  for (let i = 0; i < 12; i++) await tour.getByRole("button", { name: /Next|Show me/ }).click();
  await expect(tour).toContainText("You're ready");
});

test("landing is friendly and has no em dashes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Check the carbon companies report/ })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await expect(page.getByLabel("Sign in")).toContainText("Welcome back");
  expect(await page.locator("body").innerText()).not.toContain("—");
});

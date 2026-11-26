import { test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import { REAL_JPEG, openForm } from "./helpers/form";

// Known engine issue, not an app defect: Playwright Firefox (build firefox-1572, Playwright
// 1.65.1) crashes the page process ("frame.evaluate: Page crashed") while axe runs on the whole
// <form>. Bisected 2026-11-26: rules aria-allowed-attr, aria-conditional-attr,
// aria-prohibited-attr, label-content-name-mismatch and nested-interactive crash only on the full
// form; every form part scanned alone passes, and the same scans pass in chromium and webkit.
// Re-check after a Playwright upgrade.
test.fixme(
  ({ browserName }) => browserName === "firefox",
  "Playwright Firefox page crash inside axe on the full form (see comment above)",
);

test("TAC-001-04: empty form has no serious a11y violations", async ({
  page,
}) => {
  await openForm(page);
  await expectNoSeriousA11yViolations(page);
});

test("TAC-001-04: form with all validation errors", async ({ page }) => {
  await openForm(page);
  await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await page.getByText("Dodaj zdjęcie sprzętu.").waitFor();
  await expectNoSeriousA11yViolations(page);
});

test("TAC-001-04: form with a photo selected", async ({ page }) => {
  await openForm(page);
  await page.locator('input[type="file"]').setInputFiles(REAL_JPEG);
  await page.getByRole("img", { name: /Podgląd zdjęcia/ }).waitFor();
  await expectNoSeriousA11yViolations(page);
});

import { test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import { REAL_JPEG, openForm } from "./helpers/form";

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

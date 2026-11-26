import { expect, test } from "@playwright/test";
import {
  PHOTO,
  PROCESSING_TIMEOUT_MS,
  fillCase,
  observeTraffic,
  submitButton,
  warsawDotted,
} from "./helpers/live";
import { openForm } from "./helpers/form";

// Plan 7a L12: the orchestrator starts the server with a deliberately invalid OPENROUTER_API_KEY
// and sets LIVE_INVALID_KEY_RUN=1 for the playwright run. The variable only gates this file.
test.skip(process.env.LIVE_INVALID_KEY_RUN !== "1", "needs LIVE_INVALID_KEY_RUN=1 and an invalid key");
test.setTimeout(150_000);

test("@live L12: provider rejects the key; banner, preserved values and retry button (AC-17)", async ({ page }, testInfo) => {
  const traffic = observeTraffic(page);
  const name = "Smartfon testowy";
  const date = warsawDotted(3);
  await openForm(page);
  await fillCase(page, {
    caseType: "Zwrot",
    category: "Smartfon",
    name,
    purchaseDate: date,
    photo: PHOTO.phone1,
  });
  await submitButton(page).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Nie udało się przeanalizować zgłoszenia." }),
  ).toBeVisible({ timeout: PROCESSING_TIMEOUT_MS });
  await expect(page.getByRole("button", { name: "Spróbuj ponownie" })).toBeVisible();

  // Back on the form with everything preserved, photo included.
  await expect(page.getByRole("radio", { name: "Zwrot" })).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Kategoria sprzętu" })).toHaveText("Smartfon");
  await expect(page.getByLabel("Nazwa lub model sprzętu")).toHaveValue(name);
  await expect(page.getByLabel("Data zakupu")).toHaveValue(date);
  await expect(page.getByRole("img", { name: "Podgląd zdjęcia: phone-1.jpg" })).toBeVisible();

  // The failure is a real provider rejection surfaced by our API, not a 2xx.
  const status = traffic.screeningStatus();
  expect(status).not.toBeNull();
  expect(status).toBeGreaterThanOrEqual(400);
  await testInfo.attach("L12-calls.json", {
    body: JSON.stringify(traffic.calls, null, 2),
    contentType: "application/json",
  });
});

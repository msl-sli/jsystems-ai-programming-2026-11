import { expect, test, type Page } from "@playwright/test";
import { REAL_JPEG, openForm } from "./helpers/form";

/** Reloads with a dialog listener; returns the dialog types seen. */
async function reloadCollectingDialogs(page: Page): Promise<string[]> {
  const seen: string[] = [];
  page.on("dialog", (d) => {
    seen.push(d.type());
    void d.accept();
  });
  await page.reload({ waitUntil: "load" });
  await page.getByLabel("Nazwa lub model sprzętu").waitFor();
  return seen;
}

const expectEmpty = async (page: Page) => {
  await expect(page.getByLabel("Nazwa lub model sprzętu")).toHaveValue("");
  await expect(page.getByRole("radio", { name: "Reklamacja" })).not.toBeChecked();
  await expect(page.getByRole("combobox", { name: "Kategoria sprzętu" })).toHaveText("Wybierz kategorię");
  await expect(page.getByRole("img", { name: /Podgląd zdjęcia/ })).toHaveCount(0);
};

test("AC-39: pristine page reloads without a dialog", async ({ page }) => {
  await openForm(page);
  expect(await reloadCollectingDialogs(page)).toEqual([]);
});

test("AC-39: typed value triggers beforeunload; form is empty after reload", async ({
  page,
}) => {
  await openForm(page);
  await page.getByLabel("Nazwa lub model sprzętu").fill("Dell");
  expect(await reloadCollectingDialogs(page)).toEqual(["beforeunload"]);
  await expectEmpty(page);
});

test("AC-39: only selecting a category (Radix select) triggers beforeunload", async ({
  page,
}) => {
  await openForm(page);
  await page.getByRole("combobox", { name: "Kategoria sprzętu" }).click();
  await page.getByRole("option", { name: "Laptop" }).click();
  await expect(page.getByRole("combobox", { name: "Kategoria sprzętu" })).toHaveText("Laptop");
  expect(await reloadCollectingDialogs(page)).toEqual(["beforeunload"]);
  await expectEmpty(page);
});

test("AC-39: only choosing a photo triggers beforeunload", async ({ page }) => {
  await openForm(page);
  await page.locator('input[type="file"]').setInputFiles(REAL_JPEG);
  await page.getByRole("img", { name: /Podgląd zdjęcia/ }).waitFor();
  expect(await reloadCollectingDialogs(page)).toEqual(["beforeunload"]);
  await expectEmpty(page);
});

test("AC-39: only choosing a case type triggers beforeunload", async ({
  page,
}) => {
  await openForm(page);
  await page.getByRole("radio", { name: "Zwrot" }).check();
  expect(await reloadCollectingDialogs(page)).toEqual(["beforeunload"]);
  await expectEmpty(page);
});

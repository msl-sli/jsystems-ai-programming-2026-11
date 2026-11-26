import { expect, test } from "@playwright/test";
import { openForm } from "./helpers/form";

// Regression for an observed defect: the first character typed on a fresh page is lost
// (real keyboard typing, no waiting makes a difference). Do not weaken.
test("first typed characters on a fresh form are kept (name field)", async ({
  page,
}) => {
  await openForm(page);
  const name = page.getByLabel("Nazwa lub model sprzętu");
  await name.click();
  await page.keyboard.type("Dell XPS", { delay: 50 });
  await expect(name).toHaveValue("Dell XPS");
});

test("first typed characters on a fresh form are kept (date field)", async ({
  page,
}) => {
  await openForm(page);
  const date = page.getByLabel("Data zakupu");
  await date.click();
  await page.keyboard.type("26.11.2025", { delay: 50 });
  await expect(date).toHaveValue("26.11.2025");
});

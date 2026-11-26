import { expect, test, type Page } from "@playwright/test";
import {
  COMPLAINT_DESCRIPTION,
  REAL_JPEG,
  REAL_NON_IMAGE,
  chooseCategory,
  daysFromToday,
  dotted,
  openForm,
  yearsAgo,
} from "./helpers/form";

const CATEGORIES = [
  "Laptop",
  "Smartfon",
  "Tablet",
  "Monitor",
  "Telewizor",
  "Słuchawki / audio",
  "Konsola do gier",
  "Inne",
];

const MSG = {
  name: "Podaj nazwę lub model sprzętu (2–100 znaków).",
  future: "Data zakupu nie może być z przyszłości.",
  old: "Podaj datę zakupu z ostatnich 10 lat.",
  complaint: "Opisz problem (20–2000 znaków).",
  format: "Dozwolone formaty: JPG, PNG, WEBP.",
};

const nameInput = (p: Page) => p.getByLabel("Nazwa lub model sprzętu");
const dateInput = (p: Page) => p.getByLabel("Data zakupu");
const descInput = (p: Page) => p.getByLabel(/^Powód \/ opis problemu/);
const photoInput = (p: Page) => p.locator('input[type="file"]');
const submitBtn = (p: Page) =>
  p.getByRole("button", { name: "Wyślij zgłoszenie" });

test.beforeEach(async ({ page }) => {
  await openForm(page);
});

test("AC-01..03: fields, option lists, nothing preselected", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Zgłoś reklamację lub zwrot" }),
  ).toBeVisible();
  const radios = page
    .getByRole("radiogroup", { name: "Rodzaj zgłoszenia" })
    .getByRole("radio");
  await expect(radios).toHaveCount(2);
  await expect(radios.nth(0)).toHaveAccessibleName("Reklamacja");
  await expect(radios.nth(1)).toHaveAccessibleName("Zwrot");
  await expect(radios.nth(0)).not.toBeChecked();
  await expect(radios.nth(1)).not.toBeChecked();

  const trigger = page.getByRole("combobox", { name: "Kategoria sprzętu" });
  await expect(trigger).toHaveText("Wybierz kategorię");
  await trigger.click();
  await expect(page.getByRole("option")).toHaveText(CATEGORIES);
  await expect(page.getByRole("option", { selected: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await expect(nameInput(page)).toHaveValue("");
  await expect(dateInput(page)).toHaveValue("");
  await expect(descInput(page)).toHaveValue("");
  await expect(photoInput(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Wybierz plik" })).toBeVisible();
  await expect(photoInput(page)).toHaveAttribute(
    "accept",
    "image/jpeg,image/png,image/webp",
  );
});

test("AC-04: name length message", async ({ page }) => {
  await nameInput(page).fill("a");
  await nameInput(page).blur();
  await expect(page.getByText(MSG.name)).toBeVisible();
  await nameInput(page).fill("ab");
  await expect(page.getByText(MSG.name)).toHaveCount(0);
  await nameInput(page).fill("x".repeat(101));
  await expect(page.getByText(MSG.name)).toBeVisible();
});

test("AC-05: future and too old purchase date messages", async ({ page }) => {
  await dateInput(page).fill(dotted(daysFromToday(1)));
  await dateInput(page).blur();
  await expect(page.getByText(MSG.future)).toBeVisible();
  await dateInput(page).fill(dotted(yearsAgo(10, 1)));
  await expect(page.getByText(MSG.old)).toBeVisible();
  await expect(page.getByText(MSG.future)).toHaveCount(0);
  await dateInput(page).fill(dotted(new Date()));
  await expect(page.getByText(MSG.old)).toHaveCount(0);
  await expect(page.getByText(MSG.future)).toHaveCount(0);
});

test("AC-05: calendar picker selects a date into the field", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Otwórz kalendarz" }).click();
  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();
  await grid.locator("button:not([disabled])").first().click();
  await expect(grid).toHaveCount(0);
  await expect(dateInput(page)).toHaveValue(/^\d{2}\.\d{2}\.\d{4}$/);
  await expect(page.getByText(MSG.future)).toHaveCount(0);
  await expect(page.getByText(MSG.old)).toHaveCount(0);
});

test("AC-05: typed date is accepted", async ({ page }) => {
  await dateInput(page).fill(dotted(yearsAgo(1)));
  await dateInput(page).blur();
  await expect(page.getByText(MSG.future)).toHaveCount(0);
  await expect(page.getByText(MSG.old)).toHaveCount(0);
  await expect(page.getByText("Podaj datę zakupu.")).toHaveCount(0);
});

test("AC-06/07: description rules and labels", async ({ page }) => {
  await page.getByRole("radio", { name: "Reklamacja" }).check();
  await expect(
    page.getByText("Powód / opis problemu (wymagane)"),
  ).toBeVisible();
  await descInput(page).fill("x".repeat(19));
  await descInput(page).blur();
  await expect(page.getByText(MSG.complaint)).toBeVisible();
  await descInput(page).fill("x".repeat(20));
  await expect(page.getByText(MSG.complaint)).toHaveCount(0);

  await page.getByRole("radio", { name: "Zwrot" }).check();
  await expect(
    page.getByText("Powód / opis problemu (opcjonalne)"),
  ).toBeVisible();
  await descInput(page).fill("");
  await descInput(page).blur();
  await expect(page.getByText(MSG.complaint)).toHaveCount(0);
});

test("AC-08: non-image file is rejected", async ({ page }) => {
  await photoInput(page).setInputFiles(REAL_NON_IMAGE);
  await expect(page.getByText(MSG.format)).toBeVisible();
  await expect(page.getByRole("img", { name: /Podgląd zdjęcia/ })).toHaveCount(
    0,
  );
});

test("AC-09: valid JPEG shows thumbnail, name, replace and remove", async ({
  page,
}) => {
  await photoInput(page).setInputFiles(REAL_JPEG);
  const thumb = page.getByRole("img", { name: "Podgląd zdjęcia: phone-1.jpg" });
  await expect(thumb).toBeVisible();
  await expect
    .poll(() => thumb.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByText("phone-1.jpg", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zmień" })).toBeVisible();
  await page.getByRole("button", { name: "Usuń" }).click();
  await expect(thumb).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Wybierz plik" })).toBeVisible();
});

test("AC-10: photo hint per case type", async ({ page }) => {
  const zwrot = "Pokaż cały sprzęt, tak aby było widać, że nie nosi śladów użytkowania.";
  const rekl = "Pokaż wyraźnie uszkodzenie lub problem.";
  await page.getByRole("radio", { name: "Zwrot" }).check();
  await expect(page.getByText(zwrot)).toBeVisible();
  await expect(page.getByText(rekl)).toHaveCount(0);
  await page.getByRole("radio", { name: "Reklamacja" }).check();
  await expect(page.getByText(rekl)).toBeVisible();
  await expect(page.getByText(zwrot)).toHaveCount(0);
  // Hint is above the photo drop zone.
  const hint = await page.getByText(rekl).boundingBox();
  const zone = await page.getByTestId("photo-dropzone").boundingBox();
  expect(hint!.y + hint!.height).toBeLessThanOrEqual(zone!.y + 1);
});

test("AC-11: AI notice sits above the submit button", async ({ page }) => {
  const notice = page.getByText(
    "Zdjęcie i opis zostaną przeanalizowane automatycznie przez system AI. Nie umieszczaj na zdjęciu danych osobowych.",
  );
  await expect(notice).toBeVisible();
  const n = await notice.boundingBox();
  const b = await submitBtn(page).boundingBox();
  expect(n!.y + n!.height).toBeLessThanOrEqual(b!.y + 1);
});

test("AC-12: invalid submit shows messages and focuses first invalid field", async ({
  page,
}) => {
  await submitBtn(page).click();
  await expect(page.getByText("Wybierz rodzaj zgłoszenia.")).toBeVisible();
  await expect(page.getByText("Wybierz kategorię sprzętu.")).toBeVisible();
  await expect(page.getByText(MSG.name)).toBeVisible();
  await expect(page.getByText("Podaj datę zakupu.")).toBeVisible();
  await expect(page.getByText("Dodaj zdjęcie sprzętu.")).toBeVisible();
  await expect(page.getByTestId("processing-screen")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Reklamacja" })).toBeFocused();

  // First invalid becomes the name field once type and category are set.
  await page.getByRole("radio", { name: "Zwrot" }).check();
  await chooseCategory(page, "Laptop");
  await submitBtn(page).click();
  await expect(nameInput(page)).toBeFocused();
  await expect(page.getByTestId("processing-screen")).toHaveCount(0);
});

test("AC-13: switching type keeps values and re-applies description rules", async ({
  page,
}) => {
  await page.getByRole("radio", { name: "Reklamacja" }).check();
  await chooseCategory(page, "Tablet");
  await nameInput(page).fill("iPad Air");
  await dateInput(page).fill(dotted(yearsAgo(1)));
  await descInput(page).fill("krótki");
  await photoInput(page).setInputFiles(REAL_JPEG);
  await descInput(page).blur();
  await expect(page.getByText(MSG.complaint)).toBeVisible();

  await page.getByRole("radio", { name: "Zwrot" }).check();
  await expect(page.getByText(MSG.complaint)).toHaveCount(0);
  await expect(nameInput(page)).toHaveValue("iPad Air");
  await expect(dateInput(page)).toHaveValue(dotted(yearsAgo(1)));
  await expect(descInput(page)).toHaveValue("krótki");
  await expect(page.getByRole("combobox", { name: "Kategoria sprzętu" })).toHaveText("Tablet");
  await expect(page.getByText("phone-1.jpg", { exact: true })).toBeVisible();

  await page.getByRole("radio", { name: "Reklamacja" }).check();
  await expect(page.getByText(MSG.complaint)).toBeVisible();
  await expect(descInput(page)).toHaveValue("krótki");
});

test("AC-42: whole form operable with keyboard only", async ({ page }) => {
  // Register early so file chooser interception is active before Enter is pressed.
  const chooserPromise = page.waitForEvent("filechooser");
  const key = (k: string) => page.keyboard.press(k);
  // Radio group: Tab enters the group, arrows select.
  await key("Tab");
  // Skip anything focusable before the form (header links).
  for (let i = 0; i < 10; i++) {
    if (
      await page
        .getByRole("radio", { name: "Reklamacja" })
        .evaluate((e) => e === document.activeElement)
    )
      break;
    await key("Tab");
  }
  await expect(page.getByRole("radio", { name: "Reklamacja" })).toBeFocused();
  // Radix RadioGroup moves focus in a setTimeout and checks the item only while the arrow key is
  // still down; hold the key like a person does instead of an instant keydown+keyup.
  const holdKey = (k: string) => page.keyboard.press(k, { delay: 80 });
  await holdKey("ArrowRight");
  await expect(page.getByRole("radio", { name: "Zwrot" })).toBeChecked();
  await holdKey("ArrowLeft");
  await expect(page.getByRole("radio", { name: "Reklamacja" })).toBeChecked();

  await key("Tab");
  const trigger = page.getByRole("combobox", { name: "Kategoria sprzętu" });
  await expect(trigger).toBeFocused();
  await key("Enter");
  await expect(page.getByRole("option").first()).toBeVisible();
  await key("ArrowDown");
  await key("ArrowDown");
  await key("Enter");
  await expect(trigger).toHaveText(/\S/);
  await expect(trigger).not.toHaveText("Wybierz kategorię");
  await expect(trigger).toBeFocused();

  await key("Tab");
  await expect(nameInput(page)).toBeFocused();
  await page.keyboard.type("Dell XPS 13");
  await key("Tab");
  await expect(dateInput(page)).toBeFocused();
  await page.keyboard.type(dotted(yearsAgo(1)));
  await key("Tab");
  const cal = page.getByRole("button", { name: "Otwórz kalendarz" });
  await expect(cal).toBeFocused();
  // Calendar via keyboard: open, then close with Escape.
  await key("Enter");
  await expect(page.getByRole("grid")).toBeVisible();
  await key("Escape");
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(cal).toBeFocused();

  await key("Tab");
  await expect(descInput(page)).toBeFocused();
  await page.keyboard.type(COMPLAINT_DESCRIPTION);
  await key("Tab");
  const choose = page.getByRole("button", { name: "Wybierz plik" });
  await expect(choose).toBeFocused();
  await key("Enter");
  const chooser = await chooserPromise;
  await chooser.setFiles(REAL_JPEG);
  await expect(page.getByText("phone-1.jpg", { exact: true })).toBeVisible();

  // Shift+Tab goes back, Tab forward again to the submit button.
  await key("Shift+Tab");
  await expect(descInput(page)).toBeFocused();
  await key("Tab");
  await key("Tab");
  await expect(page.getByRole("button", { name: "Usuń" })).toBeFocused();
  await key("Tab");
  await expect(submitBtn(page)).toBeFocused();
  // Stop before submitting: a valid case would reach the processing screen (LLM).
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
});

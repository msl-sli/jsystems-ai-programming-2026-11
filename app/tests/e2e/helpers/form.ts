import path from "node:path";
import { expect, type Page } from "@playwright/test";

const IMAGES = path.resolve(__dirname, "../../../../assets/example-images");
export const REAL_JPEG = path.join(IMAGES, "phone-1.jpg");
export const REAL_PNG_NAMED_JPEG = path.join(IMAGES, "laptop-1.png");
export const REAL_WEBP = path.join(IMAGES, "laptop-2.webp");
// Not an image: a real repo file used for the rejected-format case (assets has no non-image photo).
export const REAL_NON_IMAGE = path.join(IMAGES, "README.md");

export const COMPLAINT_DESCRIPTION =
  "Ekran laptopa ma pęknięcie po prawej stronie.";

/** Waits until the form is hydrated and rendered (it renders after the browser date is known). */
/**
 * Picks a category like a person: open the list, choose, and continue only once the list has
 * closed and Radix Select has returned focus to its trigger. Typing into the next field before
 * that lets the asynchronous focus return steal the keystrokes (seen in Firefox under load).
 */
export async function chooseCategory(page: Page, name: string) {
  const trigger = page.getByRole("combobox", { name: "Kategoria sprzętu" });
  await trigger.click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toBeFocused();
}

export async function openForm(page: Page) {
  await page.goto("/");
  await page.getByLabel("Nazwa lub model sprzętu").waitFor();
}

export function dotted(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function daysFromToday(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export function yearsAgo(years: number, extraDays = 0): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - extraDays);
  return d;
}

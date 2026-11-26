import { expect, test } from "@playwright/test";
import { openForm } from "./helpers/form";

for (const width of [360, 393, 768, 1280, 1920]) {
  test(`AC-41/TAC-001-05: layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openForm(page);
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      bsw: document.body.scrollWidth,
    }));
    expect(m.sw).toBeLessThanOrEqual(m.cw);
    expect(m.bsw).toBeLessThanOrEqual(m.cw);

    await expect(page.getByRole("banner")).toBeVisible();
    const form = await page.getByRole("form").boundingBox();
    expect(form).not.toBeNull();
    const left = form!.x;
    const right = width - (form!.x + form!.width);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
    expect(form!.width).toBeLessThanOrEqual(width);

    const submit = page.getByRole("button", { name: "Wyślij zgłoszenie" });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    const box = await submit.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  });
}

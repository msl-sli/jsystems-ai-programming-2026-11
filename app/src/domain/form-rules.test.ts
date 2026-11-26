import { describe, expect, it } from "vitest";
import { DESCRIPTION_MAX, earliestPurchaseDate } from "./case-schema";
import {
  AI_NOTICE,
  descriptionLabel,
  descriptionMaxLength,
  photoHint,
  purchaseDateBounds,
} from "./form-rules";

describe("purchaseDateBounds", () => {
  it("uses the earliest purchase date as min and today as max", () => {
    const today = "2026-11-26";
    expect(purchaseDateBounds(today)).toEqual({
      min: earliestPurchaseDate(today),
      max: today,
    });
  });
});

describe("descriptionLabel", () => {
  it("marks complaint as required", () => {
    expect(descriptionLabel("complaint")).toBe(
      "Powód / opis problemu (wymagane)",
    );
  });
  it("marks return as optional", () => {
    expect(descriptionLabel("return")).toBe(
      "Powód / opis problemu (opcjonalne)",
    );
  });
  it("has no suffix before a type is chosen", () => {
    expect(descriptionLabel(undefined)).toBe("Powód / opis problemu");
  });
});

describe("photoHint", () => {
  it("returns the return hint", () => {
    expect(photoHint("return")).toBe(
      "Pokaż cały sprzęt, tak aby było widać, że nie nosi śladów użytkowania.",
    );
  });
  it("returns the complaint hint", () => {
    expect(photoHint("complaint")).toBe(
      "Pokaż wyraźnie uszkodzenie lub problem.",
    );
  });
  it("returns null without a type", () => {
    expect(photoHint(undefined)).toBeNull();
  });
});

describe("constants", () => {
  it("AI notice is verbatim", () => {
    expect(AI_NOTICE).toBe(
      "Zdjęcie i opis zostaną przeanalizowane automatycznie przez system AI. Nie umieszczaj na zdjęciu danych osobowych.",
    );
  });
  it("re-exports the description limit", () => {
    expect(descriptionMaxLength).toBe(2000);
    expect(descriptionMaxLength).toBe(DESCRIPTION_MAX);
  });
});

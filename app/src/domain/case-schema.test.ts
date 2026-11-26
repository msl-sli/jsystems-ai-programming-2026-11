import { describe, expect, it } from "vitest";
import {
  CASE_CATEGORIES,
  CASE_CATEGORY_LABELS,
  CASE_INPUT_MESSAGES,
  CaseInputSchema,
  buildCaseInputSchema,
} from "./case-schema";

const TODAY = "2026-11-26";

const validReturn = {
  caseType: "return",
  category: "smartphone",
  productName: "Telefon X1",
  purchaseDate: "2026-11-20",
  description: "",
};

const validComplaint = {
  caseType: "complaint",
  category: "laptop",
  productName: "Laptop Pro 14",
  purchaseDate: "2026-01-10",
  description: "Na ekranie pojawiają się pionowe linie od tygodnia.",
};

function issuesFor(input: unknown, today = TODAY) {
  const result = buildCaseInputSchema(today).safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("CASE_CATEGORIES (AC-03)", () => {
  it("lists exactly the eight categories in PRD order with Polish labels", () => {
    expect(CASE_CATEGORIES.map((c) => CASE_CATEGORY_LABELS[c])).toEqual([
      "Laptop",
      "Smartfon",
      "Tablet",
      "Monitor",
      "Telewizor",
      "Słuchawki / audio",
      "Konsola do gier",
      "Inne",
    ]);
  });
});

describe("buildCaseInputSchema", () => {
  it("accepts a valid return with an empty description (AC-07)", () => {
    expect(issuesFor(validReturn)).toEqual({});
  });

  it("accepts a valid complaint", () => {
    expect(issuesFor(validComplaint)).toEqual({});
  });

  it("requires a case type and a category without defaults (AC-02, AC-03)", () => {
    const issues = issuesFor({ ...validReturn, caseType: undefined, category: undefined });
    expect(issues.caseType).toBe(CASE_INPUT_MESSAGES.caseTypeRequired);
    expect(issues.category).toBe(CASE_INPUT_MESSAGES.categoryRequired);
  });

  it("rejects an unknown case type and category", () => {
    const issues = issuesFor({ ...validReturn, caseType: "exchange", category: "fridge" });
    expect(issues.caseType).toBe(CASE_INPUT_MESSAGES.caseTypeRequired);
    expect(issues.category).toBe(CASE_INPUT_MESSAGES.categoryRequired);
  });

  it.each([
    ["", false],
    ["A", false],
    ["  A  ", false],
    ["AB", true],
    ["x".repeat(100), true],
    ["x".repeat(101), false],
  ])("productName %j valid=%s (AC-04)", (productName, ok) => {
    const issues = issuesFor({ ...validReturn, productName });
    expect(issues.productName).toBe(
      ok ? undefined : "Podaj nazwę lub model sprzętu (2–100 znaków).",
    );
  });

  it.each([
    ["2026-11-27", "Data zakupu nie może być z przyszłości."],
    ["2026-11-26", undefined],
    ["2016-11-26", undefined],
    ["2016-11-25", "Podaj datę zakupu z ostatnich 10 lat."],
  ])("purchaseDate %s relative to today 2026-11-26 (AC-05)", (purchaseDate, message) => {
    expect(issuesFor({ ...validReturn, purchaseDate }).purchaseDate).toBe(message);
  });

  it("handles the 10-year bound from a leap day", () => {
    expect(issuesFor({ ...validReturn, purchaseDate: "2018-02-28" }, "2028-02-29").purchaseDate).toBe(
      undefined,
    );
    expect(issuesFor({ ...validReturn, purchaseDate: "2018-02-27" }, "2028-02-29").purchaseDate).toBe(
      CASE_INPUT_MESSAGES.purchaseDateTooOld,
    );
  });

  it.each(["", "2026-13-01", "2026-02-30", "26-11-2026", "2026-1-5"])(
    "rejects a missing or malformed purchase date %j",
    (purchaseDate) => {
      expect(issuesFor({ ...validReturn, purchaseDate }).purchaseDate).toBe(
        CASE_INPUT_MESSAGES.purchaseDateRequired,
      );
    },
  );

  it.each([
    ["", false],
    ["x".repeat(19), false],
    [" ".repeat(25) + "x".repeat(19), false],
    ["x".repeat(20), true],
    ["x".repeat(2000), true],
    ["x".repeat(2001), false],
  ])("complaint description length %#: valid=%s (AC-06)", (description, ok) => {
    expect(issuesFor({ ...validComplaint, description }).description).toBe(
      ok ? undefined : "Opisz problem (20–2000 znaków).",
    );
  });

  it.each([
    ["", true],
    ["krótko", true],
    ["x".repeat(2000), true],
    ["x".repeat(2001), false],
  ])("return description length %#: valid=%s (AC-07)", (description, ok) => {
    expect(issuesFor({ ...validReturn, description }).description).toBe(
      ok ? undefined : CASE_INPUT_MESSAGES.returnDescriptionTooLong,
    );
  });

  it("re-applies the description rules when the case type changes (AC-13)", () => {
    const short = "Nie pasuje kolor.";
    expect(issuesFor({ ...validReturn, description: short }).description).toBeUndefined();
    expect(issuesFor({ ...validReturn, caseType: "complaint", description: short }).description).toBe(
      CASE_INPUT_MESSAGES.complaintDescription,
    );
  });

  it("reports every invalid field at once, including the description rule (AC-12)", () => {
    const issues = issuesFor({
      caseType: "complaint",
      category: undefined,
      productName: "A",
      purchaseDate: "2027-01-01",
      description: "krótko",
    });
    expect(Object.keys(issues).sort()).toEqual([
      "category",
      "description",
      "productName",
      "purchaseDate",
    ]);
  });

  it("trims productName and description in the parsed output", () => {
    const parsed = buildCaseInputSchema(TODAY).parse({
      ...validComplaint,
      productName: "  Laptop Pro 14 ",
      description: `  ${validComplaint.description}  `,
    });
    expect(parsed.productName).toBe("Laptop Pro 14");
    expect(parsed.description).toBe(validComplaint.description);
  });

  it("rejects unknown keys", () => {
    expect(buildCaseInputSchema(TODAY).safeParse({ ...validReturn, extra: 1 }).success).toBe(false);
  });
});

describe("CaseInputSchema (server, no date bounds)", () => {
  it("accepts dates outside the form bounds because the server recomputes facts", () => {
    expect(CaseInputSchema.safeParse({ ...validReturn, purchaseDate: "2030-01-01" }).success).toBe(
      true,
    );
  });

  it("still enforces the field rules", () => {
    expect(CaseInputSchema.safeParse({ ...validComplaint, description: "krótko" }).success).toBe(
      false,
    );
    expect(CaseInputSchema.safeParse({ ...validReturn, purchaseDate: "2026-02-30" }).success).toBe(
      false,
    );
  });
});

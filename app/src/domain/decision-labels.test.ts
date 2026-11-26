import { describe, expect, it } from "vitest";
import { DECISION_CATEGORIES } from "./contracts";
import {
  CATEGORIES_BY_CASE_TYPE,
  DECISION_LABELS,
  categoryBelongsToCaseType,
  decisionLabel,
} from "./decision-labels";

describe("DECISION_LABELS", () => {
  it("matches AC-18/AC-19 verbatim (en dash U+2013)", () => {
    expect(DECISION_LABELS).toEqual({
      return_accepted: "Zwrot przyjęty",
      return_rejected: "Zwrot odrzucony",
      complaint_accepted_repair: "Reklamacja przyjęta – naprawa",
      complaint_accepted_replacement_or_refund:
        "Reklamacja przyjęta – wymiana lub zwrot pieniędzy",
      complaint_rejected: "Reklamacja odrzucona",
      manual_review: "Wymaga weryfikacji przez konsultanta",
    });
  });

  it("covers every category and decisionLabel reads the table", () => {
    for (const c of DECISION_CATEGORIES)
      expect(decisionLabel(c)).toBe(DECISION_LABELS[c]);
  });
});

describe("categories by case type", () => {
  it("lists the allowed categories per case type", () => {
    expect([...CATEGORIES_BY_CASE_TYPE.return]).toEqual([
      "return_accepted",
      "return_rejected",
      "manual_review",
    ]);
    expect([...CATEGORIES_BY_CASE_TYPE.complaint]).toEqual([
      "complaint_accepted_repair",
      "complaint_accepted_replacement_or_refund",
      "complaint_rejected",
      "manual_review",
    ]);
  });

  it("categoryBelongsToCaseType agrees with the table for every pair", () => {
    for (const caseType of ["return", "complaint"] as const) {
      for (const c of DECISION_CATEGORIES) {
        expect(categoryBelongsToCaseType(caseType, c)).toBe(
          CATEGORIES_BY_CASE_TYPE[caseType].includes(c),
        );
      }
    }
    expect(categoryBelongsToCaseType("return", "complaint_rejected")).toBe(
      false,
    );
    expect(categoryBelongsToCaseType("complaint", "return_accepted")).toBe(
      false,
    );
    expect(categoryBelongsToCaseType("return", "manual_review")).toBe(true);
  });
});

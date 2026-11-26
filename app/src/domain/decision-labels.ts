import type { CaseType } from "./case-schema";
import type { DecisionCategory } from "./contracts";

/** AC-18 / AC-19, verbatim (en dash U+2013 in the complaint labels). */
export const DECISION_LABELS: Record<DecisionCategory, string> = {
  return_accepted: "Zwrot przyjęty",
  return_rejected: "Zwrot odrzucony",
  complaint_accepted_repair: "Reklamacja przyjęta – naprawa",
  complaint_accepted_replacement_or_refund:
    "Reklamacja przyjęta – wymiana lub zwrot pieniędzy",
  complaint_rejected: "Reklamacja odrzucona",
  manual_review: "Wymaga weryfikacji przez konsultanta",
};

export function decisionLabel(category: DecisionCategory): string {
  return DECISION_LABELS[category];
}

export const CATEGORIES_BY_CASE_TYPE: Record<
  CaseType,
  readonly DecisionCategory[]
> = {
  return: ["return_accepted", "return_rejected", "manual_review"],
  complaint: [
    "complaint_accepted_repair",
    "complaint_accepted_replacement_or_refund",
    "complaint_rejected",
    "manual_review",
  ],
};

export function categoryBelongsToCaseType(
  caseType: CaseType,
  category: DecisionCategory,
): boolean {
  return CATEGORIES_BY_CASE_TYPE[caseType].includes(category);
}

import type { CaseType } from "./case-schema";
import type {
  ChangeRefusalReason,
  DecisionCategory,
  DeterministicFacts,
  Outcome,
} from "./contracts";
import { DECISION_LABELS } from "./decision-labels";

export type ResolvedOutcome =
  | {
      ok: true;
      category: DecisionCategory;
      label: string;
      citedRuleIds: string[];
    }
  | { ok: false; why: Exclude<ChangeRefusalReason, "no_change"> };

const MAX_CITED = 5;
const REMEDY_RULE = "CMP-4";
const OTHER_PREFIX: Record<CaseType, string> = {
  return: "CMP-",
  complaint: "RET-",
};

function accept(
  category: DecisionCategory,
  citedRuleIds: string[],
): ResolvedOutcome {
  return { ok: true, category, label: DECISION_LABELS[category], citedRuleIds };
}

/**
 * Maps an abstract outcome to a category (ADR-003 §3.1). Rule IDs are validated first
 * (empty / foreign case type / not in the loaded policy), then the date windows.
 */
export function resolveOutcome(
  caseType: CaseType,
  outcome: Outcome,
  facts: DeterministicFacts,
  citedRuleIds: readonly string[],
  policyRuleIds: readonly string[],
): ResolvedOutcome {
  // Validate every unique ID first, then truncate, so extra IDs cannot bypass validation.
  const unique = [...new Set(citedRuleIds)];
  if (unique.some((id) => id.startsWith(OTHER_PREFIX[caseType]))) {
    return { ok: false, why: "not_allowed_for_case_type" };
  }
  if (unique.length === 0 || unique.some((id) => !policyRuleIds.includes(id))) {
    return { ok: false, why: "unknown_rule_id" };
  }
  const ids = unique.slice(0, MAX_CITED);

  // A date rule (RET-1 / CMP-1) decides the case: no source may turn it into anything but a
  // rejection, not even manual review (AC-20, AC-21).
  if (outcome === "manual_review") {
    if (caseType === "return" && !facts.withinReturnWindow) {
      return { ok: false, why: "outside_return_window" };
    }
    if (caseType === "complaint" && !facts.withinWarranty) {
      return { ok: false, why: "outside_warranty" };
    }
    return accept("manual_review", ids);
  }

  if (caseType === "return") {
    if (outcome === "rejected") return accept("return_rejected", ids);
    return facts.withinReturnWindow
      ? accept("return_accepted", ids)
      : { ok: false, why: "outside_return_window" };
  }

  if (outcome === "rejected") return accept("complaint_rejected", ids);
  if (!facts.withinWarranty) return { ok: false, why: "outside_warranty" };
  const withRemedy = ids.includes(REMEDY_RULE)
    ? ids
    : [...ids.slice(0, MAX_CITED - 1), REMEDY_RULE];
  return accept(
    facts.withinDeadOnArrival
      ? "complaint_accepted_replacement_or_refund"
      : "complaint_accepted_repair",
    withRemedy,
  );
}

/**
 * Screening router (ADR-003 section 3.3). Pure: no I/O, no clock, no model calls.
 * Rules are evaluated in table order and the first match wins.
 */
import type { CaseCategory, CaseInput } from "./case-schema";
import {
  SCREENING_QUESTION_IDS,
  type DecisionCategory,
  type DecisionMode,
  type DeterministicFacts,
  type ManualReviewKind,
  type Route,
  type RouteRule,
  type ScreeningQuestionId,
  type ScreeningResult,
} from "./contracts";

export type AnswerKind = "choice" | "boolean" | "score";
type ObservedCategory =
  ScreeningResult["answers"]["observed_category"]["value"];

/** Certainty of one answer, computed from its probabilities (ADR-003 section 3.2). */
export function certaintyOf(
  kind: AnswerKind,
  probabilities: Record<string, number>,
): number {
  if (kind === "boolean") {
    const yes = probabilities["true"];
    const no = probabilities["false"];
    const p = yes ?? (no === undefined ? undefined : 1 - no);
    return p === undefined ? 0 : Math.max(p, 1 - p);
  }
  return Math.max(0, ...Object.values(probabilities));
}

export function isConfident(certainty: number, threshold: number): boolean {
  return certainty >= threshold;
}

/**
 * Questions that are refused, have no value or fall below the threshold, in question order.
 * Recomputed from `certainty` and `refused`: the screening comes through the client, so its
 * own `confident` flags and `uncertainAreas` list are never trusted.
 */
export function uncertainAreasOf(
  screening: ScreeningResult,
  threshold: number,
): ScreeningQuestionId[] {
  return SCREENING_QUESTION_IDS.filter((id) => {
    const answer = screening.answers[id];
    return (
      answer.refused ||
      answer.value === null ||
      !isConfident(answer.certainty, threshold)
    );
  });
}

/** R5: does the observed category agree with the form category? */
export function categoryMatches(
  formCategory: CaseCategory,
  observed: ObservedCategory,
): boolean {
  if (observed === "no_device") return false;
  if (formCategory === "other") return true;
  return observed === formCategory;
}

export function routeCase(
  caseInput: CaseInput,
  screening: ScreeningResult,
  facts: DeterministicFacts,
  mode: DecisionMode,
  threshold: number,
): Route {
  const isReturn = caseInput.caseType === "return";
  const llmAlways = mode === "llm-always";
  const decisionsOnly = mode === "decisions-only";
  const uncertainAreas = uncertainAreasOf(screening, threshold);

  const llm = (rule: RouteRule, fixedCategory?: DecisionCategory): Route =>
    fixedCategory === undefined
      ? { kind: "llm", rule, uncertainAreas }
      : { kind: "llm", rule, uncertainAreas, fixedCategory };
  const template = (
    rule: RouteRule,
    category: DecisionCategory,
    citedRuleIds: string[],
    manualReviewKind: ManualReviewKind = null,
  ): Route => ({
    kind: "template",
    rule,
    category,
    citedRuleIds,
    manualReviewKind,
  });

  // R1, R2: date rules.
  if (isReturn && !facts.withinReturnWindow) {
    return llmAlways
      ? llm("R1", "return_rejected")
      : template("R1", "return_rejected", ["RET-1"]);
  }
  if (!isReturn && !facts.withinWarranty) {
    return llmAlways
      ? llm("R2", "complaint_rejected")
      : template("R2", "complaint_rejected", ["CMP-1"]);
  }

  const photoRule = isReturn ? "RET-3" : "CMP-6";

  // R3: any critical answer not confident or refused.
  if (uncertainAreas.length > 0) {
    if (!decisionsOnly) return llm("R3");
    return uncertainAreas.includes("photo_quality")
      ? template("R3", "manual_review", [photoRule], "better_photo")
      : template(
          "R3",
          "manual_review",
          [isReturn ? "RET-4" : "CMP-6"],
          "contact_support",
        );
  }

  // R4, R5: photo gate.
  const answers = screening.answers;
  if (answers.photo_quality.value !== "ok") {
    return llmAlways
      ? llm("R4")
      : template("R4", "manual_review", [photoRule], "better_photo");
  }
  if (!categoryMatches(caseInput.category, answers.observed_category.value)) {
    return llmAlways
      ? llm("R5")
      : template("R5", "manual_review", [photoRule], "better_photo");
  }

  const damage = answers.visible_damage_or_use.value;

  if (!isReturn) {
    // R10: complaint that passed the gates.
    if (!decisionsOnly) return llm("R10");
    if (damage === true) {
      return template("R10", "manual_review", ["CMP-6"], "contact_support");
    }
    return template(
      "R10",
      facts.withinDeadOnArrival
        ? "complaint_accepted_replacement_or_refund"
        : "complaint_accepted_repair",
      ["CMP-6", "CMP-4"],
    );
  }

  // R6: a return description may reveal use (RET-5); decisions-only ignores it.
  if (caseInput.description.trim() !== "" && !decisionsOnly) return llm("R6");

  // After R3 the condition is a confident, non-null answer; Number() only narrows the type.
  const level = Number(answers.condition.value);
  if (damage === true && level >= 1) {
    return llmAlways ? llm("R7") : template("R7", "return_rejected", ["RET-2"]);
  }
  if (damage === false && level === 0) {
    return llmAlways
      ? llm("R8")
      : template("R8", "return_accepted", ["RET-1", "RET-2"]);
  }

  // R9: the remaining combinations contradict each other.
  return decisionsOnly
    ? template("R9", "manual_review", ["RET-4"], "contact_support")
    : llm("R9");
}

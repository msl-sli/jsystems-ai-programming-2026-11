/**
 * Shared contracts (ADR-000 §5, ADR-002 §4, ADR-003 §4). Pure zod: no `ai`, `next` or server imports.
 * Changes to this file are serialized through the orchestrator (plan §4 hotspots).
 */
import { z } from "zod";
import { CASE_CATEGORIES, CASE_TYPES, CaseInputSchema } from "./case-schema";

export { CaseInputSchema, type CaseInput } from "./case-schema";

// ---------------------------------------------------------------- constants

/** AC-26, verbatim. */
export const AUTOMATED_DECISION_NOTICE =
  "Decyzja została przygotowana automatycznie. Ostateczna weryfikacja nastąpi po otrzymaniu sprzętu przez nasz serwis.";

export const RULE_ID_PATTERN = /^(RET|CMP)-\d+$/;
export const RuleIdSchema = z.string().regex(RULE_ID_PATTERN);
const CitedRuleIdsSchema = z.array(RuleIdSchema).min(1).max(5);

export const CaseTypeSchema = z.enum(CASE_TYPES);
export const CaseCategorySchema = z.enum(CASE_CATEGORIES);

// ---------------------------------------------------------------- image

export const IMAGE_MAX_DIMENSION = 4096;

export const CaseImageSchema = z.strictObject({
  mediaType: z.literal("image/jpeg"),
  base64: z.string().min(1),
  width: z.int().min(1).max(IMAGE_MAX_DIMENSION),
  height: z.int().min(1).max(IMAGE_MAX_DIMENSION),
});
export type CaseImage = z.infer<typeof CaseImageSchema>;

// ---------------------------------------------------------------- screening

export const PHOTO_QUALITY_VALUES = [
  "ok",
  "blurry",
  "too_dark",
  "device_not_fully_visible",
  "no_device",
] as const;
export const OBSERVED_CATEGORY_VALUES = [
  "laptop",
  "smartphone",
  "tablet",
  "monitor",
  "tv",
  "audio",
  "console",
  "other_electronics",
  "no_device",
] as const;
export const CONDITION_LEVELS = [0, 1, 2, 3] as const;

export const SCREENING_QUESTION_IDS = [
  "photo_quality",
  "observed_category",
  "visible_damage_or_use",
  "condition",
] as const;
export const ScreeningQuestionIdSchema = z.enum(SCREENING_QUESTION_IDS);
export type ScreeningQuestionId = z.infer<typeof ScreeningQuestionIdSchema>;

const Probability = z.number().min(0).max(1);

function answerSchema<T extends z.ZodType>(value: T) {
  return z.strictObject({
    /** null only when the question was refused. */
    value: value.nullable(),
    probabilities: z.record(z.string(), Probability),
    certainty: Probability,
    confident: z.boolean(),
    refused: z.boolean(),
    providerConfidence: Probability.optional(),
  });
}

export const ScreeningAnswersSchema = z.strictObject({
  photo_quality: answerSchema(z.enum(PHOTO_QUALITY_VALUES)),
  observed_category: answerSchema(z.enum(OBSERVED_CATEGORY_VALUES)),
  visible_damage_or_use: answerSchema(z.boolean()),
  condition: answerSchema(z.union(CONDITION_LEVELS.map((l) => z.literal(l)))),
});
export type ScreeningAnswers = z.infer<typeof ScreeningAnswersSchema>;

export const ScreeningResultSchema = z.strictObject({
  answers: ScreeningAnswersSchema,
  uncertainAreas: z.array(ScreeningQuestionIdSchema),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  costCredits: z.number().min(0).optional(),
  latencyMs: z.number().min(0),
});
export type ScreeningResult = z.infer<typeof ScreeningResultSchema>;

// ---------------------------------------------------------------- facts, route, decision

export const DeterministicFactsSchema = z.strictObject({
  today: z.string(),
  daysSincePurchase: z.int(),
  withinReturnWindow: z.boolean(),
  withinWarranty: z.boolean(),
  withinDeadOnArrival: z.boolean(),
});
export type DeterministicFacts = z.infer<typeof DeterministicFactsSchema>;

export const DECISION_CATEGORIES = [
  "return_accepted",
  "return_rejected",
  "complaint_accepted_repair",
  "complaint_accepted_replacement_or_refund",
  "complaint_rejected",
  "manual_review",
] as const;
export const DecisionCategorySchema = z.enum(DECISION_CATEGORIES);
export type DecisionCategory = z.infer<typeof DecisionCategorySchema>;

export const OUTCOMES = ["accepted", "rejected", "manual_review"] as const;
export const OutcomeSchema = z.enum(OUTCOMES);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const ManualReviewKindSchema = z.enum(["better_photo", "contact_support"]).nullable();
export type ManualReviewKind = z.infer<typeof ManualReviewKindSchema>;

export const ROUTE_RULES = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10"] as const;
export const RouteRuleSchema = z.enum(ROUTE_RULES);
export type RouteRule = z.infer<typeof RouteRuleSchema>;

export const DECISION_MODES = ["hybrid", "decisions-only", "llm-always"] as const;
export const DecisionModeSchema = z.enum(DECISION_MODES);
export type DecisionMode = z.infer<typeof DecisionModeSchema>;

export const DecisionPathSchema = z.enum(["template", "llm"]);
export type DecisionPath = z.infer<typeof DecisionPathSchema>;

export const TemplateRouteSchema = z.strictObject({
  kind: z.literal("template"),
  rule: RouteRuleSchema,
  category: DecisionCategorySchema,
  citedRuleIds: CitedRuleIdsSchema,
  manualReviewKind: ManualReviewKindSchema,
});
export const LlmRouteSchema = z.strictObject({
  kind: z.literal("llm"),
  rule: RouteRuleSchema,
  uncertainAreas: z.array(ScreeningQuestionIdSchema),
  /** Set for R1/R2 in llm-always mode: category is fixed by code, the LLM only explains. */
  fixedCategory: DecisionCategorySchema.optional(),
});
export const RouteSchema = z.discriminatedUnion("kind", [TemplateRouteSchema, LlmRouteSchema]);
export type Route = z.infer<typeof RouteSchema>;
export type TemplateRoute = z.infer<typeof TemplateRouteSchema>;
export type LlmRoute = z.infer<typeof LlmRouteSchema>;

export const DecisionResultSchema = z.strictObject({
  category: DecisionCategorySchema,
  label: z.string().min(1),
  citedRuleIds: CitedRuleIdsSchema,
  justification: z.string().min(1),
  photoFindingsSummary: z.string().min(1),
  nextSteps: z.array(z.string().min(1)).min(1),
  manualReviewKind: ManualReviewKindSchema,
  decisionPath: DecisionPathSchema,
  routeRule: RouteRuleSchema,
  mode: DecisionModeSchema,
});
export type DecisionResult = z.infer<typeof DecisionResultSchema>;

export const FirstMessageSchema = z.strictObject({
  greeting: z.string().min(1),
  decisionLabel: z.string().min(1),
  justification: z.string().min(1),
  photoFindings: z.string().min(1),
  nextSteps: z.array(z.string().min(1)).min(1),
  notice: z.literal(AUTOMATED_DECISION_NOTICE),
});
export type FirstMessage = z.infer<typeof FirstMessageSchema>;

// ---------------------------------------------------------------- LLM structured output

export const EvidenceSchema = z.strictObject({
  source: z.enum(["photo", "date", "description", "screening"]),
  text: z.string().min(1).max(200),
});

const SignalReviewItemSchema = z.strictObject({
  verdict: z.enum(["agree", "disagree", "not_assessable"]),
  note: z.string().max(160),
});
export const SignalReviewSchema = z.strictObject({
  photo_quality: SignalReviewItemSchema,
  observed_category: SignalReviewItemSchema,
  visible_damage_or_use: SignalReviewItemSchema,
  condition: SignalReviewItemSchema,
});

/** Structured output of the escalated decision call (ADR-003 §4). */
export const DecisionOutputSchema = z
  .strictObject({
    outcome: OutcomeSchema,
    photoProblem: z.boolean(),
    citedRuleIds: CitedRuleIdsSchema,
    evidence: z.array(EvidenceSchema).min(1).max(5),
    signalReview: SignalReviewSchema,
    greetingPl: z.string().min(1).max(200),
    justificationPl: z.string().min(40).max(1200),
    photoFindingsPl: z.string().min(20).max(600),
    nextStepsPl: z.array(z.string().min(1).max(240)).min(1).max(6),
    uncertaintyPl: z.string().min(1).max(400).nullable(),
  })
  .refine((o) => o.outcome !== "manual_review" || o.uncertaintyPl !== null, {
    path: ["uncertaintyPl"],
    message: "uncertaintyPl is required for manual_review",
  });
export type DecisionOutput = z.infer<typeof DecisionOutputSchema>;

export const LlmFindingsSchema = z.strictObject({
  photoFindingsPl: z.string().min(1).max(600),
  evidence: z.array(EvidenceSchema).max(5),
  signalReview: SignalReviewSchema.partial(),
});
export type LlmFindings = z.infer<typeof LlmFindingsSchema>;

// ---------------------------------------------------------------- chat

export const DecisionHistoryEntrySchema = z.strictObject({
  category: DecisionCategorySchema,
  label: z.string().min(1),
  citedRuleIds: CitedRuleIdsSchema,
  source: z.enum(["initial", "chat"]),
  manualReviewKind: ManualReviewKindSchema,
});
export type DecisionHistoryEntry = z.infer<typeof DecisionHistoryEntrySchema>;

export const DECISION_HISTORY_MAX = 20;

/** Payload of the custom `data-decision` UI message part (ADR-001 §3, ADR-002 §5). */
export const DecisionDataPartSchema = z.strictObject({
  category: DecisionCategorySchema,
  label: z.string().min(1),
  citedRuleIds: CitedRuleIdsSchema,
  manualReviewKind: ManualReviewKindSchema,
});
export type DecisionDataPart = z.infer<typeof DecisionDataPartSchema>;

export const ChangeDecisionInputSchema = z.strictObject({
  outcome: OutcomeSchema,
  citedRuleIds: CitedRuleIdsSchema,
  reason: z.string().min(1).max(400),
});
export type ChangeDecisionInput = z.infer<typeof ChangeDecisionInputSchema>;

export const CHANGE_REFUSAL_REASONS = [
  "outside_return_window",
  "outside_warranty",
  "not_allowed_for_case_type",
  "unknown_rule_id",
  "no_change",
] as const;
export const ChangeRefusalReasonSchema = z.enum(CHANGE_REFUSAL_REASONS);
export type ChangeRefusalReason = z.infer<typeof ChangeRefusalReasonSchema>;

export const ChangeDecisionResultSchema = z.discriminatedUnion("accepted", [
  z.strictObject({
    accepted: z.literal(true),
    category: DecisionCategorySchema,
    label: z.string().min(1),
  }),
  z.strictObject({ accepted: z.literal(false), why: ChangeRefusalReasonSchema }),
]);
export type ChangeDecisionResult = z.infer<typeof ChangeDecisionResultSchema>;

export const ChatCaseContextSchema = z.strictObject({
  caseInput: CaseInputSchema,
  screening: ScreeningResultSchema,
  decisionHistory: z.array(DecisionHistoryEntrySchema).min(1).max(DECISION_HISTORY_MAX),
  firstMessage: FirstMessageSchema,
  llmFindings: LlmFindingsSchema.optional(),
});
export type ChatCaseContext = z.infer<typeof ChatCaseContextSchema>;

export const CHAT_MESSAGE_MAX_CHARS = 1000;
export const CHAT_MESSAGES_MAX = 100;

// ---------------------------------------------------------------- HTTP

export const ScreeningRequestSchema = z.strictObject({
  caseInput: CaseInputSchema,
  caseImage: CaseImageSchema,
});
export type ScreeningRequest = z.infer<typeof ScreeningRequestSchema>;

export const ScreeningResponseSchema = z.strictObject({ screening: ScreeningResultSchema });
export type ScreeningResponse = z.infer<typeof ScreeningResponseSchema>;

export const DecisionRequestSchema = z.strictObject({
  caseInput: CaseInputSchema,
  caseImage: CaseImageSchema,
  screening: ScreeningResultSchema,
});
export type DecisionRequest = z.infer<typeof DecisionRequestSchema>;

export const DecisionResponseSchema = z.strictObject({
  decision: DecisionResultSchema,
  firstMessage: FirstMessageSchema,
  llmFindings: LlmFindingsSchema.optional(),
});
export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;

export const ERROR_CODES = [
  "invalid_request",
  "payload_too_large",
  "unsupported_image",
  "llm_failed",
  "llm_timeout",
  "server_misconfigured",
  "chat_failed",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorResponseSchema = z.strictObject({
  error: z.strictObject({ code: ErrorCodeSchema, retryable: z.boolean() }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AUTOMATED_DECISION_NOTICE,
  DecisionOutputWireSchema,
  IMAGE_MAX_BASE64_LENGTH,
  CaseImageSchema,
  CaseInputSchema,
  ChangeDecisionInputSchema,
  ChangeDecisionResultSchema,
  ChatCaseContextSchema,
  DecisionDataPartSchema,
  DecisionHistoryEntrySchema,
  DecisionOutputSchema,
  DecisionRequestSchema,
  DecisionResponseSchema,
  DecisionResultSchema,
  ErrorResponseSchema,
  FirstMessageSchema,
  RouteSchema,
  ScreeningResultSchema,
  ScreeningRequestSchema,
} from "./contracts";

const caseInput = {
  caseType: "complaint",
  category: "laptop",
  productName: "Laptop Pro 14",
  purchaseDate: "2026-01-10",
  description: "Na ekranie pojawiają się pionowe linie od tygodnia.",
} as const;

const caseImage = {
  mediaType: "image/jpeg",
  base64: "/9j/4AAQ",
  width: 1200,
  height: 900,
};

const screening = {
  answers: {
    photo_quality: {
      value: "ok",
      probabilities: {
        ok: 0.91,
        blurry: 0.05,
        too_dark: 0.02,
        device_not_fully_visible: 0.01,
        no_device: 0.01,
      },
      certainty: 0.91,
      confident: true,
      refused: false,
    },
    observed_category: {
      value: "laptop",
      probabilities: { laptop: 0.97, tablet: 0.03 },
      certainty: 0.97,
      confident: true,
      refused: false,
      providerConfidence: 0.95,
    },
    visible_damage_or_use: {
      value: true,
      probabilities: { true: 0.62, false: 0.38 },
      certainty: 0.62,
      confident: false,
      refused: false,
    },
    condition: {
      value: null,
      probabilities: {},
      certainty: 0,
      confident: false,
      refused: true,
    },
  },
  uncertainAreas: ["visible_damage_or_use", "condition"],
  model: "openai/gpt-6-luna-decisions",
  promptVersion: "2026-11-26.1",
  costCredits: 0.0012,
  latencyMs: 2300,
};

const decision = {
  category: "complaint_accepted_repair",
  label: "Reklamacja przyjęta – naprawa",
  citedRuleIds: ["CMP-2", "CMP-4"],
  justification: "Uzasadnienie decyzji.",
  photoFindingsSummary: "Na zdjęciu widać laptop.",
  nextSteps: ["Zapakuj sprzęt."],
  manualReviewKind: null,
  decisionPath: "llm",
  routeRule: "R10",
  mode: "hybrid",
};

const firstMessage = {
  greeting: "Dzień dobry,",
  decisionLabel: "Reklamacja przyjęta – naprawa",
  justification: "Uzasadnienie decyzji.",
  photoFindings: "Na zdjęciu widać laptop.",
  nextSteps: ["Zapakuj sprzęt.", "Wyślij paczkę."],
  notice: AUTOMATED_DECISION_NOTICE,
};

describe("constants", () => {
  it("AUTOMATED_DECISION_NOTICE is the verbatim AC-26 text", () => {
    expect(AUTOMATED_DECISION_NOTICE).toBe(
      "Decyzja została przygotowana automatycznie. Ostateczna weryfikacja nastąpi po otrzymaniu sprzętu przez nasz serwis.",
    );
  });

  it("re-exports CaseInputSchema", () => {
    expect(CaseInputSchema.safeParse(caseInput).success).toBe(true);
  });
});

describe("CaseImageSchema", () => {
  it("accepts a JPEG description", () => {
    expect(CaseImageSchema.safeParse(caseImage).success).toBe(true);
  });

  it.each([
    { ...caseImage, mediaType: "image/png" },
    { ...caseImage, base64: "" },
    { ...caseImage, width: 0 },
    { ...caseImage, height: 4097 },
    { ...caseImage, width: 10.5 },
    { ...caseImage, base64: "A".repeat(IMAGE_MAX_BASE64_LENGTH + 4) },
  ])("rejects %j", (image) => {
    expect(CaseImageSchema.safeParse(image).success).toBe(false);
  });
});

describe("ScreeningResultSchema", () => {
  it("accepts answers with values, refusals and optional provider confidence", () => {
    expect(ScreeningResultSchema.safeParse(screening).success).toBe(true);
  });

  it("rejects an unknown option value", () => {
    const bad = structuredClone(screening);
    (bad.answers.photo_quality as { value: string }).value = "grainy";
    expect(ScreeningResultSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a condition outside 0..3 and certainty outside 0..1", () => {
    const bad = structuredClone(screening) as unknown as {
      answers: {
        condition: { value: number | null };
        photo_quality: { certainty: number };
      };
    };
    bad.answers.condition.value = 4;
    expect(ScreeningResultSchema.safeParse(bad).success).toBe(false);
    const bad2 = structuredClone(screening);
    bad2.answers.photo_quality.certainty = 1.2;
    expect(ScreeningResultSchema.safeParse(bad2).success).toBe(false);
  });

  it("rejects an unknown uncertain area", () => {
    expect(
      ScreeningResultSchema.safeParse({
        ...screening,
        uncertainAreas: ["damage_cause"],
      }).success,
    ).toBe(false);
  });
});

describe("RouteSchema", () => {
  it("accepts template and llm routes", () => {
    expect(
      RouteSchema.safeParse({
        kind: "template",
        rule: "R1",
        category: "return_rejected",
        citedRuleIds: ["RET-1"],
        manualReviewKind: null,
      }).success,
    ).toBe(true);
    expect(
      RouteSchema.safeParse({
        kind: "llm",
        rule: "R3",
        uncertainAreas: ["condition"],
      }).success,
    ).toBe(true);
    expect(
      RouteSchema.safeParse({
        kind: "llm",
        rule: "R1",
        uncertainAreas: [],
        fixedCategory: "return_rejected",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown rule", () => {
    expect(
      RouteSchema.safeParse({ kind: "llm", rule: "R11", uncertainAreas: [] })
        .success,
    ).toBe(false);
  });
});

describe("DecisionResultSchema and FirstMessageSchema", () => {
  it("accept a complete decision and first message", () => {
    expect(DecisionResultSchema.safeParse(decision).success).toBe(true);
    expect(FirstMessageSchema.safeParse(firstMessage).success).toBe(true);
  });

  it.each([[[]], [["CMP-x"]], [["XYZ-1"]]])(
    "rejects citedRuleIds %j",
    (citedRuleIds) => {
      expect(
        DecisionResultSchema.safeParse({ ...decision, citedRuleIds }).success,
      ).toBe(false);
    },
  );

  it("requires the AC-26 notice and at least one next step", () => {
    expect(
      FirstMessageSchema.safeParse({ ...firstMessage, notice: "Inna treść." })
        .success,
    ).toBe(false);
    expect(
      FirstMessageSchema.safeParse({ ...firstMessage, nextSteps: [] }).success,
    ).toBe(false);
  });
});

describe("DecisionOutputSchema (LLM structured output, ADR-003 §4)", () => {
  const output = {
    outcome: "accepted",
    photoProblem: false,
    citedRuleIds: ["CMP-2"],
    evidence: [{ source: "photo", text: "Pionowe linie na ekranie." }],
    signalReview: {
      photo_quality: { verdict: "agree", note: "" },
      observed_category: { verdict: "agree", note: "" },
      visible_damage_or_use: {
        verdict: "disagree",
        note: "Brak śladów uderzenia.",
      },
      condition: { verdict: "not_assessable", note: "" },
    },
    greetingPl: "Dzień dobry,",
    justificationPl: "x".repeat(40),
    photoFindingsPl: "x".repeat(20),
    nextStepsPl: ["Zapakuj sprzęt."],
    uncertaintyPl: null,
  };

  it("accepts a valid output", () => {
    expect(DecisionOutputSchema.safeParse(output).success).toBe(true);
  });

  it.each([
    ["justification too short", { justificationPl: "x".repeat(39) }],
    ["justification too long", { justificationPl: "x".repeat(1201) }],
    ["findings too short", { photoFindingsPl: "x".repeat(19) }],
    ["no next steps", { nextStepsPl: [] }],
    ["7 next steps", { nextStepsPl: Array(7).fill("krok") }],
    [
      "6 rule ids",
      { citedRuleIds: ["CMP-1", "CMP-2", "CMP-3", "CMP-4", "CMP-5", "CMP-6"] },
    ],
    ["no evidence", { evidence: [] }],
    [
      "evidence text too long",
      { evidence: [{ source: "photo", text: "x".repeat(201) }] },
    ],
    [
      "manual review without uncertainty",
      { outcome: "manual_review", uncertaintyPl: null },
    ],
  ])("rejects %s", (_name, patch) => {
    expect(
      DecisionOutputSchema.safeParse({ ...output, ...patch }).success,
    ).toBe(false);
  });

  it("the wire schema accepts every valid output and carries no length or refine rules", () => {
    expect(DecisionOutputWireSchema.safeParse(output).success).toBe(true);
    const json = JSON.stringify(z.toJSONSchema(DecisionOutputWireSchema));
    expect(json).not.toMatch(/minLength|maxLength|minItems|maxItems|pattern/);
    // Valid on the wire, rejected by the full schema -> corrective retry.
    const tooShort = { ...output, justificationPl: "krótko" };
    expect(DecisionOutputWireSchema.safeParse(tooShort).success).toBe(true);
    expect(DecisionOutputSchema.safeParse(tooShort).success).toBe(false);
  });

  it("accepts manual review with an uncertainty text", () => {
    expect(
      DecisionOutputSchema.safeParse({
        ...output,
        outcome: "manual_review",
        uncertaintyPl: "Nie da się ocenić przyczyny.",
      }).success,
    ).toBe(true);
  });
});

describe("chat contracts", () => {
  const entry = {
    category: "complaint_accepted_repair",
    label: "Reklamacja przyjęta – naprawa",
    citedRuleIds: ["CMP-4"],
    source: "initial",
    manualReviewKind: null,
  };

  it("DecisionHistoryEntrySchema accepts initial and chat entries", () => {
    expect(DecisionHistoryEntrySchema.safeParse(entry).success).toBe(true);
    expect(
      DecisionHistoryEntrySchema.safeParse({ ...entry, source: "chat" })
        .success,
    ).toBe(true);
    expect(
      DecisionHistoryEntrySchema.safeParse({ ...entry, source: "agent" })
        .success,
    ).toBe(false);
  });

  it("ChatCaseContextSchema caps decision history at 1..20", () => {
    const ctx = {
      caseInput,
      screening,
      decisionHistory: [entry],
      firstMessage,
    };
    expect(ChatCaseContextSchema.safeParse(ctx).success).toBe(true);
    expect(
      ChatCaseContextSchema.safeParse({ ...ctx, decisionHistory: [] }).success,
    ).toBe(false);
    expect(
      ChatCaseContextSchema.safeParse({
        ...ctx,
        decisionHistory: Array(21).fill(entry),
      }).success,
    ).toBe(false);
  });

  it("DecisionDataPartSchema carries category, label, rule IDs and manualReviewKind", () => {
    expect(
      DecisionDataPartSchema.safeParse({
        category: "manual_review",
        label: "Wymaga weryfikacji przez konsultanta",
        citedRuleIds: ["RET-4"],
        manualReviewKind: "contact_support",
      }).success,
    ).toBe(true);
  });

  it("ChangeDecisionInputSchema limits rule IDs and reason", () => {
    const ok = {
      outcome: "rejected",
      citedRuleIds: ["RET-5", "RET-2"],
      reason: "Sprzęt spadł.",
    };
    expect(ChangeDecisionInputSchema.safeParse(ok).success).toBe(true);
    expect(
      ChangeDecisionInputSchema.safeParse({ ...ok, reason: "" }).success,
    ).toBe(false);
    expect(
      ChangeDecisionInputSchema.safeParse({ ...ok, reason: "x".repeat(401) })
        .success,
    ).toBe(false);
    expect(
      ChangeDecisionInputSchema.safeParse({ ...ok, citedRuleIds: [] }).success,
    ).toBe(false);
  });

  it("ChangeDecisionResultSchema has accepted and refused variants", () => {
    expect(
      ChangeDecisionResultSchema.safeParse({
        accepted: true,
        category: "return_rejected",
        label: "Zwrot odrzucony",
      }).success,
    ).toBe(true);
    expect(
      ChangeDecisionResultSchema.safeParse({
        accepted: false,
        why: "outside_return_window",
      }).success,
    ).toBe(true);
    expect(
      ChangeDecisionResultSchema.safeParse({ accepted: false, why: "because" })
        .success,
    ).toBe(false);
  });
});

describe("HTTP contracts", () => {
  it("ScreeningRequestSchema and DecisionRequestSchema", () => {
    expect(
      ScreeningRequestSchema.safeParse({ caseInput, caseImage }).success,
    ).toBe(true);
    expect(
      DecisionRequestSchema.safeParse({ caseInput, caseImage, screening })
        .success,
    ).toBe(true);
    expect(
      DecisionRequestSchema.safeParse({ caseInput, caseImage }).success,
    ).toBe(false);
  });

  it("DecisionResponseSchema with optional llmFindings", () => {
    expect(
      DecisionResponseSchema.safeParse({ decision, firstMessage }).success,
    ).toBe(true);
    expect(
      DecisionResponseSchema.safeParse({
        decision,
        firstMessage,
        llmFindings: {
          photoFindingsPl: "x".repeat(20),
          evidence: [{ source: "photo", text: "Linie." }],
          signalReview: {},
        },
      }).success,
    ).toBe(true);
  });

  it("ErrorResponseSchema accepts only known codes", () => {
    expect(
      ErrorResponseSchema.safeParse({
        error: { code: "llm_failed", retryable: true },
      }).success,
    ).toBe(true);
    expect(
      ErrorResponseSchema.safeParse({
        error: { code: "boom", retryable: true },
      }).success,
    ).toBe(false);
  });
});

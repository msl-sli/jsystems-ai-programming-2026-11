// Test-only helpers. rejected()/accepted() and capturedChatState() come from real recorded API responses
// (tests/fixtures/api-captures/, plan 7a.3). `decide`/`betterPhoto` remain on the real domain function
// `decideWithTemplate` fed with a constructed ScreeningResult (pure domain input) ONLY because no capture
// has a manual_review/better_photo decision; replace them when one is recorded.
import type { CaseInput } from "@/domain/case-schema";
import type {
  DecisionHistoryEntry,
  DecisionMode,
  DecisionResponse,
  ScreeningResult,
} from "@/domain/contracts";
import { computeFacts } from "@/domain/dates";
import { routeCase } from "@/domain/routing";
import { decideWithTemplate } from "@/domain/templates";
import {
  caseSessionReducer,
  initialCaseSessionState,
  type CaseSessionState,
} from "@/features/case-session";
import { captureJson } from "@/test/api-capture";

export const TODAY = "2026-11-26";
const POLICY_IDS = [
  "RET-1",
  "RET-2",
  "RET-3",
  "RET-4",
  "RET-5",
  "RET-6",
  "RET-7",
];

export const lateReturn: CaseInput = {
  caseType: "return",
  category: "smartphone",
  productName: "Telefon X",
  purchaseDate: "2026-09-01",
  description: "",
};
export const freshReturn: CaseInput = {
  ...lateReturn,
  purchaseDate: "2026-11-20",
};

export function screening(
  opts: { photoCertain?: boolean } = {},
): ScreeningResult {
  const certain = opts.photoCertain ?? true;
  const ans = <T>(value: T, probabilities: Record<string, number>) => ({
    value,
    probabilities,
    certainty: Math.max(...Object.values(probabilities)),
    confident: true,
    refused: false,
  });
  return {
    answers: {
      photo_quality: certain
        ? ans("ok", { ok: 0.95 })
        : ans("ok", { ok: 0.5, blurry: 0.5 }),
      observed_category: ans("smartphone", { smartphone: 0.95 }),
      visible_damage_or_use: ans(false, { false: 0.95 }),
      condition: ans(0, { "0": 0.95 }),
    },
    uncertainAreas: certain ? [] : ["photo_quality"],
    model: "test-model",
    promptVersion: "test",
    latencyMs: 1,
  } as unknown as ScreeningResult;
}

export function decide(
  caseInput: CaseInput,
  scr: ScreeningResult = screening(),
  mode: DecisionMode = "hybrid",
): Pick<DecisionResponse, "decision" | "firstMessage"> {
  const facts = computeFacts(caseInput.purchaseDate, TODAY);
  const route = routeCase(caseInput, scr, facts, mode, 0.8);
  if (route.kind !== "template") throw new Error("fixture must be a template");
  return decideWithTemplate(route, caseInput, scr, facts, mode, POLICY_IDS);
}

/** Captured a-return-20d (template R1, return_rejected). */
export const rejected = (): Pick<
  DecisionResponse,
  "decision" | "firstMessage"
> => captureJson<DecisionResponse>("a-return-20d-decision");
/** Captured f-return-nodesc (llm R3, return_accepted). */
export const accepted = (): Pick<
  DecisionResponse,
  "decision" | "firstMessage"
> => captureJson<DecisionResponse>("f-return-nodesc-decision");
export const betterPhoto = () =>
  decide(freshReturn, screening({ photoCertain: false }), "decisions-only");

export function entryOf(
  d: ReturnType<typeof decide>,
  source: "initial" | "chat" = "initial",
): DecisionHistoryEntry {
  const x = d.decision;
  return {
    category: x.category,
    label: x.label,
    citedRuleIds: x.citedRuleIds,
    source,
    manualReviewKind: x.manualReviewKind,
  };
}

export function chatState(
  caseInput: CaseInput,
  d: ReturnType<typeof decide>,
  scr: ScreeningResult = screening(),
): CaseSessionState {
  return {
    ...initialCaseSessionState,
    status: "chat",
    caseInput,
    photoUrl: "blob:mock-1",
    screening: scr,
    decision: d.decision,
    firstMessage: d.firstMessage,
    decisionHistory: [entryOf(d)],
  };
}

// Session states built from the real captured API responses (tests/fixtures/api-captures/), reduced
// by the real reducer, so the chat caseContext matches what the app really had after processing.
const IMAGE = {
  mediaType: "image/jpeg" as const,
  base64: "AAAA",
  width: 1,
  height: 1,
};

/** complaint laptop, purchase 2026-11-16 (capture c-complaint-10d); the description is a domain input. */
export const complaintInput: CaseInput = {
  caseType: "complaint",
  category: "laptop",
  productName: "Laptop Y",
  purchaseDate: "2026-11-16",
  description: "Na ekranie pojawiają się pionowe linie od kilku dni.",
};
/** return smartphone, purchase 2026-11-23 (capture f-return-nodesc). */
export const capturedReturnInput: CaseInput = {
  caseType: "return",
  category: "smartphone",
  productName: "Telefon X",
  purchaseDate: "2026-11-23",
  description: "",
};

export function capturedChatState(
  prefix: "c-complaint-10d" | "f-return-nodesc",
  caseInput: CaseInput,
): CaseSessionState {
  const { screening } = captureJson<{ screening: ScreeningResult }>(
    `${prefix}-screening`,
  );
  const response = captureJson<DecisionResponse>(`${prefix}-decision`);
  let state: CaseSessionState = {
    ...initialCaseSessionState,
    status: "processing",
    stage: "screening",
    caseInput,
    photoUrl: "blob:mock-1",
  };
  state = caseSessionReducer(state, {
    type: "screened",
    screening,
    image: IMAGE,
  });
  return caseSessionReducer(state, { type: "decided", response });
}

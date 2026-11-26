import type { CaseInput } from "@/domain/case-schema";
import {
  DECISION_HISTORY_MAX,
  type CaseImage,
  type DecisionDataPart,
  type DecisionHistoryEntry,
  type DecisionResponse,
  type DecisionResult,
  type FirstMessage,
  type LlmFindings,
  type ScreeningResult,
} from "@/domain/contracts";

export type ProcessingStage = "screening" | "decision";

/** ADR-001 section 3 state machine: form -> processing(screening -> decision) -> chat. */
export type CaseSessionState = {
  status: "form" | "processing" | "chat";
  stage: ProcessingStage | null;
  caseInput: CaseInput | null;
  photo: File | null;
  /** Thumbnail object URL; created by the provider (impure) and revoked by its effect. */
  photoUrl: string | null;
  image: CaseImage | null;
  screening: ScreeningResult | null;
  decision: DecisionResult | null;
  firstMessage: FirstMessage | null;
  llmFindings: LlmFindings | null;
  decisionHistory: DecisionHistoryEntry[];
  processingError: boolean;
  /** Incremented by newCase; lets the page drop per-form state such as the dirty flag. */
  resetCount: number;
};

export type CaseSessionAction =
  | { type: "submit"; values: CaseInput; photo: File; photoUrl: string | null }
  | { type: "screened"; screening: ScreeningResult; image: CaseImage }
  | { type: "decided"; response: DecisionResponse }
  | { type: "failed" }
  | { type: "retry" }
  | { type: "decisionChanged"; part: DecisionDataPart }
  | { type: "newCase" };

export const initialCaseSessionState: CaseSessionState = {
  status: "form",
  stage: null,
  caseInput: null,
  photo: null,
  photoUrl: null,
  image: null,
  screening: null,
  decision: null,
  firstMessage: null,
  llmFindings: null,
  decisionHistory: [],
  processingError: false,
  resetCount: 0,
};

function appendChatEntry(
  history: DecisionHistoryEntry[],
  part: DecisionDataPart,
): DecisionHistoryEntry[] {
  const next = [...history, { ...part, source: "chat" as const }];
  while (next.length > DECISION_HISTORY_MAX) {
    const oldestChat = next.findIndex((e) => e.source === "chat");
    if (oldestChat === -1) break;
    next.splice(oldestChat, 1);
  }
  return next;
}

export function caseSessionReducer(
  state: CaseSessionState,
  action: CaseSessionAction,
): CaseSessionState {
  switch (action.type) {
    case "submit":
      return {
        ...state,
        status: "processing",
        stage: "screening",
        caseInput: action.values,
        photo: action.photo,
        photoUrl: action.photoUrl,
        image: null,
        screening: null,
        processingError: false,
      };
    case "screened":
      if (state.status !== "processing") return state;
      return {
        ...state,
        stage: "decision",
        screening: action.screening,
        image: action.image,
      };
    case "decided": {
      if (state.status !== "processing") return state;
      const { decision, firstMessage, llmFindings } = action.response;
      return {
        ...state,
        status: "chat",
        stage: null,
        decision,
        firstMessage,
        llmFindings: llmFindings ?? null,
        decisionHistory: [
          {
            category: decision.category,
            label: decision.label,
            citedRuleIds: decision.citedRuleIds,
            source: "initial",
            manualReviewKind: decision.manualReviewKind,
          },
        ],
      };
    }
    case "failed":
      if (state.status !== "processing") return state;
      return { ...state, status: "form", stage: null, processingError: true };
    case "retry":
      if (state.status !== "form" || !state.caseInput || !state.photo) {
        return state;
      }
      return {
        ...state,
        status: "processing",
        stage: "screening",
        processingError: false,
      };
    case "decisionChanged":
      if (state.status !== "chat") return state;
      return {
        ...state,
        decisionHistory: appendChatEntry(state.decisionHistory, action.part),
      };
    case "newCase":
      return { ...initialCaseSessionState, resetCount: state.resetCount + 1 };
  }
}

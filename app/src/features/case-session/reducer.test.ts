import { describe, expect, it } from "vitest";
import { DECISION_HISTORY_MAX } from "@/domain/contracts";
import {
  caseSessionReducer,
  initialCaseSessionState,
  type CaseSessionState,
} from "./reducer";
import {
  image,
  makeDecisionResponse,
  makeScreening,
  photoFile,
  returnCase,
} from "./fixtures";

const chatEntry = (label: string) => ({
  category: "manual_review" as const,
  label,
  citedRuleIds: ["RET-1"],
  manualReviewKind: null,
});

function toChat(): CaseSessionState {
  let s = caseSessionReducer(initialCaseSessionState, {
    type: "submit",
    values: returnCase,
    photo: photoFile(),
    photoUrl: "blob:1",
  });
  s = caseSessionReducer(s, {
    type: "screened",
    screening: makeScreening(),
    image,
  });
  return caseSessionReducer(s, {
    type: "decided",
    response: makeDecisionResponse(),
  });
}

describe("caseSessionReducer", () => {
  it("starts as an empty form", () => {
    expect(initialCaseSessionState).toMatchObject({
      status: "form",
      caseInput: null,
      photo: null,
      processingError: false,
      decisionHistory: [],
    });
  });

  it("submit goes to processing/screening and clears the error", () => {
    const failed = { ...initialCaseSessionState, processingError: true };
    const s = caseSessionReducer(failed, {
      type: "submit",
      values: returnCase,
      photo: photoFile(),
      photoUrl: "blob:1",
    });
    expect(s).toMatchObject({
      status: "processing",
      stage: "screening",
      processingError: false,
      caseInput: returnCase,
      photoUrl: "blob:1",
    });
  });

  it("screened moves to the decision stage and keeps screening and image", () => {
    let s = caseSessionReducer(initialCaseSessionState, {
      type: "submit",
      values: returnCase,
      photo: photoFile(),
      photoUrl: "blob:1",
    });
    const screening = makeScreening();
    s = caseSessionReducer(s, { type: "screened", screening, image });
    expect(s).toMatchObject({
      status: "processing",
      stage: "decision",
      screening,
      image,
    });
  });

  it("decided goes to chat with the initial history entry", () => {
    const response = makeDecisionResponse();
    const s = toChat();
    expect(s.status).toBe("chat");
    expect(s.decision).toEqual(response.decision);
    expect(s.firstMessage).toEqual(response.firstMessage);
    expect(s.decisionHistory).toEqual([
      {
        category: response.decision.category,
        label: response.decision.label,
        citedRuleIds: response.decision.citedRuleIds,
        source: "initial",
        manualReviewKind: response.decision.manualReviewKind,
      },
    ]);
  });

  it("failed returns to the form keeping values and photo (AC-17)", () => {
    let s = caseSessionReducer(initialCaseSessionState, {
      type: "submit",
      values: returnCase,
      photo: photoFile(),
      photoUrl: "blob:1",
    });
    const photo = s.photo;
    s = caseSessionReducer(s, { type: "failed" });
    expect(s).toMatchObject({
      status: "form",
      processingError: true,
      caseInput: returnCase,
      photoUrl: "blob:1",
    });
    expect(s.photo).toBe(photo);
  });

  it("retry re-enters processing with the same data", () => {
    let s = caseSessionReducer(initialCaseSessionState, {
      type: "submit",
      values: returnCase,
      photo: photoFile(),
      photoUrl: "blob:1",
    });
    s = caseSessionReducer(s, { type: "failed" });
    const retried = caseSessionReducer(s, { type: "retry" });
    expect(retried).toMatchObject({
      status: "processing",
      stage: "screening",
      processingError: false,
      caseInput: returnCase,
    });
    expect(retried.photo).toBe(s.photo);
  });

  it("retry without data is a no-op", () => {
    expect(caseSessionReducer(initialCaseSessionState, { type: "retry" })).toBe(
      initialCaseSessionState,
    );
  });

  it("decisionChanged appends a chat entry", () => {
    const s = caseSessionReducer(toChat(), {
      type: "decisionChanged",
      part: chatEntry("Zmiana"),
    });
    expect(s.decisionHistory).toHaveLength(2);
    expect(s.decisionHistory[1]).toMatchObject({
      label: "Zmiana",
      source: "chat",
    });
  });

  it("caps history at 20 dropping the oldest chat entry, never the initial one", () => {
    let s = toChat();
    for (let i = 1; i <= DECISION_HISTORY_MAX + 5; i += 1) {
      s = caseSessionReducer(s, {
        type: "decisionChanged",
        part: chatEntry(`c${i}`),
      });
    }
    expect(s.decisionHistory).toHaveLength(DECISION_HISTORY_MAX);
    expect(s.decisionHistory[0]?.source).toBe("initial");
    expect(s.decisionHistory[1]?.label).toBe("c7");
    expect(s.decisionHistory.at(-1)?.label).toBe(
      `c${DECISION_HISTORY_MAX + 5}`,
    );
  });

  it("newCase resets to an empty form (AC-38) and bumps resetCount", () => {
    const s = caseSessionReducer(toChat(), { type: "newCase" });
    expect(s).toEqual({ ...initialCaseSessionState, resetCount: 1 });
  });

  it("ignores out-of-order actions", () => {
    const s = initialCaseSessionState;
    expect(caseSessionReducer(s, { type: "failed" })).toBe(s);
    expect(
      caseSessionReducer(s, {
        type: "screened",
        screening: makeScreening(),
        image,
      }),
    ).toBe(s);
    expect(
      caseSessionReducer(s, {
        type: "decided",
        response: makeDecisionResponse(),
      }),
    ).toBe(s);
    expect(
      caseSessionReducer(s, { type: "decisionChanged", part: chatEntry("x") }),
    ).toBe(s);
  });
});

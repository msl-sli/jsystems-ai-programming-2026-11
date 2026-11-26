import "server-only";
import { describe, expect, it } from "vitest";
import { foldRefusalResponse } from "./screening";

/**
 * PURE INPUTS to a mapper. These objects are NOT served over fetch and are not claimed to be real provider captures.
 * They follow the documented Decisions answer types (noul / choice / score / per-question refusal). The end-to-end
 * refusal path (HTTP 200 with a refusal -> provider validation error -> APICallError.responseBody) still needs a real
 * capture before it can be called verified (plan section 7a.4).
 */
const base = {
  answers: {
    photo_quality: {
      type: "choice",
      choice: "ok",
      probabilities: { ok: 0.9, blurry: 0.1 },
      confidence: 0.9,
    },
    observed_category: { type: "refusal" },
    visible_damage_or_use: { type: "noul", noul: 0.25, confidence: 0.75 },
    condition: {
      type: "score",
      score: 1.6,
      probabilities: { "0": 0.1, "1": 0.2, "2": 0.6, "3": 0.1 },
      confidence: 0.6,
    },
  },
  usage: { cost: 0.0042 },
};
const fold = (body: unknown, threshold = 0.8) =>
  foldRefusalResponse(
    typeof body === "string" ? body : JSON.stringify(body),
    threshold,
  );

describe("foldRefusalResponse", () => {
  it("marks refused questions and maps the other answers like the success path", () => {
    const result = fold(base)!;
    expect(result.costCredits).toBe(0.0042);
    expect(result.answers.observed_category).toEqual({
      value: null,
      probabilities: {},
      certainty: 0,
      confident: false,
      refused: true,
    });
    expect(result.answers.photo_quality).toMatchObject({
      value: "ok",
      probabilities: { ok: 0.9, blurry: 0.1 },
      certainty: 0.9,
      confident: true,
      refused: false,
      providerConfidence: 0.9,
    });
    expect(result.answers.visible_damage_or_use).toMatchObject({
      value: false,
      probabilities: { true: 0.25, false: 0.75 },
      refused: false,
    });
    expect(result.answers.condition).toMatchObject({
      value: 2,
      refused: false,
      confident: false,
    });
  });

  it("treats a missing question and an unexpected answer type as refused (fail closed)", () => {
    const answers: Record<string, unknown> = {
      ...base.answers,
      photo_quality: { type: "refusal" },
    };
    delete answers.condition;
    answers.visible_damage_or_use = { type: "mystery", x: 1 };
    const result = fold({ answers })!;
    expect(result.answers.condition.refused).toBe(true);
    expect(result.answers.visible_damage_or_use.refused).toBe(true);
    expect(result.costCredits).toBeUndefined();
  });

  it("treats an out-of-contract value as refused", () => {
    const answers = {
      ...base.answers,
      photo_quality: {
        type: "choice",
        choice: "sharp",
        probabilities: { sharp: 1 },
      },
    };
    expect(fold({ answers })!.answers.photo_quality.refused).toBe(true);
  });

  it("returns undefined when there is no refusal, no valid JSON or no answers object", () => {
    const noRefusal = {
      answers: {
        ...base.answers,
        observed_category: {
          type: "choice",
          choice: "laptop",
          probabilities: { laptop: 1 },
        },
      },
    };
    expect(fold(noRefusal)).toBeUndefined();
    expect(fold("not json")).toBeUndefined();
    expect(fold({ answers: "x" })).toBeUndefined();
    expect(foldRefusalResponse(undefined, 0.8)).toBeUndefined();
  });
});

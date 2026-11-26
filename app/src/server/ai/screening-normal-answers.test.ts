import "server-only";
import { describe, expect, it } from "vitest";
import { ScreeningAnswersSchema } from "@/domain/contracts";
import { foldNormalAnswers } from "./screening";

/** PURE INPUTS to a mapper (not provider captures): unexpected values of the normal path must fail closed. */
const good = {
  photo_quality: { choice: "ok", probabilities: { ok: 0.9, blurry: 0.1 } },
  observed_category: {
    choice: "smartphone",
    probabilities: { smartphone: 0.95 },
  },
  visible_damage_or_use: { probability: 0.25 },
  condition: {
    score: 1.6,
    probabilities: { "0": 0.1, "1": 0.2, "2": 0.6, "3": 0.1 },
  },
};
const fold = (answers: unknown) =>
  foldNormalAnswers(answers, undefined, 0.8);

describe("foldNormalAnswers", () => {
  it("maps a well-formed answer set and satisfies the response schema", () => {
    const folded = fold(good);
    expect(() => ScreeningAnswersSchema.parse(folded)).not.toThrow();
    expect(folded.condition.value).toBe(2);
    expect(folded.photo_quality.refused).toBe(false);
  });

  it.each([
    ["unknown photo_quality choice", { photo_quality: { choice: "weird" } }, "photo_quality"],
    ["unknown observed_category choice", { observed_category: { choice: "toaster" } }, "observed_category"],
    ["missing question", { observed_category: undefined }, "observed_category"],
    ["probability above 1", { visible_damage_or_use: { probability: 1.5 } }, "visible_damage_or_use"],
    ["probability not a number", { visible_damage_or_use: { probability: "x" } }, "visible_damage_or_use"],
    ["score out of range, no buckets", { condition: { score: 7 } }, "condition"],
    ["bucket probability above 1", { condition: { score: 1, probabilities: { "1": 3 } } }, "condition"],
    ["unknown bucket", { condition: { score: 1, probabilities: { "9": 0.9 } } }, "condition"],
  ] as const)("%s is folded into a refused answer", (_n, override, id) => {
    const folded = fold({ ...good, ...override });
    expect(folded[id].refused).toBe(true);
    expect(folded[id].value).toBeNull();
    expect(folded[id].confident).toBe(false);
    expect(() => ScreeningAnswersSchema.parse(folded)).not.toThrow();
  });
});

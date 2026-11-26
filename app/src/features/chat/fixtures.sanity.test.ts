import { expect, it } from "vitest";
import { accepted, betterPhoto, rejected } from "./test-fixtures";

// Guards the chat fixtures: each one must come from a real template route of decideWithTemplate.
it("fixtures cover accepted, rejected and manual review (better_photo)", () => {
  expect(accepted().decision.category).toBe("return_accepted");
  expect(rejected().decision.category).toBe("return_rejected");
  const b = betterPhoto().decision;
  expect([b.category, b.manualReviewKind]).toEqual([
    "manual_review",
    "better_photo",
  ]);
});

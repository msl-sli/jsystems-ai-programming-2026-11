// Test-only helpers. Screening and decision values are the real API responses recorded from the running
// app (tests/fixtures/api-captures/a-return-20d-*, template route R1), not constructed (plan 7a.3).
import type { CaseInput } from "@/domain/case-schema";
import type { DecisionResponse, ScreeningResult } from "@/domain/contracts";
import { captureJson } from "@/test/api-capture";

export const TODAY = "2026-11-26";

// Purchased 20 days before TODAY, outside the 14-day return window: routeCase takes the template route R1.
export const returnCase: CaseInput = {
  caseType: "return",
  category: "smartphone",
  productName: "Telefon X",
  purchaseDate: "2026-11-06",
  description: "",
};

export function makeScreening(): ScreeningResult {
  return captureJson<{ screening: ScreeningResult }>("a-return-20d-screening")
    .screening;
}

export function makeDecisionResponse(): DecisionResponse {
  return captureJson<DecisionResponse>("a-return-20d-decision");
}

export const image = {
  mediaType: "image/jpeg" as const,
  base64: "AAAA",
  width: 300,
  height: 300,
};

export const photoFile = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg");

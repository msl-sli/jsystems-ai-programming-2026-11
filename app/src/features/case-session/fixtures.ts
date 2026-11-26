// Test-only helpers. The decision values come from the real domain functions (routeCase + decideWithTemplate)
// fed with a constructed ScreeningResult (pure input, plan 7a.3). T52/T53 replace this with recorded API captures from I4.
import type { CaseInput } from "@/domain/case-schema";
import {
  type DecisionResponse,
  type ScreeningResult,
} from "@/domain/contracts";
import { computeFacts } from "@/domain/dates";
import { routeCase } from "@/domain/routing";
import { decideWithTemplate } from "@/domain/templates";

export const TODAY = "2026-11-26";

// Outside the 14-day return window, so routeCase takes the deterministic template route R1.
export const returnCase: CaseInput = {
  caseType: "return",
  category: "smartphone",
  productName: "Telefon X",
  purchaseDate: "2026-09-01",
  description: "",
};

export function makeScreening(): ScreeningResult {
  const ans = <T>(value: T) => ({
    value,
    probabilities: {},
    certainty: 0.95,
    confident: true,
    refused: false,
  });
  return {
    answers: {
      photo_quality: ans("ok"),
      observed_category: ans("smartphone"),
      visible_damage_or_use: ans(false),
      condition: ans(0),
    },
    uncertainAreas: [],
    model: "test-model",
    promptVersion: "test",
    latencyMs: 1,
  } as unknown as ScreeningResult;
}

export function makeDecisionResponse(): DecisionResponse {
  const screening = makeScreening();
  const facts = computeFacts(returnCase.purchaseDate, TODAY);
  const route = routeCase(returnCase, screening, facts, "hybrid", 0.8);
  if (route.kind !== "template")
    throw new Error("fixture must route to a template");
  const ids = ["RET-1", "RET-2", "RET-3", "RET-4", "RET-5", "RET-6", "RET-7"];
  return decideWithTemplate(route, returnCase, screening, facts, "hybrid", ids);
}

export const image = {
  mediaType: "image/jpeg" as const,
  base64: "AAAA",
  width: 300,
  height: 300,
};

export const photoFile = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg");

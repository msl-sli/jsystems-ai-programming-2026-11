import "server-only";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { format, parseISO, subDays } from "date-fns";
import { describe, expect, it } from "vitest";
import type { CaseInput } from "@/domain/case-schema";
import {
  AUTOMATED_DECISION_NOTICE,
  DecisionResultSchema,
  type LlmRoute,
  type ScreeningResult,
} from "@/domain/contracts";
import { todayInTimeZone } from "@/domain/dates";
import {
  categoryBelongsToCaseType,
  DECISION_LABELS,
} from "@/domain/decision-labels";
import { createReplayFetch } from "@/test/replay-fetch";
import {
  SCREENING_PHOTOS,
  loadScreeningCaseImage,
  screeningCaseInput,
} from "../../../scripts/capture-scenarios";
import { createLlmProvider, getChatModel, getDecisionModel } from "../llm";
import { loadPolicies } from "../policies";
import { LlmFailedError } from "./errors";
import { DECISION_PROMPT_VERSIONS, decideWithLlm } from "./decision";
import { screenCase } from "./screening";

const CAPTURES = path.resolve(process.cwd(), "tests/fixtures/llm-captures");
const cap = (dir: string, name: string) =>
  path.join(CAPTURES, dir, `${name}.json`);
const metaOf = (dir: string, name: string) =>
  JSON.parse(
    readFileSync(path.join(CAPTURES, dir, `${name}.meta.json`), "utf8"),
  ) as { capturedAt: string; modelId: string; promptVersion: string };

const loaded = loadPolicies(path.resolve(process.cwd(), "../docs/policies"));

type PhotoId = (typeof SCREENING_PHOTOS)[number]["id"];

async function screeningFor(
  photoId: PhotoId,
  caseType: "return" | "complaint",
): Promise<ScreeningResult> {
  const photo = SCREENING_PHOTOS.find((p) => p.id === photoId)!;
  const name = `screening-${photoId}-${caseType}`;
  const replay = createReplayFetch({ captures: [cap("screening", name)] });
  return screenCase(
    screeningCaseInput(photo, caseType),
    await loadScreeningCaseImage(photo),
    {
      decisionModel: getDecisionModel(
        createLlmProvider({ apiKey: "unused", fetch: replay }),
        metaOf("screening", name).modelId,
      ),
      signal: AbortSignal.timeout(20_000),
      threshold: 0.8,
    },
  );
}

interface Spec {
  name: string;
  photoId: PhotoId;
  caseInput: (today: string) => CaseInput;
  route: (s: ScreeningResult) => LlmRoute;
  mode: "hybrid" | "llm-always";
  returnRuleIds?: string[];
}

const daysAgo = (today: string, n: number) =>
  format(subDays(parseISO(today), n), "yyyy-MM-dd");

const SPECS = {
  returnDescription: {
    name: "decision-return-description",
    photoId: "phone-1",
    caseInput: (t) => ({
      caseType: "return",
      category: "smartphone",
      productName: "Smartfon testowy",
      purchaseDate: daysAgo(t, 3),
      description: "Zmiana decyzji zakupowej, sprzęt nieużywany.",
    }),
    route: (s) => ({
      kind: "llm",
      rule: "R6",
      uncertainAreas: s.uncertainAreas,
    }),
    mode: "hybrid",
  },
  complaint: {
    name: "decision-complaint",
    photoId: "laptop-1",
    caseInput: (t) => ({
      caseType: "complaint",
      category: "laptop",
      productName: "Laptop testowy",
      purchaseDate: daysAgo(t, 10),
      description:
        "Na ekranie laptopa od kilku dni widać poziome linie, urządzenie nie było upuszczane.",
    }),
    route: (s) => ({
      kind: "llm",
      rule: "R10",
      uncertainAreas: s.uncertainAreas,
    }),
    mode: "hybrid",
  },
  llmAlways: {
    name: "decision-llm-always-r1",
    photoId: "phone-2",
    caseInput: (t) => ({
      caseType: "return",
      category: "smartphone",
      productName: "Smartfon testowy",
      purchaseDate: daysAgo(t, 20),
      description: "",
    }),
    route: (s) => ({
      kind: "llm",
      rule: "R1",
      uncertainAreas: s.uncertainAreas,
      fixedCategory: "return_rejected",
    }),
    mode: "llm-always",
  },
  invalidFirst: {
    name: "decision-return-invalid-first",
    photoId: "phone-1",
    caseInput: (t) => ({
      caseType: "return",
      category: "smartphone",
      productName: "Smartfon testowy",
      purchaseDate: daysAgo(t, 3),
      description: "Zmiana decyzji zakupowej, sprzęt nieużywany.",
    }),
    route: (s) => ({
      kind: "llm",
      rule: "R6",
      uncertainAreas: s.uncertainAreas,
    }),
    mode: "hybrid",
    returnRuleIds: ["RET-7"],
  },
} satisfies Record<string, Spec>;

async function decide(spec: Spec, captureNames: string[]) {
  const m = metaOf("decision", spec.name);
  const today = todayInTimeZone("Europe/Warsaw", new Date(m.capturedAt));
  const caseInput = spec.caseInput(today);
  const screening = await screeningFor(spec.photoId, caseInput.caseType);
  const photo = SCREENING_PHOTOS.find((p) => p.id === spec.photoId)!;
  const policies = spec.returnRuleIds
    ? {
        ...loaded,
        return: { ...loaded.return, ruleIds: spec.returnRuleIds },
      }
    : loaded;
  const replay = createReplayFetch({
    captures: captureNames.map((n) => cap("decision", n)),
  });
  const result = decideWithLlm(
    spec.route(screening),
    caseInput,
    await loadScreeningCaseImage(photo),
    screening,
    {
      model: getChatModel(
        createLlmProvider({ apiKey: "unused", fetch: replay }),
        m.modelId,
      ),
      policies,
      today,
      mode: spec.mode,
      signal: AbortSignal.timeout(20_000),
    },
  );
  return { replay, result, caseInput, policies };
}

describe("decideWithLlm replay of real captures", () => {
  for (const key of ["returnDescription", "complaint", "llmAlways"] as const) {
    const spec: Spec = SPECS[key];
    it(`${spec.name}: valid DecisionResult from the llm path`, async () => {
      const { replay, result, caseInput, policies } = await decide(spec, [
        spec.name,
      ]);
      const { decision, firstMessage } = await result;
      replay.assertAllConsumed();
      expect(DecisionResultSchema.safeParse(decision).success).toBe(true);
      expect(decision.decisionPath).toBe("llm");
      expect(decision.routeRule).toBe(
        spec.route({ uncertainAreas: [] } as never).rule,
      );
      expect(decision.mode).toBe(spec.mode);
      // AC-16
      expect(
        categoryBelongsToCaseType(caseInput.caseType, decision.category),
      ).toBe(true);
      expect(decision.label).toBe(DECISION_LABELS[decision.category]);
      const valid = policies[caseInput.caseType].ruleIds;
      expect(decision.citedRuleIds.length).toBeGreaterThan(0);
      for (const id of decision.citedRuleIds) expect(valid).toContain(id);
      // AC-26
      expect(firstMessage.notice).toBe(AUTOMATED_DECISION_NOTICE);
      expect(firstMessage.decisionLabel).toBe(decision.label);
      if (decision.manualReviewKind === "better_photo")
        expect(decision.nextSteps.length).toBeGreaterThanOrEqual(2);
      if (
        spec.route({ uncertainAreas: [] } as never) &&
        "fixedCategory" in spec.route({ uncertainAreas: [] } as never)
      )
        expect(decision.category).toBe("return_rejected");
    });
  }

  it("invalid first answer: corrective retry (2 calls), then LlmFailedError", async () => {
    const spec: Spec = SPECS.invalidFirst;
    const { replay, result } = await decide(spec, [
      spec.name,
      `${spec.name}-2`,
    ]);
    await expect(result).rejects.toBeInstanceOf(LlmFailedError);
    expect(replay.calls).toBe(2);
    replay.assertAllConsumed();
  });
});

describe("decision capture freshness (ADR-000 TAC-05)", () => {
  it("prompt versions of all decision captures are current", () => {
    const dir = path.join(CAPTURES, "decision");
    const metas = readdirSync(dir).filter((f) => f.endsWith(".meta.json"));
    expect(metas.length).toBeGreaterThan(0);
    for (const f of metas) {
      const m = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as {
        promptVersion: string;
      };
      expect(Object.values(DECISION_PROMPT_VERSIONS), f).toContain(
        m.promptVersion,
      );
    }
    for (const spec of Object.values(SPECS)) {
      const m = metaOf("decision", spec.name);
      const type = spec.caseInput("2026-11-26").caseType;
      expect(m.promptVersion, spec.name).toBe(DECISION_PROMPT_VERSIONS[type]);
    }
  });
});

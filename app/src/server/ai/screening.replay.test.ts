import "server-only";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ScreeningResultSchema } from "@/domain/contracts";
import { certaintyOf } from "@/domain/routing";
import {
  SCREENING_CASE_TYPES,
  SCREENING_PHOTOS,
  loadScreeningCaseImage,
  screeningCaseInput,
} from "../../../scripts/capture-scenarios";
import { createReplayFetch } from "@/test/replay-fetch";
import { createLlmProvider, getDecisionModel } from "../llm";
import { LlmFailedError, LlmTimeoutError } from "./errors";
import { SCREENING_PROMPT_VERSION, screenCase } from "./screening";

const DIR = path.resolve(
  process.cwd(),
  "tests/fixtures/llm-captures/screening",
);
const file = (name: string) => path.join(DIR, `${name}.json`);
const read = (name: string) =>
  JSON.parse(readFileSync(file(name), "utf8")) as {
    response: { body: string };
  };
const meta = (name: string) =>
  JSON.parse(readFileSync(path.join(DIR, `${name}.meta.json`), "utf8")) as {
    modelId: string;
    promptVersion: string;
  };

async function run(
  name: string,
  photoIdx: number,
  caseType: "return" | "complaint",
  opts: { delayMs?: number; signal?: AbortSignal; modelId?: string } = {},
) {
  const replay = createReplayFetch({
    captures: [file(name)],
    delayMs: opts.delayMs ?? 0,
  });
  const photo = SCREENING_PHOTOS[photoIdx]!;
  const result = screenCase(
    screeningCaseInput(photo, caseType),
    await loadScreeningCaseImage(photo),
    {
      decisionModel: getDecisionModel(
        createLlmProvider({ apiKey: "unused", fetch: replay }),
        opts.modelId ?? meta(name).modelId,
      ),
      signal: opts.signal ?? AbortSignal.timeout(20_000),
      threshold: 0.8,
    },
  );
  return { replay, result };
}

describe("screening replay of real captures", () => {
  SCREENING_PHOTOS.forEach((photo, idx) => {
    for (const caseType of SCREENING_CASE_TYPES) {
      const name = `screening-${photo.id}-${caseType}`;
      it(`${name}: parses into a valid ScreeningResult`, async () => {
        const { replay, result } = await run(name, idx, caseType);
        const screening = await result;
        replay.assertAllConsumed();
        expect(ScreeningResultSchema.safeParse(screening).success).toBe(true);
        const kinds = {
          photo_quality: "choice",
          observed_category: "choice",
          visible_damage_or_use: "boolean",
          condition: "score",
        } as const;
        for (const [id, kind] of Object.entries(kinds)) {
          const answer =
            screening.answers[id as keyof typeof screening.answers];
          expect(answer.refused).toBe(false);
          expect(answer.certainty).toBe(
            certaintyOf(kind, answer.probabilities),
          );
        }
        expect(screening.promptVersion).toBe(SCREENING_PROMPT_VERSION);
      });
    }
  });

  it("takes the BYOK cost from usage.cost_details.upstream_inference_cost (usage.cost is 0)", async () => {
    const name = "screening-phone-1-return";
    const usage = JSON.parse(read(name).response.body).usage as {
      cost: number;
      is_byok: boolean;
      cost_details: { upstream_inference_cost: number };
    };
    expect(usage.cost).toBe(0);
    expect(usage.is_byok).toBe(true);
    const { result } = await run(name, 0, "return");
    const screening = await result;
    expect(screening.costCredits).toBe(
      usage.cost_details.upstream_inference_cost,
    );
    expect(screening.costCredits).toBeGreaterThan(0);
  });

  it("maps the real 401 to LlmFailedError", async () => {
    const { replay, result } = await run(
      "screening-error-invalid-key",
      0,
      "return",
    );
    await expect(result).rejects.toBeInstanceOf(LlmFailedError);
    expect(replay.calls).toBeGreaterThanOrEqual(1);
  });

  it("maps the real 400 unknown-model to LlmFailedError", async () => {
    const { result } = await run("screening-error-unknown-model", 0, "return");
    await expect(result).rejects.toBeInstanceOf(LlmFailedError);
  });

  it("maps a delayed replay of a success capture to LlmTimeoutError", async () => {
    const { result } = await run("screening-phone-1-return", 0, "return", {
      delayMs: 2_000,
      signal: AbortSignal.timeout(100),
    });
    await expect(result).rejects.toBeInstanceOf(LlmTimeoutError);
  });
});

describe("screening capture freshness (ADR-000 TAC-05)", () => {
  it("every screening capture was recorded with the current prompt version", () => {
    const metas = readdirSync(DIR).filter((f) => f.endsWith(".meta.json"));
    expect(metas.length).toBeGreaterThan(0);
    for (const f of metas) {
      const m = JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as {
        promptVersion: string;
      };
      expect(m.promptVersion, f).toBe(SCREENING_PROMPT_VERSION);
    }
  });
});

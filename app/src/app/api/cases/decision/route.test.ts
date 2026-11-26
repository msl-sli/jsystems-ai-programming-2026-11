import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DecisionResponseSchema,
  ErrorResponseSchema,
  type ScreeningResult,
} from "@/domain/contracts";
import { todayInTimeZone } from "@/domain/dates";
import { loadServerEnv } from "@/server/env";
import { createLlmProvider } from "@/server/llm";
import { createReplayFetch } from "@/test/replay-fetch";
import {
  SCREENING_PHOTOS,
  loadScreeningCaseImage,
} from "../../../../../scripts/capture-scenarios";
import {
  complaintR10,
  llmAlwaysR1,
  returnWithDescription,
  screeningFor,
  type DecisionCase,
} from "../../../../../scripts/capture-scenarios.decision";
import type { ApiDeps } from "@/server/http/handler";
import { createDecisionHandler, maxDuration } from "./route";

const IMAGES = path.resolve(process.cwd(), "../assets/example-images");
const b64 = (file: string) =>
  readFileSync(path.join(IMAGES, file)).toString("base64");
const JPEG = b64("phone-1.jpg");
/** Real WebP bytes from the example set, and the PNG file signature (the example set holds no PNG file). */
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
]).toString("base64");
const NON_JPEG: [string, string][] = [
  ["PNG", PNG_SIGNATURE],
  ["WebP (laptop-2.webp)", b64("laptop-2.webp")],
];

// Test seam for the invalid-answer capture: the policy text sent is real, only the validated rule-ID set is narrowed
// (same as scripts/capture-scenarios.decision.ts did when recording).
let restrictedRuleIds: string[] | undefined;
vi.mock("@/server/policies", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/policies")>();
  return {
    ...original,
    loadPolicies: (dir: string) => {
      const policies = original.loadPolicies(dir);
      return restrictedRuleIds
        ? {
            ...policies,
            return: { ...policies.return, ruleIds: restrictedRuleIds },
          }
        : policies;
    },
  };
});

const baseEnv = {
  OPENROUTER_API_KEY: "test-key",
  LLM_MODEL: "chat-model",
  DECISIONS_MODEL: "decisions-model",
};
const env = loadServerEnv(baseEnv);

const DESCRIPTION = "ZZ-OPIS-KLIENTA ekran przestal reagowac na dotyk";

function deps(overrides: Partial<ApiDeps> = {}): ApiDeps {
  return {
    getEnv: () => env,
    createProvider: () => {
      throw new Error("the provider must not be created on the template route");
    },
    now: () => new Date("2026-11-26T10:00:00Z"),
    ...overrides,
  };
}

/** Client-supplied ScreeningResult (ADR-002: screening signals pass through the client), built here as request input. */
function screening(
  overrides: {
    quality?: string;
    observed?: string;
    damage?: boolean;
    condition?: number;
  } = {},
): ScreeningResult {
  // Routing recomputes certainty from the probabilities, so they must carry the confidence.
  const ans = <T>(value: T, probabilities: Record<string, number>) => ({
    value,
    probabilities,
    certainty: 0.95,
    confident: true,
    refused: false,
  });
  const quality = overrides.quality ?? "ok";
  const observed = overrides.observed ?? "smartphone";
  const damage = overrides.damage ?? false;
  const condition = overrides.condition ?? 0;
  return {
    answers: {
      photo_quality: ans(quality, { [quality]: 0.95 }),
      observed_category: ans(observed, { [observed]: 0.95 }),
      visible_damage_or_use: ans(damage, { true: damage ? 0.95 : 0.05 }),
      condition: ans(condition, { [String(condition)]: 0.95 }),
    },
    uncertainAreas: [],
    model: "client-supplied",
    promptVersion: "test",
    latencyMs: 1,
  } as unknown as ScreeningResult;
}

const daysAgo = (days: number) => {
  const d = new Date("2026-11-26T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

const returnInput = (purchaseDate: string) => ({
  caseType: "return",
  category: "smartphone",
  productName: "Telefon X",
  purchaseDate,
  description: "",
});
const complaintInput = (purchaseDate: string) => ({
  caseType: "complaint",
  category: "smartphone",
  productName: "Telefon X",
  purchaseDate,
  description: DESCRIPTION,
});
const caseImage = (base64 = JPEG) => ({
  mediaType: "image/jpeg",
  base64,
  width: 800,
  height: 600,
});

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/cases/decision", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
const postJson = (value: unknown) => post(JSON.stringify(value));
const valid = (overrides: Record<string, unknown> = {}) => ({
  caseInput: returnInput(daysAgo(3)),
  caseImage: caseImage(),
  screening: screening(),
  ...overrides,
});

let fetchSpy: ReturnType<typeof vi.spyOn>;
let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
  info = vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled(); // TAC-002-03 / TAC-002-04
  vi.restoreAllMocks();
});

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(ErrorResponseSchema.parse(body).error.code).toBe(code);
  expect(Object.keys(body)).toEqual(["error"]);
}

describe("POST /api/cases/decision", () => {
  it("exports maxDuration = timeout (50 s) + 5", () => {
    expect(maxDuration).toBe(55);
  });

  describe("errors before any service call", () => {
    const handler = createDecisionHandler(deps());

    it("400 for a body that is not JSON", async () => {
      await expectError(await handler(post("nope")), 400, "invalid_request");
    });

    it("400 for a missing screening", async () => {
      const rest: Record<string, unknown> = valid();
      delete rest.screening;
      await expectError(await handler(postJson(rest)), 400, "invalid_request");
    });

    it("400 for a malformed screening result", async () => {
      await expectError(
        await handler(postJson(valid({ screening: { answers: {} } }))),
        400,
        "invalid_request",
      );
    });

    it("400 for a purchase date more than one day ahead", async () => {
      await expectError(
        await handler(
          postJson(valid({ caseInput: returnInput("2026-11-28") })),
        ),
        400,
        "invalid_request",
      );
    });

    it("400 for a purchase date older than 10 years", async () => {
      await expectError(
        await handler(
          postJson(valid({ caseInput: returnInput("2016-11-25") })),
        ),
        400,
        "invalid_request",
      );
    });

    it("413 for a declared Content-Length above 2.6 MB", async () => {
      await expectError(
        await handler(
          post("{}", { "content-length": String(2.6 * 1024 * 1024 + 1) }),
        ),
        413,
        "payload_too_large",
      );
    });

    it("413 for actual bytes above 2.6 MB", async () => {
      const request = post(
        JSON.stringify({ filler: "a".repeat(2.6 * 1024 * 1024 + 10) }),
      );
      await expectError(await handler(request), 413, "payload_too_large");
    });

    it("413 for a decoded image above 1.5 MB", async () => {
      const big = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff]),
        Buffer.alloc(1.6 * 1024 * 1024),
      ]).toString("base64");
      await expectError(
        await handler(postJson(valid({ caseImage: caseImage(big) }))),
        413,
        "payload_too_large",
      );
    });

    it.each(NON_JPEG)(
      "415 for %s bytes declared as JPEG",
      async (_name, data) => {
        await expectError(
          await handler(postJson(valid({ caseImage: caseImage(data) }))),
          415,
          "unsupported_image",
        );
      },
    );

    it("500 server_misconfigured for an incomplete environment", async () => {
      const bad = createDecisionHandler(
        deps({ getEnv: () => loadServerEnv({}) }),
      );
      await expectError(
        await bad(postJson(valid())),
        500,
        "server_misconfigured",
      );
    });

    it("500 server_misconfigured when the policy directory is unavailable", async () => {
      const bad = createDecisionHandler(
        deps({
          getEnv: () =>
            loadServerEnv({
              ...baseEnv,
              POLICIES_DIR: "/nonexistent-policies-dir",
            }),
        }),
      );
      await expectError(
        await bad(postJson(valid())),
        500,
        "server_misconfigured",
      );
    });
  });

  describe("template route (TAC-002-04: zero outbound requests)", () => {
    const handler = createDecisionHandler(deps());

    const cases: {
      name: string;
      rule: string;
      category: string;
      body: () => Record<string, unknown>;
    }[] = [
      {
        name: "return 20 days ago",
        rule: "R1",
        category: "return_rejected",
        body: () => valid({ caseInput: returnInput(daysAgo(20)) }),
      },
      {
        name: "complaint 3 years ago",
        rule: "R2",
        category: "complaint_rejected",
        body: () => valid({ caseInput: complaintInput(daysAgo(3 * 365 + 1)) }),
      },
      {
        name: "blurry photo",
        rule: "R4",
        category: "manual_review",
        body: () => valid({ screening: screening({ quality: "blurry" }) }),
      },
      {
        name: "observed laptop on a smartphone form",
        rule: "R5",
        category: "manual_review",
        body: () => valid({ screening: screening({ observed: "laptop" }) }),
      },
      {
        name: "visible damage on a return",
        rule: "R7",
        category: "return_rejected",
        body: () =>
          valid({ screening: screening({ damage: true, condition: 2 }) }),
      },
      {
        name: "undamaged return",
        rule: "R8",
        category: "return_accepted",
        body: () => valid(),
      },
    ];

    it.each(cases)(
      "$rule: $name -> 200 template",
      async ({ rule, category, body }) => {
        const response = await handler(postJson(body()));
        expect(response.status).toBe(200);
        const parsed = DecisionResponseSchema.parse(await response.json());
        expect(parsed.decision).toMatchObject({
          decisionPath: "template",
          routeRule: rule,
          category,
          mode: "hybrid",
        });
        expect(parsed.llmFindings).toBeUndefined();
        expect(parsed.decision.citedRuleIds.length).toBeGreaterThan(0);
        expect(fetchSpy).not.toHaveBeenCalled();
      },
    );

    it("reports the DECISION_MODE of the environment (decisions-only turns R10 into a template)", async () => {
      const decisionsOnly = createDecisionHandler(
        deps({
          getEnv: () =>
            loadServerEnv({ ...baseEnv, DECISION_MODE: "decisions-only" }),
        }),
      );
      const response = await decisionsOnly(
        postJson(valid({ caseInput: complaintInput(daysAgo(10)) })),
      );
      expect(response.status).toBe(200);
      const parsed = DecisionResponseSchema.parse(await response.json());
      expect(parsed.decision).toMatchObject({
        decisionPath: "template",
        routeRule: "R10",
        mode: "decisions-only",
      });
    });

    it("accepts a purchase date one day ahead (browser time-zone skew) as the purchase day", async () => {
      const response = await handler(
        postJson(valid({ caseInput: returnInput("2026-11-27") })),
      );
      expect(response.status).toBe(200);
      expect(
        DecisionResponseSchema.parse(await response.json()).decision.routeRule,
      ).toBe("R8");
    });

    it("logs path and rule, but no description, text or base64", async () => {
      await handler(
        postJson(valid({ caseInput: complaintInput(daysAgo(3 * 365 + 1)) })),
      );
      expect(info).toHaveBeenCalledTimes(1);
      const text = info.mock.calls[0]?.[0] as string;
      expect(JSON.parse(text)).toMatchObject({
        endpoint: "/api/cases/decision",
        status: 200,
        decisionPath: "template",
        routeRule: "R2",
        mode: "hybrid",
      });
      expect(text).not.toContain(DESCRIPTION);
      expect(text).not.toContain(JPEG.slice(0, 40));
    });
  });

  describe("llm route from real captures (replayed OpenRouter responses)", () => {
    const CAPTURES = path.resolve(
      process.cwd(),
      "tests/fixtures/llm-captures/decision",
    );
    const capturePath = (name: string) => path.join(CAPTURES, `${name}.json`);
    const capturedAt = (name: string) =>
      new Date(
        JSON.parse(
          readFileSync(
            capturePath(name).replace(/\.json$/, ".meta.json"),
            "utf8",
          ),
        ).capturedAt,
      );

    async function run(
      spec: DecisionCase,
      captures: string[],
      options: {
        mode?: string;
        restrictReturnRuleIds?: string[];
        delayMs?: number;
        timeoutMs?: number;
      } = {},
    ) {
      const replayEnv = loadServerEnv({
        OPENROUTER_API_KEY: "unused",
        LLM_MODEL: "openai/gpt-6-luna",
        DECISIONS_MODEL: "typesafe/jev-1.14",
        ...(options.mode ? { DECISION_MODE: options.mode } : {}),
      });
      const at = capturedAt(captures[0]!);
      const todayIso = todayInTimeZone(replayEnv.appTimeZone, at);
      const caseInput = spec.caseInput(todayIso);
      const photo = SCREENING_PHOTOS.find((p) => p.id === spec.photoId)!;
      // The real screening answer comes from its own capture, parsed by the real screenCase.
      const screening = await screeningFor(
        spec.photoId,
        caseInput.caseType,
        replayEnv,
      );
      const replay = createReplayFetch({
        captures: captures.map(capturePath),
        delayMs: options.delayMs ?? 0,
      });
      restrictedRuleIds = options.restrictReturnRuleIds;
      const handler = createDecisionHandler({
        getEnv: () => replayEnv,
        createProvider: (e) =>
          createLlmProvider({ apiKey: e.openrouterApiKey, fetch: replay }),
        now: () => at,
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      });
      const response = await handler(
        postJson({
          caseInput,
          caseImage: await loadScreeningCaseImage(photo),
          screening,
        }),
      );
      return { response, replay };
    }

    it("R6 return with a description -> 200 llm path, one outbound chat request", async () => {
      const { response, replay } = await run(returnWithDescription, [
        "decision-return-description",
      ]);
      expect(response.status).toBe(200);
      const parsed = DecisionResponseSchema.parse(await response.json());
      expect(parsed.decision).toMatchObject({
        decisionPath: "llm",
        routeRule: "R6",
        mode: "hybrid",
      });
      expect(replay.calls).toBe(1);
      replay.assertAllConsumed();
    });

    it("complaint (captured as R10, routed R3) -> 200 llm path with exactly one outbound chat request", async () => {
      const { response, replay } = await run(complaintR10, [
        "decision-complaint",
      ]);
      expect(response.status).toBe(200);
      const parsed = DecisionResponseSchema.parse(await response.json());
      expect(parsed.decision).toMatchObject({
        decisionPath: "llm",
        // The capture script forced R10, the real router picks R3 for this screening; the request hash is identical.
        routeRule: "R3",
      });
      expect(replay.calls).toBe(1);
      replay.assertAllConsumed();
    });

    it("llm-always mode routes R1 through the llm path (explain-only, fixed category)", async () => {
      const { response, replay } = await run(
        llmAlwaysR1,
        ["decision-llm-always-r1"],
        { mode: "llm-always" },
      );
      expect(response.status).toBe(200);
      const parsed = DecisionResponseSchema.parse(await response.json());
      expect(parsed.decision).toMatchObject({
        decisionPath: "llm",
        routeRule: "R1",
        category: "return_rejected",
        mode: "llm-always",
      });
      expect(replay.calls).toBe(1);
      replay.assertAllConsumed();
    });

    it("502 llm_failed after the corrective retry (two outbound requests)", async () => {
      const { response, replay } = await run(
        returnWithDescription,
        ["decision-return-invalid-first", "decision-return-invalid-first-2"],
        { restrictReturnRuleIds: ["RET-7"] },
      );
      await expectError(response, 502, "llm_failed");
      expect(replay.calls).toBe(2);
      replay.assertAllConsumed();
    });

    it("504 llm_timeout for a delayed replay with a small timeout", async () => {
      const { response } = await run(
        returnWithDescription,
        ["decision-return-description"],
        { delayMs: 2_000, timeoutMs: 50 },
      );
      await expectError(response, 504, "llm_timeout");
    });
  });
});

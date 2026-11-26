import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ErrorResponseSchema,
  ScreeningResponseSchema,
} from "@/domain/contracts";
import { createLlmProvider } from "@/server/llm";
import { createReplayFetch } from "@/test/replay-fetch";
import {
  SCREENING_PHOTOS,
  loadScreeningCaseImage,
  screeningCaseInput,
} from "../../../../../scripts/capture-scenarios";
import { ServerConfigError, loadServerEnv } from "@/server/env";
import type { ApiDeps } from "@/server/http/handler";
import { createScreeningHandler, maxDuration } from "./route";

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

const env = loadServerEnv({
  OPENROUTER_API_KEY: "test-key",
  LLM_MODEL: "chat-model",
  DECISIONS_MODEL: "decisions-model",
});

const DESCRIPTION = "ZZ-OPIS-KLIENTA ekran przestal reagowac na dotyk";

function deps(overrides: Partial<ApiDeps> = {}): ApiDeps {
  return {
    getEnv: () => env,
    createProvider: () => {
      throw new Error("the provider must not be created on this path");
    },
    now: () => new Date("2026-11-26T10:00:00Z"),
    ...overrides,
  };
}

const caseInput = (overrides: Record<string, unknown> = {}) => ({
  caseType: "complaint",
  category: "smartphone",
  productName: "Telefon X",
  purchaseDate: "2026-10-01",
  description: DESCRIPTION,
  ...overrides,
});
const caseImage = (base64 = JPEG, overrides: Record<string, unknown> = {}) => ({
  mediaType: "image/jpeg",
  base64,
  width: 800,
  height: 600,
  ...overrides,
});

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/cases/screening", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
const postJson = (value: unknown) => post(JSON.stringify(value));

let fetchSpy: ReturnType<typeof vi.spyOn>;
let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
  info = vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  // TAC-002-03: none of the paths below may leave the process.
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(ErrorResponseSchema.parse(body).error.code).toBe(code);
  expect(Object.keys(body)).toEqual(["error"]);
}

describe("POST /api/cases/screening", () => {
  it("exports maxDuration = timeout (25 s) + 5", () => {
    expect(maxDuration).toBe(30);
  });

  describe("400 invalid_request", () => {
    const handler = createScreeningHandler(deps());

    it("rejects a body that is not JSON", async () => {
      await expectError(
        await handler(post("{not json")),
        400,
        "invalid_request",
      );
    });

    it("rejects an empty base64 string", async () => {
      await expectError(
        await handler(
          postJson({ caseInput: caseInput(), caseImage: caseImage("") }),
        ),
        400,
        "invalid_request",
      );
    });

    it("rejects invalid base64", async () => {
      await expectError(
        await handler(
          postJson({
            caseInput: caseInput(),
            caseImage: caseImage("%%%not-base64%%%"),
          }),
        ),
        400,
        "invalid_request",
      );
    });

    it("rejects a missing caseImage", async () => {
      await expectError(
        await handler(postJson({ caseInput: caseInput() })),
        400,
        "invalid_request",
      );
    });

    it("rejects a case input that fails the form rules", async () => {
      await expectError(
        await handler(
          postJson({
            caseInput: caseInput({ description: "short" }),
            caseImage: caseImage(),
          }),
        ),
        400,
        "invalid_request",
      );
    });

    it("rejects a purchase date more than one day ahead", async () => {
      await expectError(
        await handler(
          postJson({
            caseInput: caseInput({ purchaseDate: "2026-11-28" }),
            caseImage: caseImage(),
          }),
        ),
        400,
        "invalid_request",
      );
    });

    it("rejects a purchase date older than 10 years", async () => {
      await expectError(
        await handler(
          postJson({
            caseInput: caseInput({ purchaseDate: "2016-11-25" }),
            caseImage: caseImage(),
          }),
        ),
        400,
        "invalid_request",
      );
    });

    it("rejects unknown fields and a wrong media type", async () => {
      await expectError(
        await handler(
          postJson({
            caseInput: caseInput(),
            caseImage: caseImage(JPEG),
            extra: 1,
          }),
        ),
        400,
        "invalid_request",
      );
      await expectError(
        await handler(
          postJson({
            caseInput: caseInput(),
            caseImage: caseImage(JPEG, { mediaType: "image/png" }),
          }),
        ),
        400,
        "invalid_request",
      );
    });
  });

  describe("413 payload_too_large", () => {
    const handler = createScreeningHandler(deps());

    it("rejects a declared Content-Length above 2.5 MB before reading", async () => {
      await expectError(
        await handler(
          post("{}", { "content-length": String(2.5 * 1024 * 1024 + 1) }),
        ),
        413,
        "payload_too_large",
      );
    });

    it("rejects actual bytes above 2.5 MB without a Content-Length header", async () => {
      const filler = "a".repeat(2.5 * 1024 * 1024 + 10);
      const request = post(JSON.stringify({ filler }));
      expect(request.headers.get("content-length")).toBeNull();
      await expectError(await handler(request), 413, "payload_too_large");
    });

    it("rejects a decoded image above 1.5 MB", async () => {
      const big = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff]),
        Buffer.alloc(1.6 * 1024 * 1024),
      ]).toString("base64");
      await expectError(
        await handler(
          postJson({ caseInput: caseInput(), caseImage: caseImage(big) }),
        ),
        413,
        "payload_too_large",
      );
    });
  });

  describe("415 unsupported_image", () => {
    const handler = createScreeningHandler(deps());

    it.each(NON_JPEG)(
      "rejects %s bytes declared as JPEG",
      async (_name, data) => {
        await expectError(
          await handler(
            postJson({
              caseInput: caseInput(),
              caseImage: caseImage(data),
            }),
          ),
          415,
          "unsupported_image",
        );
      },
    );
  });

  describe("500 server_misconfigured", () => {
    it("answers 500 when the environment is incomplete", async () => {
      const handler = createScreeningHandler(
        deps({ getEnv: () => loadServerEnv({ OPENROUTER_API_KEY: "k" }) }),
      );
      await expectError(
        await handler(
          postJson({ caseInput: caseInput(), caseImage: caseImage() }),
        ),
        500,
        "server_misconfigured",
      );
    });

    it("answers 500 when reading the configuration throws", async () => {
      const handler = createScreeningHandler(
        deps({
          getEnv: () => {
            throw new ServerConfigError(
              "Invalid server configuration: LLM_MODEL",
            );
          },
        }),
      );
      const response = await handler(
        postJson({ caseInput: caseInput(), caseImage: caseImage() }),
      );
      await expectError(response, 500, "server_misconfigured");
    });
  });

  it("logs one metadata line without description or base64 (error path)", async () => {
    const handler = createScreeningHandler(deps());
    await handler(
      postJson({
        caseInput: caseInput({ purchaseDate: "2026-11-28" }),
        caseImage: caseImage(),
      }),
    );
    expect(info).toHaveBeenCalledTimes(1);
    const text = info.mock.calls[0]?.[0] as string;
    expect(JSON.parse(text)).toMatchObject({
      endpoint: "/api/cases/screening",
      status: 400,
      errorCode: "invalid_request",
    });
    expect(text).not.toContain(DESCRIPTION);
    expect(text).not.toContain(JPEG.slice(0, 40));
  });

  describe("from real captures (replayed OpenRouter responses)", () => {
    const CAPTURES = path.resolve(
      process.cwd(),
      "tests/fixtures/llm-captures/screening",
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
    const replayEnv = (decisionsModel = "typesafe/jev-1.14") =>
      loadServerEnv({
        OPENROUTER_API_KEY: "unused",
        LLM_MODEL: "openai/gpt-6-luna",
        DECISIONS_MODEL: decisionsModel,
      });
    const phone1 = SCREENING_PHOTOS[0];

    async function run(
      name: string,
      options: {
        delayMs?: number;
        timeoutMs?: number;
        decisionsModel?: string;
        signal?: AbortSignal;
        abortAfterMs?: number;
      } = {},
    ) {
      const replay = createReplayFetch({
        captures: [capturePath(name)],
        delayMs: options.delayMs ?? 0,
      });
      const handler = createScreeningHandler({
        getEnv: () => replayEnv(options.decisionsModel),
        createProvider: (e) =>
          createLlmProvider({ apiKey: e.openrouterApiKey, fetch: replay }),
        now: () => capturedAt(name),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      });
      const controller = new AbortController();
      const request = new Request("http://localhost/api/cases/screening", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          caseInput: screeningCaseInput(phone1, "return"),
          caseImage: await loadScreeningCaseImage(phone1),
        }),
        signal: controller.signal,
      });
      const pending = handler(request);
      if (options.abortAfterMs !== undefined) {
        setTimeout(() => controller.abort(), options.abortAfterMs);
      }
      return { response: await pending, replay };
    }

    it("200 { screening } for a real success capture", async () => {
      const { response, replay } = await run("screening-phone-1-return");
      expect(response.status).toBe(200);
      const parsed = ScreeningResponseSchema.parse(await response.json());
      expect(Object.keys(parsed.screening.answers).sort()).toEqual([
        "condition",
        "observed_category",
        "photo_quality",
        "visible_damage_or_use",
      ]);
      replay.assertAllConsumed();
      expect(replay.calls).toBe(1);
    });

    it("502 llm_failed (retryable, no provider text) for the real 401", async () => {
      const { response, replay } = await run("screening-error-invalid-key");
      await expectError(response, 502, "llm_failed");
      replay.assertAllConsumed();
    });

    it("502 llm_failed for the real 400 unknown-model response", async () => {
      const { response, replay } = await run("screening-error-unknown-model", {
        decisionsModel: "openai/does-not-exist-hsdc",
      });
      await expectError(response, 502, "llm_failed");
      replay.assertAllConsumed();
    });

    it("the 502 envelope marks the error retryable and leaks no provider text", async () => {
      const { response } = await run("screening-error-invalid-key");
      const text = JSON.stringify(await response.clone().json());
      const providerBody = JSON.parse(
        readFileSync(capturePath("screening-error-invalid-key"), "utf8"),
      ).response.body as string;
      expect(
        ErrorResponseSchema.parse(await response.json()).error.retryable,
      ).toBe(true);
      expect(text).not.toContain(providerBody.slice(0, 40));
      expect(text.toLowerCase()).not.toContain("openrouter");
    });

    it("504 llm_timeout for a delayed replay with a small timeout", async () => {
      const { response } = await run("screening-phone-1-return", {
        delayMs: 2_000,
        timeoutMs: 50,
      });
      await expectError(response, 504, "llm_timeout");
    });

    it("a client abort maps to llm_timeout", async () => {
      const { response } = await run("screening-phone-1-return", {
        delayMs: 2_000,
        abortAfterMs: 20,
      });
      await expectError(response, 504, "llm_timeout");
    });

    it.todo(
      "200 with refused answers when the provider refuses (coverage gap: no refusal could be provoked, plan 7a.4)",
    );
  });
});

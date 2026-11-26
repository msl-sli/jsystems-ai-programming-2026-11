import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorResponseSchema } from "@/domain/contracts";
import { LlmFailedError, LlmTimeoutError } from "../ai/errors";
import { ServerConfigError, loadServerEnv } from "../env";
import { HttpError } from "./envelope";
import {
  handle,
  mapError,
  purchaseDateBoundary,
  type ApiDeps,
} from "./handler";

const env = loadServerEnv({
  OPENROUTER_API_KEY: "test-key",
  LLM_MODEL: "chat-model",
  DECISIONS_MODEL: "decisions-model",
});

const deps: ApiDeps = {
  getEnv: () => env,
  createProvider: () => {
    throw new Error("provider must not be created");
  },
  now: () => new Date("2026-11-26T10:00:00Z"),
};

afterEach(() => vi.restoreAllMocks());

describe("mapError", () => {
  it("maps each known error type to its status and code", () => {
    expect(mapError(new HttpError(413, "payload_too_large"))).toEqual({
      status: 413,
      code: "payload_too_large",
    });
    expect(mapError(new LlmFailedError("x"))).toEqual({
      status: 502,
      code: "llm_failed",
    });
    expect(mapError(new LlmTimeoutError("x"))).toEqual({
      status: 504,
      code: "llm_timeout",
    });
    expect(mapError(new ServerConfigError("x"))).toEqual({
      status: 500,
      code: "server_misconfigured",
    });
  });

  it("masks anything unknown as server_misconfigured", () => {
    expect(mapError(new Error("boom"))).toEqual({
      status: 500,
      code: "server_misconfigured",
    });
  });
});

describe("purchaseDateBoundary", () => {
  it("is tomorrow in APP_TIME_ZONE", () => {
    expect(purchaseDateBoundary(env, new Date("2026-11-26T10:00:00Z"))).toBe(
      "2026-11-27",
    );
  });

  it("uses the configured zone, not UTC", () => {
    // 23:30 UTC is already the next day in Warsaw (UTC+1 in November).
    expect(purchaseDateBoundary(env, new Date("2026-11-26T23:30:00Z"))).toBe(
      "2026-11-28",
    );
  });
});

describe("handle", () => {
  it("returns the run response and logs one metadata line", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await handle("test", deps, async () => ({
      response: Response.json({ ok: true }),
      log: { decisionPath: "template" },
    }));
    expect(response.status).toBe(200);
    expect(info).toHaveBeenCalledTimes(1);
    const line = JSON.parse(info.mock.calls[0]?.[0] as string);
    expect(line).toMatchObject({
      endpoint: "test",
      status: 200,
      decisionPath: "template",
    });
    expect(typeof line.requestId).toBe("string");
    expect(line.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("answers thrown errors with the masked envelope and logs the error code", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await handle("test", deps, async () => {
      throw new LlmFailedError("secret provider text");
    });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(ErrorResponseSchema.parse(body)).toEqual({
      error: { code: "llm_failed", retryable: true },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.parse(info.mock.calls[0]?.[0] as string)).toMatchObject({
      status: 502,
      errorCode: "llm_failed",
    });
  });

  it("returns 500 server_misconfigured when the environment is invalid", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const bad: ApiDeps = {
      ...deps,
      getEnv: () => loadServerEnv({}),
    };
    const run = vi.fn();
    const response = await handle("test", bad, run);
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("server_misconfigured");
    expect(run).not.toHaveBeenCalled();
  });
});

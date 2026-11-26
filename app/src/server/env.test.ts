import "server-only";
import { beforeEach, describe, expect, it } from "vitest";
import { ServerConfigError, getServerEnv, loadServerEnv, resetServerEnvForTests } from "./env";

const base = {
  OPENROUTER_API_KEY: "sk-or-test-secret-123",
  LLM_MODEL: "vendor/chat",
  DECISIONS_MODEL: "vendor/decisions",
};

describe("loadServerEnv", () => {
  beforeEach(() => resetServerEnvForTests());

  it("applies defaults", () => {
    const env = loadServerEnv(base);
    expect(env).toMatchObject({
      openrouterApiKey: "sk-or-test-secret-123",
      llmModel: "vendor/chat",
      decisionsModel: "vendor/decisions",
      decisionMode: "hybrid",
      confidenceThreshold: 0.8,
      appTimeZone: "Europe/Warsaw",
    });
    expect(env.policiesDir).toMatch(/docs\/policies$/);
    expect(env.policiesDir.startsWith("/")).toBe(true);
  });

  it("reads overrides", () => {
    const env = loadServerEnv({
      ...base,
      DECISION_MODE: "llm-always",
      DECISIONS_CONFIDENCE_THRESHOLD: "0.9",
      POLICIES_DIR: "/tmp/pol",
      APP_TIME_ZONE: "UTC",
    });
    expect(env.decisionMode).toBe("llm-always");
    expect(env.confidenceThreshold).toBe(0.9);
    expect(env.policiesDir).toBe("/tmp/pol");
    expect(env.appTimeZone).toBe("UTC");
  });

  it.each([
    ["missing key", { ...base, OPENROUTER_API_KEY: undefined }],
    ["missing decisions model", { ...base, DECISIONS_MODEL: undefined }],
    ["empty llm model", { ...base, LLM_MODEL: "" }],
    ["bad mode", { ...base, DECISION_MODE: "nope" }],
    ["threshold too high", { ...base, DECISIONS_CONFIDENCE_THRESHOLD: "1.5" }],
    ["threshold too low", { ...base, DECISIONS_CONFIDENCE_THRESHOLD: "0.2" }],
    ["threshold NaN", { ...base, DECISIONS_CONFIDENCE_THRESHOLD: "abc" }],
    ["bad zone", { ...base, APP_TIME_ZONE: "Mars/Olympus" }],
  ])("throws ServerConfigError: %s", (_name, source) => {
    expect(() => loadServerEnv(source as Record<string, string | undefined>)).toThrow(ServerConfigError);
  });

  it("never leaks secret values in the error message", () => {
    try {
      loadServerEnv({ ...base, DECISION_MODE: "sk-or-test-secret-123" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("sk-or-test-secret-123");
    }
  });

  it("getServerEnv caches until reset", () => {
    const original = { ...process.env };
    Object.assign(process.env, base);
    try {
      const first = getServerEnv();
      expect(getServerEnv()).toBe(first);
      resetServerEnvForTests();
      expect(getServerEnv()).not.toBe(first);
    } finally {
      process.env = original;
    }
  });
});

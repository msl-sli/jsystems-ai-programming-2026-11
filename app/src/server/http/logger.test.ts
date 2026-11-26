import "server-only";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logRequest } from "./logger";

afterEach(() => vi.restoreAllMocks());

function capture(fields: Record<string, unknown>) {
  const spy = vi.spyOn(console, "info").mockImplementation(() => {});
  logRequest(fields as never);
  expect(spy).toHaveBeenCalledTimes(1);
  const line = spy.mock.calls[0]?.[0] as string;
  return { line, parsed: JSON.parse(line) as Record<string, unknown> };
}

describe("logRequest", () => {
  it("writes one JSON line with allow-listed fields", () => {
    const { line, parsed } = capture({
      requestId: "r1",
      endpoint: "/api/cases/decision",
      status: 200,
      durationMs: 12,
      models: { llm: "a/b" },
      decisionPath: "template",
      routeRule: "R1",
      mode: "hybrid",
      certainties: { q: 0.9 },
      usage: { inputTokens: 1 },
      costCredits: 0.01,
      errorCode: "llm_failed",
    });
    expect(line).not.toContain("\n");
    expect(Object.keys(parsed).sort()).toEqual(
      ["certainties", "costCredits", "decisionPath", "durationMs", "endpoint", "errorCode", "mode", "models", "requestId", "routeRule", "status", "usage"].sort(),
    );
  });

  it("drops non-allow-listed keys (TAC-08)", () => {
    const { line, parsed } = capture({
      requestId: "r1",
      description: "SECRET-DESC",
      messages: ["SECRET-MSG"],
      base64: "SECRET-B64",
      text: "SECRET-TEXT",
      caseImage: { data: "SECRET-IMG" },
    });
    expect(Object.keys(parsed)).toEqual(["requestId"]);
    expect(line).not.toMatch(/SECRET/);
  });

  it("truncates providerMessage to 200 chars", () => {
    const { parsed } = capture({ requestId: "r", providerMessage: "x".repeat(500) });
    expect((parsed.providerMessage as string).length).toBe(200);
  });

  it("ignores undefined values", () => {
    const { parsed } = capture({ requestId: "r", status: undefined });
    expect("status" in parsed).toBe(false);
  });
});

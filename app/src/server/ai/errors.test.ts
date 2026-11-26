import "server-only";
import { describe, expect, it } from "vitest";
import { LlmFailedError, LlmTimeoutError, toLlmError } from "./errors";

describe("LLM errors", () => {
  it("carry a stable code and name", () => {
    const failed = new LlmFailedError("boom");
    const timeout = new LlmTimeoutError("slow");
    expect(failed).toBeInstanceOf(Error);
    expect([failed.code, failed.name]).toEqual([
      "llm_failed",
      "LlmFailedError",
    ]);
    expect([timeout.code, timeout.name]).toEqual([
      "llm_timeout",
      "LlmTimeoutError",
    ]);
  });

  it("truncates provider text in the message to 200 characters", () => {
    expect(new LlmFailedError("x".repeat(500)).message).toHaveLength(200);
  });
});

describe("toLlmError", () => {
  it("maps AbortError and TimeoutError to a timeout", () => {
    expect(
      toLlmError(new DOMException("aborted", "AbortError")),
    ).toBeInstanceOf(LlmTimeoutError);
    expect(toLlmError(new DOMException("t", "TimeoutError"))).toBeInstanceOf(
      LlmTimeoutError,
    );
  });

  it("finds an abort nested in cause or lastError", () => {
    const abort = new DOMException("aborted", "AbortError");
    expect(toLlmError(new Error("wrapped", { cause: abort }))).toBeInstanceOf(
      LlmTimeoutError,
    );
    expect(
      toLlmError(Object.assign(new Error("retry"), { lastError: abort })),
    ).toBeInstanceOf(LlmTimeoutError);
  });

  it("maps an already aborted signal to a timeout even for an unrelated error", () => {
    const controller = new AbortController();
    controller.abort();
    expect(toLlmError(new Error("other"), controller.signal)).toBeInstanceOf(
      LlmTimeoutError,
    );
  });

  it("maps everything else to LlmFailedError and keeps the original as cause", () => {
    const original = new Error("HTTP 401 ".padEnd(400, "z"));
    const mapped = toLlmError(original);
    expect(mapped).toBeInstanceOf(LlmFailedError);
    expect(mapped.message.length).toBeLessThanOrEqual(200);
    expect(mapped.cause).toBe(original);
    expect(toLlmError("string failure")).toBeInstanceOf(LlmFailedError);
  });

  it("passes through existing LLM errors", () => {
    const existing = new LlmTimeoutError("t");
    expect(toLlmError(existing)).toBe(existing);
  });
});

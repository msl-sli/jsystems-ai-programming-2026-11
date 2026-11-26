import "server-only";
import { describe, expect, it } from "vitest";
import { ErrorResponseSchema, ERROR_CODES } from "@/domain/contracts";
import { HttpError, errorResponse } from "./envelope";

const expected = {
  invalid_request: [400, false],
  payload_too_large: [413, false],
  unsupported_image: [415, false],
  llm_failed: [502, true],
  llm_timeout: [504, true],
  server_misconfigured: [500, false],
  chat_failed: [500, true],
} as const;

describe("errorResponse", () => {
  it.each(Object.entries(expected))("%s -> status and retryable", async (code, [status, retryable]) => {
    const response = errorResponse(code as keyof typeof expected, status);
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(ErrorResponseSchema.parse(body)).toEqual({ error: { code, retryable } });
  });

  it("covers every contract error code", () => {
    expect(Object.keys(expected).sort()).toEqual([...ERROR_CODES].sort());
  });

  it("HttpError carries code and status", () => {
    const error = new HttpError(413, "payload_too_large");
    expect(error.status).toBe(413);
    expect(error.code).toBe("payload_too_large");
    expect(error.message).toBe("payload_too_large");
  });
});

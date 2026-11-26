import "server-only";
import type { ErrorCode, ErrorResponse } from "@/domain/contracts";

const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>(["llm_failed", "llm_timeout", "chat_failed"]);

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
  ) {
    super(code);
    this.name = "HttpError";
  }
}

/** Masked error envelope: code and retryable only, never provider messages, stacks or paths. */
export function errorResponse(code: ErrorCode, status: number): Response {
  const body: ErrorResponse = { error: { code, retryable: RETRYABLE.has(code) } };
  return Response.json(body, { status });
}

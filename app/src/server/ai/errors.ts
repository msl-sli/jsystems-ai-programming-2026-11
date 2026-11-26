import "server-only";

/** Provider text may end up in messages and logs: never more than this many characters. */
const MAX_MESSAGE = 200;

function clip(message: string): string {
  return message.slice(0, MAX_MESSAGE);
}

/** Transport error, HTTP 4xx/5xx or an invalid response from a model call (ADR-002 `llm_failed`). */
export class LlmFailedError extends Error {
  readonly code = "llm_failed" as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(clip(message), options);
    this.name = "LlmFailedError";
  }
}

/** The call was aborted by its signal or timed out (ADR-002 `llm_timeout`). */
export class LlmTimeoutError extends Error {
  readonly code = "llm_timeout" as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(clip(message), options);
    this.name = "LlmTimeoutError";
  }
}

function isAbortLike(error: unknown, depth = 0): boolean {
  if (typeof error !== "object" || error === null || depth > 5) return false;
  const { name, cause, lastError } = error as {
    name?: unknown;
    cause?: unknown;
    lastError?: unknown;
  };
  if (name === "AbortError" || name === "TimeoutError") return true;
  return isAbortLike(cause, depth + 1) || isAbortLike(lastError, depth + 1);
}

/** Maps anything thrown by a model call to the two shared error types. */
export function toLlmError(
  error: unknown,
  signal?: AbortSignal,
): LlmFailedError | LlmTimeoutError {
  if (error instanceof LlmFailedError || error instanceof LlmTimeoutError)
    return error;
  const text = error instanceof Error ? error.message : "Model call failed";
  if (signal?.aborted || isAbortLike(error))
    return new LlmTimeoutError(text || "Model call timed out", {
      cause: error,
    });
  return new LlmFailedError(text || "Model call failed", { cause: error });
}

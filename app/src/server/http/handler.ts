import "server-only";
import { addDays, format, parseISO } from "date-fns";
import type { ZodType } from "zod";
import { todayInTimeZone } from "@/domain/dates";
import type { ErrorCode } from "@/domain/contracts";
import { LlmFailedError, LlmTimeoutError } from "../ai/errors";
import { ServerConfigError, getServerEnv, type ServerEnv } from "../env";
import { createLlmProvider, type LlmProvider } from "../llm";
import { decodeJpegBase64, readJsonBody } from "./body";
import { HttpError, errorResponse } from "./envelope";
import { logRequest, type LogFields } from "./logger";

/** Everything a route handler needs from the outside; production reads the environment lazily per request. */
export interface ApiDeps {
  getEnv(): ServerEnv;
  createProvider(env: ServerEnv): LlmProvider;
  now(): Date;
}

export const defaultDeps: ApiDeps = {
  getEnv: getServerEnv,
  createProvider: (env) => createLlmProvider({ apiKey: env.openrouterApiKey }),
  now: () => new Date(),
};

export interface HandlerOutcome {
  response: Response;
  /** Metadata for the log line; never content (see logger allow-list). */
  log?: LogFields;
}

export function mapError(error: unknown): { status: number; code: ErrorCode } {
  if (error instanceof HttpError)
    return { status: error.status, code: error.code };
  if (error instanceof LlmFailedError)
    return { status: 502, code: "llm_failed" };
  if (error instanceof LlmTimeoutError)
    return { status: 504, code: "llm_timeout" };
  if (error instanceof ServerConfigError)
    return { status: 500, code: "server_misconfigured" };
  // Unexpected internal failure: masked like a configuration problem, never forwarded.
  return { status: 500, code: "server_misconfigured" };
}

/**
 * Request pipeline shared by the three endpoints (ADR-002 section 3): request ID, timer, environment,
 * the endpoint-specific `run`, masked error mapping and exactly one metadata log line.
 */
export async function handle(
  endpoint: string,
  deps: ApiDeps,
  run: (env: ServerEnv) => Promise<HandlerOutcome>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  let status = 500;
  let fields: LogFields = {};
  let response: Response;
  try {
    const outcome = await run(deps.getEnv());
    response = outcome.response;
    status = response.status;
    fields = outcome.log ?? {};
  } catch (error) {
    const mapped = mapError(error);
    status = mapped.status;
    fields = {
      errorCode: mapped.code,
      ...(error instanceof LlmFailedError || error instanceof LlmTimeoutError
        ? { providerMessage: error.message }
        : {}),
    };
    response = errorResponse(mapped.code, mapped.status);
  }
  logRequest({
    ...fields,
    requestId,
    endpoint,
    status,
    durationMs: Math.round(performance.now() - started),
  });
  return response;
}

/**
 * Newest purchase date the server accepts: tomorrow in APP_TIME_ZONE. The browser validates against its own
 * date, so one day of skew is tolerated; the domain treats it as the purchase day (computeFacts).
 */
export function purchaseDateBoundary(env: ServerEnv, now: Date): string {
  const today = todayInTimeZone(env.appTimeZone, now);
  return format(addDays(parseISO(today), 1), "yyyy-MM-dd");
}

/**
 * Pipeline steps 2-5: body size (413), JSON (400), image gate (413 / 415 / 400 base64), schema (400).
 * The image gate runs before schema validation so oversized or non-JPEG images get their specific status.
 */
export async function readValidatedBody<T>(
  request: Request,
  limitBytes: number,
  schema: ZodType<T>,
  options: { image: boolean },
): Promise<T> {
  const raw = await readJsonBody(request, limitBytes);
  if (options.image) {
    const base64 = (raw as { caseImage?: { base64?: unknown } } | null)
      ?.caseImage?.base64;
    if (typeof base64 === "string") decodeJpegBase64(base64);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "invalid_request");
  return parsed.data;
}

export function timeoutSignal(
  request: Request,
  timeoutMs: number,
): AbortSignal {
  return AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
}

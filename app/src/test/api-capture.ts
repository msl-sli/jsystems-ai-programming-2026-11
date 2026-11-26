import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
const REQUIRED_META_FIELDS = [
  "capturedAt",
  "endpoint",
  "requestSummary",
  "packages",
] as const;

/**
 * Own API responses recorded from the real running app (tests/fixtures/api-captures/, plan 7a.3).
 * Frontend tests serve them verbatim to `fetch`; a body is never edited, hand-written or re-chunked.
 */
export const API_CAPTURES_DIR = path.resolve(
  import.meta.dirname,
  "../../tests/fixtures/api-captures",
);

export interface ApiCapture {
  name: string;
  request: { method: string; path: string };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    /** Raw response text (for /api/chat the raw SSE stream). */
    body: string;
  };
  meta: Record<string, unknown>;
}

export function loadApiCapture(
  name: string,
  dir: string = API_CAPTURES_DIR,
): ApiCapture {
  const file = path.join(dir, `${name}.json`);
  const metaFile = path.join(dir, `${name}.meta.json`);
  if (!existsSync(metaFile))
    throw new Error(`API capture ${name} has no .meta.json`);
  const meta = JSON.parse(readFileSync(metaFile, "utf8")) as Record<
    string,
    unknown
  >;
  const missing = REQUIRED_META_FIELDS.filter((f) => meta[f] === undefined);
  if (missing.length > 0)
    throw new Error(`Meta of ${name} lacks: ${missing.join(", ")}`);
  const body = JSON.parse(readFileSync(file, "utf8")) as Omit<
    ApiCapture,
    "name" | "meta"
  >;
  return { name, ...body, meta };
}

/** A fresh Response with the captured status, statusText, headers and body text, untouched. */
export function toResponse(capture: ApiCapture): Response {
  const { status, statusText, headers, body } = capture.response;
  return new Response(body, { status, statusText, headers });
}

/** Parsed JSON body of a captured (non-SSE) response. */
export function captureJson<T = unknown>(name: string): T {
  return JSON.parse(loadApiCapture(name).response.body) as T;
}

export interface CaptureFetch {
  fetch: typeof globalThis.fetch;
  /** Requests received so far: url, method and the parsed JSON body (if any). */
  calls: { url: string; method: string; body: unknown }[];
}

/**
 * A fetch double serving the named captures strictly in order. Throws when the request method/path
 * differs from the capture's or when the captures run out.
 */
export function createCaptureFetch(
  names: string[],
  options: { matchPath?: boolean } = {},
): CaptureFetch {
  const captures = names.map((n) => loadApiCapture(n));
  const calls: CaptureFetch["calls"] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const capture = captures[calls.length];
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method ?? "GET").toUpperCase();
    const raw = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url, method, body: raw ? JSON.parse(raw) : undefined });
    if (!capture) throw new Error(`No capture left for ${method} ${url}`);
    const pathname = new URL(url, "http://localhost").pathname;
    if (
      options.matchPath !== false &&
      (capture.request.method !== method || capture.request.path !== pathname)
    )
      throw new Error(
        `Capture ${capture.name} is ${capture.request.method} ${capture.request.path}, got ${method} ${pathname}`,
      );
    return toResponse(capture);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

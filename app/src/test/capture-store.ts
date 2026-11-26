import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface CaptureMeta {
  capturedAt: string;
  endpoint: string;
  modelId: string;
  provider?: string;
  providerHeaders?: Record<string, string>;
  packages: { ai: string; "@openrouter/ai-sdk-provider": string };
  promptVersion: string;
  requestSummary: string;
  scenario: string;
  /** Replay skips the request body hash check when false. */
  matchBody?: boolean;
}

export interface CaptureFile {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    bodySha256: string;
    bodySummary?: string;
  };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    /** Raw response text; for SSE the raw byte stream decoded as UTF-8 exactly as received. */
    body: string;
    /** Chunk boundaries as received (concatenation equals `body`); only stored when more than one. */
    chunks?: string[];
  };
}

export interface LoadedCapture extends CaptureFile {
  meta: CaptureMeta;
  file: string;
}

export const REQUIRED_META_FIELDS = [
  "capturedAt",
  "endpoint",
  "modelId",
  "packages",
  "promptVersion",
  "requestSummary",
  "scenario",
] as const;

export const REDACTED = "[redacted]";
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "proxy-authorization",
]);

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Lower-cased header map with credentials replaced by "[redacted]". */
export function redactHeaders(
  headers: Headers | Record<string, string> | [string, string][] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    out[key] = SENSITIVE_HEADERS.has(key) ? REDACTED : value;
  });
  return out;
}

/** Method, URL, headers and body hash of a `fetch(input, init)` call, as stored in captures. */
export async function describeRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const request = new Request(input, init);
  const bytes = new Uint8Array(await request.arrayBuffer());
  return {
    method: request.method,
    url: request.url,
    headers: redactHeaders(request.headers),
    bodySha256: sha256Hex(bytes),
  };
}

export function readPackageVersions(
  root: string = process.cwd(),
): CaptureMeta["packages"] {
  const version = (name: string) => {
    const file = path.join(
      root,
      "node_modules",
      ...name.split("/"),
      "package.json",
    );
    return (JSON.parse(readFileSync(file, "utf8")) as { version: string })
      .version;
  };
  return {
    ai: version("ai"),
    "@openrouter/ai-sdk-provider": version("@openrouter/ai-sdk-provider"),
  };
}

export function metaPathFor(captureFile: string): string {
  return captureFile.replace(/\.json$/, ".meta.json");
}

export function loadCapture(file: string): LoadedCapture {
  const metaFile = metaPathFor(file);
  if (!existsSync(metaFile))
    throw new Error(`Capture ${file} has no .meta.json (${metaFile})`);
  const meta = JSON.parse(readFileSync(metaFile, "utf8")) as Record<
    string,
    unknown
  >;
  const missing = REQUIRED_META_FIELDS.filter(
    (field) => meta[field] === undefined,
  );
  if (missing.length > 0)
    throw new Error(
      `Meta ${metaFile} lacks required fields: ${missing.join(", ")}`,
    );
  const body = JSON.parse(readFileSync(file, "utf8")) as CaptureFile;
  return { ...body, meta: meta as unknown as CaptureMeta, file };
}

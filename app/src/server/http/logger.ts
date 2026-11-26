import "server-only";

const ALLOWED_KEYS = [
  "requestId",
  "endpoint",
  "status",
  "durationMs",
  "models",
  "decisionPath",
  "routeRule",
  "mode",
  "certainties",
  "usage",
  "costCredits",
  "errorCode",
  "providerMessage",
] as const;

export type LogFields = Partial<Record<(typeof ALLOWED_KEYS)[number], unknown>>;

const PROVIDER_MESSAGE_MAX = 200;

/** One JSON line with metadata only; every key outside the allow-list is dropped (ADR-002 §6, TAC-08). */
export function logRequest(fields: LogFields): void {
  const entry: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    const value = fields[key];
    if (value === undefined) continue;
    entry[key] =
      key === "providerMessage" && typeof value === "string" ? value.slice(0, PROVIDER_MESSAGE_MAX) : value;
  }
  console.info(JSON.stringify(entry));
}

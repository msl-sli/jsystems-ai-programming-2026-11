/** Per-call LLM metadata for the server log (ADR-002 §3, plan §7a.6). Metadata only: never prompts, answers or images. */
export interface LlmCallTelemetry {
  endpoint: "alpha/decisions" | "chat/completions";
  modelId: string;
  provider: string | null;
  latencyMs: number;
  costCredits: number | null;
  inputTokens?: number;
  outputTokens?: number;
}

export type OnTelemetry = (call: LlmCallTelemetry) => void;

const isCost = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose | undefined =>
  typeof value === "object" && value !== null ? (value as Loose) : undefined;

/**
 * Cost in OpenRouter credits from a usage object, either the raw response form (`cost_details.upstream_inference_cost`,
 * `is_byok`) or the provider-metadata form (`costDetails.upstreamInferenceCost`). With a BYOK key `cost` is 0 and the real
 * cost is the upstream one, so that wins for BYOK (or whenever `cost` is not positive).
 */
export function costFrom(usage: unknown): number | null {
  const u = asObject(usage);
  if (!u) return null;
  const details = asObject(u.costDetails ?? u.cost_details);
  const upstream = details?.upstreamInferenceCost ?? details?.upstream_inference_cost;
  const byok = u.is_byok === true || u.isByok === true;
  const cost = u.cost;
  if (isCost(upstream) && (byok || !(isCost(cost) && cost > 0))) return upstream;
  if (isCost(cost)) return cost;
  return isCost(upstream) ? upstream : null;
}

/** Provider name from provider metadata (`openrouter.provider`) or a raw response body (`provider`). */
export function providerFrom(metadata: unknown, body?: unknown): string | null {
  const fromMeta = asObject(asObject(metadata)?.openrouter)?.provider;
  if (typeof fromMeta === "string" && fromMeta) return fromMeta;
  const fromBody = asObject(body)?.provider;
  return typeof fromBody === "string" && fromBody ? fromBody : null;
}

/** Usage object of the provider metadata (`openrouter.usage`). */
export const metadataUsage = (metadata: unknown): unknown =>
  asObject(asObject(metadata)?.openrouter)?.usage;

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export function buildTelemetry(input: {
  endpoint: LlmCallTelemetry["endpoint"];
  modelId: string;
  latencyMs: number;
  providerMetadata?: unknown;
  /** Raw response body usage, when the provider metadata drops fields (Decisions). */
  rawBody?: unknown;
  inputTokens?: number;
  outputTokens?: number;
}): LlmCallTelemetry {
  const raw = asObject(input.rawBody);
  const cost =
    costFrom(raw?.usage) ?? costFrom(metadataUsage(input.providerMetadata));
  const promptTokens = num(asObject(metadataUsage(input.providerMetadata))?.promptTokens);
  const completionTokens = num(asObject(metadataUsage(input.providerMetadata))?.completionTokens);
  const inputTokens = input.inputTokens ?? promptTokens;
  const outputTokens = input.outputTokens ?? completionTokens;
  return {
    endpoint: input.endpoint,
    modelId: input.modelId,
    provider: providerFrom(input.providerMetadata, raw),
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    costCredits: cost,
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
}

export function totalCost(calls: readonly LlmCallTelemetry[]): number {
  return calls.reduce((sum, c) => sum + (c.costCredits ?? 0), 0);
}

import "server-only";
import {
  createOpenRouter,
  type OpenRouterProvider,
} from "@openrouter/ai-sdk-provider";
import { ServerConfigError } from "./env";

export type LlmProvider = OpenRouterProvider;

const DATA_URL_MEDIA_TYPES = ["image/jpeg", "image/png"] as const;

function unsupported(what: string): never {
  throw new ServerConfigError(
    `Decisions state: unsupported ${what} (only text, json, image/jpeg and image/png data)`,
  );
}

function toBase64(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof Uint8Array) return Buffer.from(data).toString("base64");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("base64");
  return unsupported("file data");
}

function toWireStateItem(item: unknown): unknown {
  if (typeof item !== "object" || item === null) return item;
  const part = item as {
    type?: unknown;
    text?: unknown;
    value?: unknown;
    mediaType?: unknown;
    data?: unknown;
  };
  if (part.type === "text" && typeof part.text === "string") return part.text;
  if (part.type === "json" && "value" in part) return part.value;
  if (part.type === "file") {
    const mediaType = part.mediaType;
    if (!DATA_URL_MEDIA_TYPES.some((allowed) => allowed === mediaType))
      return unsupported(`media type ${String(mediaType)}`);
    const data = part.data;
    let raw: unknown = data;
    if (
      typeof data === "object" &&
      data !== null &&
      !(data instanceof Uint8Array) &&
      !(data instanceof ArrayBuffer)
    ) {
      const wrapped = data as { type?: unknown; data?: unknown };
      if (wrapped.type !== "data")
        return unsupported(
          "file data (remote URLs and references are not accepted)",
        );
      raw = wrapped.data;
    }
    return {
      type: "image_url",
      image_url: { url: `data:${String(mediaType)};base64,${toBase64(raw)}` },
    };
  }
  // Already a wire item (image_url, plain object) or an unknown typed part.
  if (part.type === "image_url") return item;
  if (
    typeof part.type === "string" &&
    ["text", "json", "audio", "video", "reasoning", "tool-call"].includes(
      part.type,
    )
  )
    return unsupported(`part type ${part.type}`);
  return item;
}

/**
 * The provider (`@openrouter/ai-sdk-provider@3.1.0`) forwards AI SDK state parts unchanged, but the Decisions API accepts
 * plain strings, JSON values and `{ type: "image_url", image_url: { url: "data:image/(jpeg|png);base64,..." } }` items.
 * Rewrites only the `state` array of a request body.
 */
export function toDecisionsWireBody(body: unknown): unknown {
  if (typeof body !== "object" || body === null || !("state" in body))
    return body;
  const { state } = body as { state: unknown };
  if (!Array.isArray(state)) return body;
  return { ...body, state: state.map(toWireStateItem) };
}

/** Wraps a fetch so that Decisions requests carry the wire-format state. Everything else is forwarded unchanged. */
export function withDecisionsWireFormat(fetchImpl: typeof fetch): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : undefined;
    const body = init?.body;
    if (url === undefined || typeof body !== "string")
      return fetchImpl(input, init);
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return fetchImpl(input, init);
    }
    if (!pathname.endsWith("/decisions")) return fetchImpl(input, init);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return fetchImpl(input, init);
    }
    return fetchImpl(input, {
      ...init,
      body: JSON.stringify(toDecisionsWireBody(parsed)),
    });
  }) as typeof fetch;
}

export function createLlmProvider(options: {
  apiKey: string;
  fetch?: typeof fetch;
}): LlmProvider {
  return createOpenRouter({
    apiKey: options.apiKey,
    appName: "Hardware Service Decision Copilot",
    fetch: withDecisionsWireFormat(
      options.fetch ?? ((input, init) => fetch(input, init)),
    ),
  });
}

export function getChatModel(provider: LlmProvider, modelId: string) {
  return provider(modelId);
}

export function getDecisionModel(provider: LlmProvider, modelId: string) {
  return provider.evaluationModel(modelId);
}

/** Customer photos and text: never route to providers that may store or train on data. */
export const OPENROUTER_PRIVACY_OPTIONS = {
  openrouter: { provider: { data_collection: "deny" } },
} as const;

/** Structured output: additionally require a provider that supports every request parameter. */
export const OPENROUTER_STRUCTURED_OPTIONS = {
  openrouter: {
    provider: { data_collection: "deny", require_parameters: true },
  },
} as const;

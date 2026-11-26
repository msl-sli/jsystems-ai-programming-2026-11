import "server-only";
import { createOpenRouter, type OpenRouterProvider } from "@openrouter/ai-sdk-provider";

export type LlmProvider = OpenRouterProvider;

export function createLlmProvider(options: { apiKey: string; fetch?: typeof fetch }): LlmProvider {
  return createOpenRouter({
    apiKey: options.apiKey,
    appName: "Hardware Service Decision Copilot",
    ...(options.fetch ? { fetch: options.fetch } : {}),
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
  openrouter: { provider: { data_collection: "deny", require_parameters: true } },
} as const;

import "server-only";
import { describe, expect, it, vi } from "vitest";
import {
  OPENROUTER_PRIVACY_OPTIONS,
  OPENROUTER_STRUCTURED_OPTIONS,
  createLlmProvider,
  getChatModel,
  getDecisionModel,
} from "./llm";

describe("llm provider construction", () => {
  it("builds chat and decision models without any network call", () => {
    const fetchSpy = vi.fn();
    const provider = createLlmProvider({ apiKey: "test-key", fetch: fetchSpy as unknown as typeof fetch });
    const chat = getChatModel(provider, "vendor/chat");
    const decision = getDecisionModel(provider, "vendor/decisions");
    expect(chat.modelId).toBe("vendor/chat");
    expect(decision.modelId).toBe("vendor/decisions");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("builds a provider without an injected fetch", () => {
    expect(getChatModel(createLlmProvider({ apiKey: "k" }), "a/b").modelId).toBe("a/b");
  });

  it("exposes privacy and structured routing options", () => {
    expect(OPENROUTER_PRIVACY_OPTIONS).toEqual({ openrouter: { provider: { data_collection: "deny" } } });
    expect(OPENROUTER_STRUCTURED_OPTIONS).toEqual({
      openrouter: { provider: { data_collection: "deny", require_parameters: true } },
    });
  });
});

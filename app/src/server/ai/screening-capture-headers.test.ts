import "server-only";
import { experimental_decide } from "ai";
import { describe, expect, it } from "vitest";
import { createLlmProvider, getDecisionModel } from "../llm";
import { buildScreeningCall } from "./screening";

// Backs the "invalid key" capture scenario: a call-level Authorization header replaces the provider key,
// and no second Authorization value goes out. The transport rejects; no response is involved.
describe("invalid-key capture override (request shape)", () => {
  it("sends exactly one Authorization header carrying only the override", async () => {
    const seen: Headers[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init).headers);
      throw new DOMException("aborted", "AbortError");
    }) as typeof fetch;
    const provider = createLlmProvider({
      apiKey: "configured-key-not-real",
      fetch: fetchImpl,
    });
    const call = buildScreeningCall(
      {
        caseType: "return",
        category: "laptop",
        productName: "Laptop testowy",
        purchaseDate: "2026-11-01",
        description: "",
      },
      { mediaType: "image/jpeg", base64: "AAAA", width: 300, height: 300 },
    );
    await experimental_decide({
      model: getDecisionModel(provider, "vendor/decisions-test") as never,
      headers: { Authorization: "Bearer invalid-key-for-capture" },
      ...call,
    }).catch(() => undefined);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.get("authorization")).toBe(
      "Bearer invalid-key-for-capture",
    );
  });
});

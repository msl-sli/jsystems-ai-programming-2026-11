import { describe, expect, it } from "vitest";
import { buildTelemetry, costFrom, providerFrom, totalCost } from "./telemetry";

describe("costFrom", () => {
  it("prefers upstream cost for BYOK (raw body form)", () => {
    expect(costFrom({ cost: 0, is_byok: true, cost_details: { upstream_inference_cost: 0.002 } })).toBe(0.002);
  });
  it("prefers upstream cost from provider-metadata form when cost is 0", () => {
    expect(costFrom({ cost: 0, costDetails: { upstreamInferenceCost: 0.003 } })).toBe(0.003);
  });
  it("uses cost for a non-BYOK call", () => {
    expect(costFrom({ cost: 0.01, is_byok: false, cost_details: { upstream_inference_cost: null } })).toBe(0.01);
  });
  it("returns null when nothing is known", () => {
    expect(costFrom({})).toBeNull();
    expect(costFrom(undefined)).toBeNull();
    expect(costFrom({ cost: "x" })).toBeNull();
  });
  it("keeps a genuine zero cost", () => {
    expect(costFrom({ cost: 0 })).toBe(0);
  });
});

describe("providerFrom / totalCost", () => {
  it("reads metadata first, then body", () => {
    expect(providerFrom({ openrouter: { provider: "Azure" } }, { provider: "X" })).toBe("Azure");
    expect(providerFrom(undefined, { provider: "TypeSafe" })).toBe("TypeSafe");
    expect(providerFrom({}, {})).toBeNull();
  });
  it("sums known costs", () => {
    const call = { endpoint: "chat/completions" as const, modelId: "m", provider: null, latencyMs: 1 };
    expect(totalCost([{ ...call, costCredits: 0.5 }, { ...call, costCredits: null }, { ...call, costCredits: 0.25 }])).toBe(0.75);
  });
  it("buildTelemetry rounds latency", () => {
    expect(buildTelemetry({ endpoint: "alpha/decisions", modelId: "m", latencyMs: 12.6 }).latencyMs).toBe(13);
  });
});

import { describe, expect, it } from "vitest";
import { buildEvalReport, percentile, type EvalRun } from "./eval-report";

// Constructed report-builder inputs (not provider responses).
function run(overrides: Partial<EvalRun> = {}): EvalRun {
  return {
    photo: "phone-1.jpg",
    formId: "return-no-description",
    mode: "hybrid",
    routeRule: "R8",
    decisionPath: "template",
    answers: [
      { id: "photo_quality", value: "ok", certainty: 0.95, refused: false },
      { id: "condition", value: 0, certainty: 0.9, refused: false },
    ],
    refusals: [],
    uncertainAreas: [],
    finalCategory: "return_accepted",
    citedRuleIds: ["RET-1"],
    disagreements: [],
    latencyMs: { screening: 1000, decision: 0 },
    costCredits: { screening: 0.01 },
    ...overrides,
  };
}

describe("percentile", () => {
  it("uses nearest rank", () => {
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    expect(percentile(values, 95)).toBe(190);
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([], 95)).toBeUndefined();
  });
});

describe("buildEvalReport", () => {
  const runs: EvalRun[] = [
    run(),
    run({ formId: "complaint-within-30-days", routeRule: "R10", decisionPath: "llm", finalCategory: "manual_review", latencyMs: { screening: 1000, decision: 3000 }, costCredits: { screening: 0.01, llm: 0.04 }, disagreements: [{ question: "condition", note: "ocena rozna" }] }),
    run({ mode: "llm-always", routeRule: "R8", decisionPath: "llm", costCredits: {}, latencyMs: { screening: 1000, decision: 2000 } }),
    run({ mode: "decisions-only", routeRule: undefined, decisionPath: undefined, finalCategory: undefined, citedRuleIds: [], errorCode: "llm_failed", latencyMs: { screening: 500 }, costCredits: {} }),
  ];
  const { json, markdown } = buildEvalReport(runs);

  it("computes escalation rate per mode from the llm-path share", () => {
    expect(json.summary.hybrid).toMatchObject({ runs: 2, escalationRate: 0.5 });
    expect(json.summary["llm-always"].escalationRate).toBe(1);
  });

  it("counts failed runs and leaves them out of the escalation rate", () => {
    expect(json.summary["decisions-only"]).toMatchObject({ runs: 1, failed: 1 });
    expect(json.summary["decisions-only"].escalationRate).toBeUndefined();
    expect(markdown).toContain("Failed runs: 1");
  });

  it("sums cost and shows n/a when no cost is known", () => {
    expect(json.summary.hybrid.totalCostCredits).toBeCloseTo(0.06);
    expect(json.summary["decisions-only"].totalCostCredits).toBeUndefined();
    expect(markdown).toContain("n/a");
  });

  it("computes mean and p95 latency per mode", () => {
    expect(json.summary.hybrid.meanLatencyMs).toBe(2500);
    expect(json.summary.hybrid.p95LatencyMs).toBe(4000);
  });

  it("counts category distribution", () => {
    expect(json.summary.hybrid.categories).toEqual({ return_accepted: 1, manual_review: 1 });
  });

  it("lists disagreements and one row per run", () => {
    expect(json.disagreements).toHaveLength(1);
    expect(markdown).toContain("## Disagreements");
    expect(markdown).toContain("ocena rozna");
    const rows = markdown.split("## Runs")[1]!.split("\n").filter((l) => l.startsWith("| phone-1.jpg |"));
    expect(rows).toHaveLength(runs.length);
  });

  it("handles an empty list and carries no photo-content wording", () => {
    expect(buildEvalReport([]).markdown).toContain("Runs: 0");
    expect(markdown).not.toMatch(/shows|visible|cracked|scratch|pokazuje|widoczn/i);
  });
});

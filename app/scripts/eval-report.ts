/**
 * Pure report builder for the decision-mode evaluation (ADR-003 section 3.7).
 * No I/O. It only aggregates what the services returned; it never interprets or describes photo content.
 */

export const EVAL_MODES = ["hybrid", "decisions-only", "llm-always"] as const;
export type EvalMode = (typeof EVAL_MODES)[number];

export interface EvalAnswer {
  id: string;
  value: string | number | boolean | null;
  certainty: number;
  refused: boolean;
}

export interface EvalRun {
  photo: string;
  formId: string;
  mode: EvalMode;
  /** Undefined when the screening stage failed (no route). */
  routeRule?: string;
  decisionPath?: "template" | "llm";
  answers: EvalAnswer[];
  refusals: string[];
  uncertainAreas: string[];
  finalCategory?: string;
  citedRuleIds: string[];
  /** Questions where the LLM's signalReview verdict is "disagree". */
  disagreements: { question: string; note: string }[];
  latencyMs: { screening?: number; decision?: number };
  /** Credits; undefined = not reported by the provider. */
  costCredits: { screening?: number; llm?: number };
  errorCode?: string;
}

export interface ModeSummary {
  runs: number;
  failed: number;
  /** Share of llm-path runs among runs with a known path; undefined when none. */
  escalationRate?: number;
  categories: Record<string, number>;
  totalCostCredits?: number;
  meanLatencyMs?: number;
  p95LatencyMs?: number;
}

export interface EvalReportJson {
  totalRuns: number;
  failedRuns: number;
  /** Screening is mode-independent and called once per photo x form, so it is counted once here. */
  actualCostCredits?: number;
  summary: Record<EvalMode, ModeSummary>;
  disagreements: (EvalRun["disagreements"][number] & {
    photo: string;
    formId: string;
    mode: EvalMode;
  })[];
  runs: EvalRun[];
}

/** Nearest-rank percentile. */
export function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

function sumKnown(values: (number | undefined)[]): number | undefined {
  const known = values.filter((v): v is number => v !== undefined);
  return known.length === 0 ? undefined : known.reduce((a, b) => a + b, 0);
}

/** End-to-end latency of a run (screening + decision stage); undefined when no stage was timed. */
function totalLatency(run: EvalRun): number | undefined {
  return sumKnown([run.latencyMs.screening, run.latencyMs.decision]);
}

function summarize(runs: EvalRun[]): ModeSummary {
  const withPath = runs.filter((r) => r.decisionPath !== undefined);
  const categories: Record<string, number> = {};
  for (const r of runs) {
    if (r.finalCategory)
      categories[r.finalCategory] = (categories[r.finalCategory] ?? 0) + 1;
  }
  const latencies = runs
    .map(totalLatency)
    .filter((v): v is number => v !== undefined);
  const mean = sumKnown(latencies);
  const rate =
    withPath.length === 0
      ? undefined
      : withPath.filter((r) => r.decisionPath === "llm").length /
        withPath.length;
  return {
    runs: runs.length,
    failed: runs.filter((r) => r.errorCode !== undefined).length,
    ...(rate === undefined ? {} : { escalationRate: rate }),
    categories,
    ...(() => {
      const cost = sumKnown(
        runs.map((r) => sumKnown([r.costCredits.screening, r.costCredits.llm])),
      );
      return cost === undefined ? {} : { totalCostCredits: cost };
    })(),
    ...(mean === undefined
      ? {}
      : {
          meanLatencyMs: mean / latencies.length,
          p95LatencyMs: percentile(latencies, 95) as number,
        }),
  };
}

const cell = (text: string): string =>
  text.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
const fmt = (n: number | undefined, digits = 0): string =>
  n === undefined ? "n/a" : n.toFixed(digits);
const pct = (n: number | undefined): string =>
  n === undefined ? "n/a" : `${(n * 100).toFixed(0)}%`;

export function buildEvalReport(runs: EvalRun[]): {
  json: EvalReportJson;
  markdown: string;
} {
  const summary = Object.fromEntries(
    EVAL_MODES.map((mode) => [
      mode,
      summarize(runs.filter((r) => r.mode === mode)),
    ]),
  ) as Record<EvalMode, ModeSummary>;

  const seenScreening = new Set<string>();
  const screeningCosts: (number | undefined)[] = [];
  for (const r of runs) {
    const key = `${r.photo}|${r.formId}`;
    if (!seenScreening.has(key)) {
      seenScreening.add(key);
      screeningCosts.push(r.costCredits.screening);
    }
  }
  const actualCost = sumKnown([
    ...screeningCosts,
    ...runs.map((r) => r.costCredits.llm),
  ]);

  const disagreements = runs.flatMap((r) =>
    r.disagreements.map((d) => ({
      photo: r.photo,
      formId: r.formId,
      mode: r.mode,
      ...d,
    })),
  );

  const json: EvalReportJson = {
    totalRuns: runs.length,
    failedRuns: runs.filter((r) => r.errorCode !== undefined).length,
    ...(actualCost === undefined ? {} : { actualCostCredits: actualCost }),
    summary,
    disagreements,
    runs,
  };

  const lines: string[] = [
    "# Decision mode evaluation",
    "",
    `Runs: ${json.totalRuns}`,
    `Failed runs: ${json.failedRuns}`,
    `Total cost, screening counted once per photo and form (credits): ${fmt(actualCost, 4)}`,
    "",
    "The report lists what the services returned. It asserts nothing about expected photo content; humans review it.",
    "",
    "## Summary per mode",
    "",
    "Latency is screening plus decision stage. Cost per mode includes the screening cost as if that mode ran alone.",
    "",
    "| Mode | Runs | Failed | Escalation rate (llm path) | Categories | Total cost (credits) | Mean latency (ms) | p95 latency (ms) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...EVAL_MODES.map((mode) => {
      const s = summary[mode];
      const cats =
        Object.entries(s.categories)
          .map(([c, n]) => `${c}: ${n}`)
          .join(", ") || "n/a";
      return `| ${mode} | ${s.runs} | ${s.failed} | ${pct(s.escalationRate)} | ${cell(cats)} | ${fmt(s.totalCostCredits, 4)} | ${fmt(s.meanLatencyMs)} | ${fmt(s.p95LatencyMs)} |`;
    }),
    "",
    "## Disagreements",
    "",
  ];
  if (disagreements.length === 0) lines.push("None.");
  else {
    lines.push(
      "| Photo | Form | Mode | Question | Note |",
      "| --- | --- | --- | --- | --- |",
      ...disagreements.map(
        (d) =>
          `| ${d.photo} | ${d.formId} | ${d.mode} | ${d.question} | ${cell(d.note)} |`,
      ),
    );
  }
  lines.push(
    "",
    "## Runs",
    "",
    "| Photo | Form | Mode | Rule | Path | Answers (certainty) | Refusals | Uncertain | Category | Cited rules | Screening ms | Decision ms | Cost (credits) | Error |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...runs.map((r) => {
      const answers =
        r.answers
          .map(
            (a) =>
              `${a.id}=${a.refused ? "refused" : String(a.value)} (${a.certainty.toFixed(2)})`,
          )
          .join("; ") || "n/a";
      return `| ${r.photo} | ${r.formId} | ${r.mode} | ${r.routeRule ?? "n/a"} | ${r.decisionPath ?? "n/a"} | ${cell(answers)} | ${r.refusals.join(", ") || "-"} | ${r.uncertainAreas.join(", ") || "-"} | ${r.finalCategory ?? "n/a"} | ${r.citedRuleIds.join(", ") || "-"} | ${fmt(r.latencyMs.screening)} | ${fmt(r.latencyMs.decision)} | ${fmt(sumKnown([r.costCredits.screening, r.costCredits.llm]), 4)} | ${r.errorCode ?? "-"} |`;
    }),
    "",
  );
  return { json, markdown: lines.join("\n") };
}

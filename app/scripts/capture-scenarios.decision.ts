import { existsSync } from "node:fs";
import path from "node:path";
import { format, parseISO, subDays } from "date-fns";
import type { CaseInput } from "@/domain/case-schema";
import type { LlmRoute, ScreeningResult } from "@/domain/contracts";
import { todayInTimeZone } from "@/domain/dates";
import { DECISION_PROMPT_VERSIONS, decideWithLlm } from "@/server/ai/decision";
import { screenCase } from "@/server/ai/screening";
import type { ServerEnv } from "@/server/env";
import {
  createLlmProvider,
  getChatModel,
  getDecisionModel,
  type LlmProvider,
} from "@/server/llm";
import { loadPolicies } from "@/server/policies";
import { createReplayFetch } from "@/test/replay-fetch";
import {
  SCREENING_PHOTOS,
  loadScreeningCaseImage,
  screeningCaseInput,
  type CaptureScenario,
} from "./capture-scenarios";

/**
 * T33 scenarios (escalated decision). Register in `capture-scenarios.ts`:
 * `import { decisionScenarios } from "./capture-scenarios.decision"` and spread it into `scenarios`.
 * Every module-level value is lazy: this file and `capture-scenarios.ts` import each other.
 *
 * Replay note: the prompt contains `today` and the purchase date (today minus N days), so the request hash only matches
 * when a replay test passes the capture day (`meta.capturedAt` in APP_TIME_ZONE) as `today`.
 */

const DECISION_TIMEOUT_MS = 50_000;
const SCREENING_DIR = path.resolve(
  import.meta.dirname,
  "../tests/fixtures/llm-captures/screening",
);

type PhotoId = (typeof SCREENING_PHOTOS)[number]["id"];

/**
 * ScreeningResult for the decision call. Preferred source: the real screening capture of the same photo, parsed by
 * the same `screenCase` through a replay fetch (no network). Fallback: one real screening call with a plain provider
 * (not the recording one, so the decision stays `<name>.json`). Run `npm run capture:llm -- screening-<photo>-<type>`
 * first to avoid paying for the live screening twice.
 */
async function screeningFor(
  photoId: PhotoId,
  caseType: "return" | "complaint",
  env: ServerEnv,
): Promise<ScreeningResult> {
  const photo = SCREENING_PHOTOS.find((p) => p.id === photoId);
  if (!photo) throw new Error(`Unknown photo ${photoId}`);
  const file = path.join(
    SCREENING_DIR,
    `screening-${photoId}-${caseType}.json`,
  );
  const replaying = existsSync(file);
  const provider = createLlmProvider({
    apiKey: env.openrouterApiKey,
    ...(replaying
      ? { fetch: createReplayFetch({ captures: [file], delayMs: 0 }) }
      : {}),
  });
  return screenCase(
    screeningCaseInput(photo, caseType),
    await loadScreeningCaseImage(photo),
    {
      decisionModel: getDecisionModel(provider, env.decisionsModel),
      signal: AbortSignal.timeout(25_000),
      threshold: env.confidenceThreshold,
    },
  );
}

function today(env: ServerEnv): string {
  return todayInTimeZone(env.appTimeZone, new Date());
}

function daysAgo(todayIso: string, days: number): string {
  return format(subDays(parseISO(todayIso), days), "yyyy-MM-dd");
}

interface DecisionCase {
  photoId: PhotoId;
  caseInput: (todayIso: string) => CaseInput;
  route: (screening: ScreeningResult) => LlmRoute;
  mode: "hybrid" | "llm-always";
  /** Replaces the loaded policy rule IDs (invalid-answer strategy). */
  policyRuleIds?: { return?: string[]; complaint?: string[] };
}

async function runDecision(
  spec: DecisionCase,
  provider: LlmProvider,
  env: ServerEnv,
) {
  const todayIso = today(env);
  const caseInput = spec.caseInput(todayIso);
  const screening = await screeningFor(spec.photoId, caseInput.caseType, env);
  const photo = SCREENING_PHOTOS.find((p) => p.id === spec.photoId)!;
  const loaded = loadPolicies(path.resolve(env.policiesDir));
  const policies = spec.policyRuleIds
    ? {
        return: {
          ...loaded.return,
          ruleIds: spec.policyRuleIds.return ?? loaded.return.ruleIds,
        },
        complaint: {
          ...loaded.complaint,
          ruleIds: spec.policyRuleIds.complaint ?? loaded.complaint.ruleIds,
        },
      }
    : loaded;
  return decideWithLlm(
    spec.route(screening),
    caseInput,
    await loadScreeningCaseImage(photo),
    screening,
    {
      model: getChatModel(provider, env.llmModel),
      policies,
      today: todayIso,
      mode: spec.mode,
      signal: AbortSignal.timeout(DECISION_TIMEOUT_MS + 5_000),
    },
  );
}

const RETURN_DESCRIPTION = "Zmiana decyzji zakupowej, sprzęt nieużywany.";
const COMPLAINT_DESCRIPTION =
  "Na ekranie laptopa od kilku dni widać poziome linie, urządzenie nie było upuszczane.";

const returnWithDescription: DecisionCase = {
  photoId: "phone-1",
  caseInput: (t) => ({
    caseType: "return",
    category: "smartphone",
    productName: "Smartfon testowy",
    purchaseDate: daysAgo(t, 3),
    description: RETURN_DESCRIPTION,
  }),
  route: (screening) => ({
    kind: "llm",
    rule: "R6",
    uncertainAreas: screening.uncertainAreas,
  }),
  mode: "hybrid",
};

const SUMMARY_COMMON =
  "chat/completions, temperature 0, response_format json_schema (DecisionOutputWireSchema), provider data_collection deny + require_parameters; " +
  "system = decision prompt + guardrails + full policy; user = facts block + form block (description inside customer_data) + screening signals + image/jpeg";

/** Invalid-answer strategy (plan T33): see the comment at the scenario below. */
export const decisionScenarios: CaptureScenario[] = [
  {
    name: "decision-return-description",
    dir: "decision",
    endpoint: "chat/completions",
    modelId: (env) => env.llmModel,
    promptVersion: DECISION_PROMPT_VERSIONS.return,
    requestSummary: `Escalated return (R6), phone-1.jpg, purchase today-3, synthetic description about a purchase decision; ${SUMMARY_COMMON}`,
    run: (provider, env) => runDecision(returnWithDescription, provider, env),
  },
  {
    name: "decision-complaint",
    dir: "decision",
    endpoint: "chat/completions",
    modelId: (env) => env.llmModel,
    promptVersion: DECISION_PROMPT_VERSIONS.complaint,
    requestSummary: `Escalated complaint (R10), laptop-1.png bytes (JPEG), purchase today-10, synthetic description of screen lines; ${SUMMARY_COMMON}`,
    run: (provider, env) =>
      runDecision(
        {
          photoId: "laptop-1",
          caseInput: (t) => ({
            caseType: "complaint",
            category: "laptop",
            productName: "Laptop testowy",
            purchaseDate: daysAgo(t, 10),
            description: COMPLAINT_DESCRIPTION,
          }),
          route: (screening) => ({
            kind: "llm",
            rule: "R10",
            uncertainAreas: screening.uncertainAreas,
          }),
          mode: "hybrid",
        },
        provider,
        env,
      ),
  },
  {
    name: "decision-llm-always-r1",
    dir: "decision",
    endpoint: "chat/completions",
    modelId: (env) => env.llmModel,
    promptVersion: DECISION_PROMPT_VERSIONS.return,
    requestSummary: `llm-always R1 explain-only: fixed category return_rejected, phone-2.jpeg, purchase today-20, no description; ${SUMMARY_COMMON}; system adds the "Fixed category" section`,
    run: (provider, env) =>
      runDecision(
        {
          photoId: "phone-2",
          caseInput: (t) => ({
            caseType: "return",
            category: "smartphone",
            productName: "Smartfon testowy",
            purchaseDate: daysAgo(t, 20),
            description: "",
          }),
          route: (screening) => ({
            kind: "llm",
            rule: "R1",
            uncertainAreas: screening.uncertainAreas,
            fixedCategory: "return_rejected",
          }),
          mode: "llm-always",
        },
        provider,
        env,
      ),
  },
  /**
   * Invalid-answer strategy (corrective retry). The policy TEXT sent to the model is the real one, but the rule-ID set the code
   * validates against is replaced by ["RET-7"] only (injected `policies`, no flag in src/). The model sees RET-1..RET-7 and
   * almost certainly cites e.g. RET-2, so the FIRST real answer fails `resolveOutcome` (unknown_rule_id); the corrective message names
   * the valid IDs, and the SECOND real answer is captured as `decision-return-invalid-first-2`. Files: `<name>.json` is the real
   * invalid first answer, `-2` the real corrected one (or another invalid one, then the run ends with LlmFailedError, which is also
   * a real, replayable path). Replay tests must inject the same restricted rule-ID set. If the model happens to cite RET-7 first, no
   * invalid answer is obtained: report a gap, do not edit the capture.
   */
  {
    name: "decision-return-invalid-first",
    dir: "decision",
    endpoint: "chat/completions",
    modelId: (env) => env.llmModel,
    promptVersion: DECISION_PROMPT_VERSIONS.return,
    requestSummary: `Same case as decision-return-description, but code validates against rule IDs ["RET-7"] only to force a real invalid first answer; ${SUMMARY_COMMON}`,
    run: (provider, env) =>
      runDecision(
        { ...returnWithDescription, policyRuleIds: { return: ["RET-7"] } },
        provider,
        env,
      ),
  },
];

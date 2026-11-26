/**
 * Decision mode evaluation (ADR-003 section 3.7). Manual, not in CI: it makes real OpenRouter requests.
 * Run from app/: `npm run eval:decisions` (tsx --conditions=react-server --env-file=.env.local).
 *
 * Screening runs once per photo x form and is reused by all three modes; the decision stage runs per mode.
 * The script never tells a model what a photo shows and asserts nothing about photo content.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { subDays, format, parseISO } from "date-fns";
import type { CaseCategory, CaseInput } from "@/domain/case-schema";
import {
  SCREENING_QUESTION_IDS,
  type CaseImage,
  type DecisionMode,
  type ScreeningResult,
} from "@/domain/contracts";
import { computeFacts, todayInTimeZone } from "@/domain/dates";
import { routeCase, uncertainAreasOf } from "@/domain/routing";
import { decideWithTemplate } from "@/domain/templates";
import { decideWithLlm } from "@/server/ai/decision";
import { screenCase } from "@/server/ai/screening";
import { loadServerEnv } from "@/server/env";
import {
  createLlmProvider,
  getChatModel,
  getDecisionModel,
} from "@/server/llm";
import { loadPolicies } from "@/server/policies";
import { SCREENING_PHOTOS, loadScreeningCaseImage } from "./capture-scenarios";
import {
  EVAL_MODES,
  buildEvalReport,
  type EvalAnswer,
  type EvalRun,
} from "./eval-report";

const SCREENING_TIMEOUT_MS = 25_000;
const REPORTS_DIR = path.resolve(import.meta.dirname, "../eval-reports");

interface EvalForm {
  id: string;
  caseType: "return" | "complaint";
  /** Days between purchase and today. */
  ageDays: number;
  description: string;
  /** Use a category different from the photo's file-name category. */
  mismatchedCategory?: true;
}

// Neutral synthetic texts: they never describe what a photo shows.
const EVAL_FORMS: readonly EvalForm[] = [
  { id: "return-in-window-no-description", caseType: "return", ageDays: 5, description: "" },
  {
    id: "return-in-window-with-description",
    caseType: "return",
    ageDays: 5,
    description: "Klient chce zwrocic produkt, bo zmienil zdanie co do zakupu.",
  },
  {
    id: "complaint-within-30-days",
    caseType: "complaint",
    ageDays: 10,
    description: "Klient zglasza, ze urzadzenie nie dziala zgodnie z oczekiwaniami.",
  },
  {
    id: "complaint-after-30-days",
    caseType: "complaint",
    ageDays: 100,
    description: "Klient zglasza, ze urzadzenie nie dziala zgodnie z oczekiwaniami.",
  },
  {
    id: "category-mismatch",
    caseType: "return",
    ageDays: 5,
    description: "",
    mismatchedCategory: true,
  },
];

function otherCategory(category: string): CaseCategory {
  return category === "laptop" ? "smartphone" : "laptop";
}

function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string") return code;
  return error instanceof Error ? error.name : "error";
}

function answersOf(screening: ScreeningResult): EvalAnswer[] {
  return SCREENING_QUESTION_IDS.map((id) => {
    const a = screening.answers[id];
    return { id, value: a.value, certainty: a.certainty, refused: a.refused };
  });
}

async function main(): Promise<number> {
  const env = loadServerEnv();
  const provider = createLlmProvider({ apiKey: env.openrouterApiKey });
  const decisionModel = getDecisionModel(provider, env.decisionsModel);
  const chatModel = getChatModel(provider, env.llmModel);
  const policies = loadPolicies(env.policiesDir);
  const today = todayInTimeZone(env.appTimeZone, new Date());

  const total = SCREENING_PHOTOS.length * EVAL_FORMS.length * EVAL_MODES.length;
  console.log(`Evaluating ${total} runs (${SCREENING_PHOTOS.length} photos x ${EVAL_FORMS.length} forms x ${EVAL_MODES.length} modes).`);
  const runs: EvalRun[] = [];

  for (const photo of SCREENING_PHOTOS) {
    let image: CaseImage | undefined;
    let imageError: string | undefined;
    try {
      image = await loadScreeningCaseImage(photo);
    } catch (error) {
      imageError = errorCodeOf(error);
    }

    for (const form of EVAL_FORMS) {
      const caseInput: CaseInput = {
        caseType: form.caseType,
        category: form.mismatchedCategory
          ? otherCategory(photo.category)
          : photo.category,
        productName: photo.product,
        purchaseDate: format(subDays(parseISO(today), form.ageDays), "yyyy-MM-dd"),
        description: form.description,
      };
      const facts = computeFacts(caseInput.purchaseDate, today);
      const base = { photo: photo.file, formId: form.id } as const;

      // Stage 1 (mode-independent, once per photo x form).
      let screening: ScreeningResult | undefined;
      let screeningError = imageError;
      if (image) {
        try {
          screening = await screenCase(caseInput, image, {
            decisionModel,
            signal: AbortSignal.timeout(SCREENING_TIMEOUT_MS),
            threshold: env.confidenceThreshold,
          });
        } catch (error) {
          screeningError = errorCodeOf(error);
        }
      }
      if (!screening || !image) {
        for (const mode of EVAL_MODES)
          runs.push({
            ...base,
            mode,
            answers: [],
            refusals: [],
            uncertainAreas: [],
            citedRuleIds: [],
            disagreements: [],
            latencyMs: {},
            costCredits: {},
            errorCode: screeningError ?? "screening_failed",
          });
        console.log(`${photo.file} / ${form.id}: screening failed (${screeningError})`);
        continue;
      }

      // Stage 2 (per mode).
      for (const mode of EVAL_MODES) {
        const route = routeCase(caseInput, screening, facts, mode as DecisionMode, env.confidenceThreshold);
        const run: EvalRun = {
          ...base,
          mode,
          routeRule: route.rule,
          decisionPath: route.kind,
          answers: answersOf(screening),
          refusals: SCREENING_QUESTION_IDS.filter((id) => screening.answers[id].refused),
          uncertainAreas: uncertainAreasOf(screening, env.confidenceThreshold),
          citedRuleIds: [],
          disagreements: [],
          latencyMs: { screening: screening.latencyMs },
          costCredits: {
            ...(screening.costCredits === undefined ? {} : { screening: screening.costCredits }),
          },
        };
        const started = performance.now();
        try {
          if (route.kind === "template") {
            const { decision } = decideWithTemplate(
              route,
              caseInput,
              screening,
              facts,
              mode,
              policies[caseInput.caseType].ruleIds,
            );
            run.finalCategory = decision.category;
            run.citedRuleIds = decision.citedRuleIds;
          } else {
            const { decision, llmFindings } = await decideWithLlm(
              route,
              caseInput,
              image,
              screening,
              { model: chatModel, policies, today, mode, signal: new AbortController().signal },
            );
            run.finalCategory = decision.category;
            run.citedRuleIds = decision.citedRuleIds;
            // decideWithLlm does not expose usage or cost, so the LLM cost stays "n/a".
            run.disagreements = Object.entries(llmFindings.signalReview).flatMap(
              ([question, review]) =>
                review?.verdict === "disagree"
                  ? [{ question, note: review.note }]
                  : [],
            );
          }
        } catch (error) {
          run.errorCode = errorCodeOf(error);
        }
        run.latencyMs.decision = Math.round(performance.now() - started);
        runs.push(run);
        console.log(
          `${photo.file} / ${form.id} / ${mode}: ${run.routeRule} ${run.decisionPath} -> ${run.finalCategory ?? run.errorCode}`,
        );
      }
    }
  }

  const { json, markdown } = buildEvalReport(runs);
  mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(path.join(REPORTS_DIR, `${stamp}.json`), JSON.stringify(json, null, 2));
  writeFileSync(path.join(REPORTS_DIR, `${stamp}.md`), markdown);
  console.log(`Report: eval-reports/${stamp}.{json,md} (${json.failedRuns} failed runs)`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    // Names only: never print request data or the API key.
    console.error(`Evaluation aborted: ${error instanceof Error ? error.name : "error"}`);
    process.exit(1);
  },
);

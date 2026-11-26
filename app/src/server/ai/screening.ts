import "server-only";
import { Experimental_DecisionRefusalError, experimental_decide } from "ai";
import type { CaseInput } from "@/domain/case-schema";
import {
  CONDITION_LEVELS,
  OBSERVED_CATEGORY_VALUES,
  PHOTO_QUALITY_VALUES,
  SCREENING_QUESTION_IDS,
  type CaseImage,
  type ScreeningAnswers,
  type ScreeningQuestionId,
  type ScreeningResult,
} from "@/domain/contracts";
import { certaintyOf, isConfident } from "@/domain/routing";
import { ServerConfigError } from "../env";
import { OPENROUTER_PRIVACY_OPTIONS, type getDecisionModel } from "../llm";
import { toLlmError } from "./errors";
import { loadPromptFile } from "./prompt-files";

// ------------------------------------------------------------------ questions (from the versioned md file)

type PhotoQuality = (typeof PHOTO_QUALITY_VALUES)[number];
type ObservedCategory = (typeof OBSERVED_CATEGORY_VALUES)[number];

type ScreeningQuestions = {
  photo_quality: {
    type: "choice";
    instructions: string;
    criteria: Record<PhotoQuality, string>;
  };
  observed_category: {
    type: "choice";
    instructions: string;
    criteria: Record<ObservedCategory, string>;
  };
  visible_damage_or_use: {
    type: "boolean";
    instructions: string;
    criteria: { true: string; false: string };
  };
  condition: {
    type: "score";
    instructions: string;
    criteria: readonly [string, string, string, string];
  };
};

const PROMPT_FILE = "screening.questions.md";

interface RawSection {
  type?: string;
  instructions?: string;
  items: [string, string][];
  text: string[];
}

function sameKeys(actual: string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

/** Splits the md body into `## name` sections. Anything malformed fails at module load, never at request time. */
function parseSections(body: string): Map<string, RawSection> {
  const sections = new Map<string, RawSection>();
  let current: RawSection | undefined;
  for (const line of body.split(/\r?\n/)) {
    const heading = /^## (\S+)\s*$/.exec(line);
    if (heading) {
      current = { items: [], text: [] };
      sections.set(heading[1] as string, current);
      continue;
    }
    if (!current) continue;
    const type = /^type: (\S+)\s*$/.exec(line);
    const instructions = /^instructions: (.+)$/.exec(line);
    const item = /^- ([^:]+): (.+)$/.exec(line);
    if (type) current.type = type[1];
    else if (instructions)
      current.instructions = (instructions[1] as string).trim();
    else if (item)
      current.items.push([
        (item[1] as string).trim(),
        (item[2] as string).trim(),
      ]);
    else if (line.trim()) current.text.push(line.trim());
  }
  return sections;
}

export function parseScreeningQuestions(body: string): {
  instruction: string;
  questions: ScreeningQuestions;
} {
  const sections = parseSections(body);
  const fail = (message: string): never => {
    throw new ServerConfigError(`${PROMPT_FILE}: ${message}`);
  };
  const section = (id: string, type: string) => {
    const found = sections.get(id) ?? fail(`missing section "${id}"`);
    if (found.type !== type) fail(`section "${id}" must have type: ${type}`);
    if (!found.instructions) fail(`section "${id}" has no instructions`);
    return { instructions: found.instructions as string, items: found.items };
  };
  const choice = <T extends string>(id: string, expected: readonly T[]) => {
    const { instructions, items } = section(id, "choice");
    if (
      !sameKeys(
        items.map(([key]) => key),
        expected,
      )
    )
      fail(`options of "${id}" must be ${expected.join(", ")}`);
    return {
      type: "choice" as const,
      instructions,
      criteria: Object.fromEntries(items) as Record<T, string>,
    };
  };

  const instruction =
    sections.get("instruction")?.text.join(" ") ||
    fail('missing section "instruction"');

  const damage = section("visible_damage_or_use", "boolean");
  if (
    !sameKeys(
      damage.items.map(([key]) => key),
      ["true", "false"],
    )
  )
    fail('"visible_damage_or_use" needs true and false');
  const condition = section("condition", "score");
  if (
    !sameKeys(
      condition.items.map(([key]) => key),
      CONDITION_LEVELS.map(String),
    )
  )
    fail('"condition" needs levels 0-3');

  const questions: ScreeningQuestions = {
    photo_quality: choice("photo_quality", PHOTO_QUALITY_VALUES),
    observed_category: choice("observed_category", OBSERVED_CATEGORY_VALUES),
    visible_damage_or_use: {
      type: "boolean",
      instructions: damage.instructions,
      criteria: {
        true: damage.items[0]?.[1] as string,
        false: damage.items[1]?.[1] as string,
      },
    },
    condition: {
      type: "score",
      instructions: condition.instructions,
      criteria: condition.items.map(
        ([, text]) => text,
      ) as unknown as ScreeningQuestions["condition"]["criteria"],
    },
  };
  return { instruction, questions };
}

const promptFile = loadPromptFile(PROMPT_FILE);
const parsed = parseScreeningQuestions(promptFile.body);

export const SCREENING_PROMPT_VERSION = promptFile.version;

// ------------------------------------------------------------------ request builder

/** Exactly the arguments (besides `model` and `abortSignal`) passed to `experimental_decide`. */
export function buildScreeningCall(caseInput: CaseInput, caseImage: CaseImage) {
  return {
    // The description is deliberately absent (ADR-003 section 3.2, TAC-003-05).
    state: [
      { type: "text", text: parsed.instruction },
      {
        type: "json",
        value: {
          caseType: caseInput.caseType,
          formCategory: caseInput.category,
          productName: caseInput.productName,
        },
      },
      { type: "file", mediaType: caseImage.mediaType, data: caseImage.base64 },
    ] as const,
    questions: parsed.questions,
    providerOptions: OPENROUTER_PRIVACY_OPTIONS,
    maxRetries: 1,
  };
}

// ------------------------------------------------------------------ service

export interface ScreenCaseOptions {
  decisionModel: ReturnType<typeof getDecisionModel>;
  signal: AbortSignal;
  /** DECISIONS_CONFIDENCE_THRESHOLD. */
  threshold: number;
  /** Monotonic clock in milliseconds; injectable for tests. */
  now?: () => number;
}

type Answer<K extends ScreeningQuestionId> = ScreeningAnswers[K];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function refusedAnswer<T>(): {
  value: T | null;
  probabilities: Record<string, number>;
  certainty: 0;
  confident: false;
  refused: true;
} {
  return {
    value: null,
    probabilities: {},
    certainty: 0,
    confident: false,
    refused: true,
  };
}

function argmax(probabilities: Record<string, number>): string | undefined {
  let best: string | undefined;
  for (const [key, p] of Object.entries(probabilities)) {
    if (best === undefined || p > (probabilities[best] ?? -1)) best = key;
  }
  return best;
}

function providerConfidenceOf(
  metadata: unknown,
  id: string,
): number | undefined {
  const value = (
    metadata as
      | { openrouter?: { answers?: Record<string, { confidence?: unknown }> } }
      | undefined
  )?.openrouter?.answers?.[id]?.confidence;
  return typeof value === "number" && value >= 0 && value <= 1
    ? value
    : undefined;
}

function costOf(metadata: unknown): number | undefined {
  const value = (
    metadata as { openrouter?: { usage?: { cost?: unknown } } } | undefined
  )?.openrouter?.usage?.cost;
  return typeof value === "number" && value >= 0 ? value : undefined;
}

/**
 * `@openrouter/ai-sdk-provider@3.1.0` types `doEvaluate` for the legacy JSON state (`EvaluationModelV4Input`), while
 * `ai@7.0.183` sends typed state parts. At runtime the model forwards `state` unchanged, so only the typings disagree.
 */
type DecisionModelArg = Parameters<typeof experimental_decide>[0]["model"];
function asDecisionModel(
  model: ScreenCaseOptions["decisionModel"],
): DecisionModelArg {
  return model as unknown as DecisionModelArg;
}

export async function screenCase(
  caseInput: CaseInput,
  caseImage: CaseImage,
  options: ScreenCaseOptions,
): Promise<ScreeningResult> {
  const now = options.now ?? (() => performance.now());
  const started = now();
  const call = buildScreeningCall(caseInput, caseImage);
  const model = options.decisionModel.modelId;

  const finish = (
    answers: ScreeningAnswers,
    costCredits?: number,
  ): ScreeningResult => ({
    answers,
    uncertainAreas: SCREENING_QUESTION_IDS.filter(
      (id) => !answers[id].confident,
    ),
    model,
    promptVersion: SCREENING_PROMPT_VERSION,
    ...(costCredits === undefined ? {} : { costCredits }),
    latencyMs: Math.max(0, Math.round(now() - started)),
  });

  let result;
  try {
    result = await experimental_decide({
      model: asDecisionModel(options.decisionModel),
      abortSignal: options.signal,
      ...call,
    });
  } catch (error) {
    if (Experimental_DecisionRefusalError.isInstance(error)) {
      // The error carries only the refused question ids (provider typings: questionIds/provider/modelId), not the answers
      // to the other questions, so all four are marked refused (ADR-003 section 3.2).
      return finish({
        photo_quality: refusedAnswer(),
        observed_category: refusedAnswer(),
        visible_damage_or_use: refusedAnswer(),
        condition: refusedAnswer(),
      });
    }
    throw toLlmError(error, options.signal);
  }

  const metadata = result.providerMetadata;
  const build = <K extends ScreeningQuestionId>(
    id: K,
    value: Answer<K>["value"],
    kind: "choice" | "boolean" | "score",
    probabilities: Record<string, number>,
  ): Answer<K> => {
    const certainty = certaintyOf(kind, probabilities);
    const providerConfidence = providerConfidenceOf(metadata, id);
    return {
      value,
      probabilities,
      certainty,
      confident: isConfident(certainty, options.threshold),
      refused: false,
      ...(providerConfidence === undefined ? {} : { providerConfidence }),
    } as Answer<K>;
  };

  const { answers } = result;
  const yes = round2(answers.visible_damage_or_use.probability);
  const bucketProbabilities = answers.condition.probabilities ?? {};
  const level = Number(
    argmax(bucketProbabilities) ?? Math.round(answers.condition.score),
  );

  return finish(
    {
      photo_quality: build(
        "photo_quality",
        answers.photo_quality.choice,
        "choice",
        answers.photo_quality.probabilities ?? {},
      ),
      observed_category: build(
        "observed_category",
        answers.observed_category.choice,
        "choice",
        answers.observed_category.probabilities ?? {},
      ),
      visible_damage_or_use: build(
        "visible_damage_or_use",
        yes >= 0.5,
        "boolean",
        { true: yes, false: round2(1 - yes) },
      ),
      condition: build(
        "condition",
        level as Answer<"condition">["value"],
        "score",
        bucketProbabilities,
      ),
    },
    costOf(metadata),
  );
}

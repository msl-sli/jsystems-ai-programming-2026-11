import { readFileSync } from "node:fs";
import path from "node:path";
import { experimental_decide } from "ai";
import type { CaseInput } from "@/domain/case-schema";
import type { CaseImage } from "@/domain/contracts";
import type { ServerEnv } from "@/server/env";
import { getDecisionModel, type LlmProvider } from "@/server/llm";
import {
  SCREENING_PROMPT_VERSION,
  buildScreeningCall,
  screenCase,
} from "@/server/ai/screening";

export interface CaptureScenario {
  /** Unique id; also the capture file name (`<name>.json` + `<name>.meta.json`). */
  name: string;
  /** Sub-directory of tests/fixtures/llm-captures. */
  dir: string;
  endpoint: "chat/completions" | "alpha/decisions";
  modelId: (env: ServerEnv) => string;
  promptVersion: string;
  /** No customer free text, no image bytes, no secrets. */
  requestSummary: string;
  /** Runs the real request builders against the provider (its fetch records the exchange). */
  run: (provider: LlmProvider, env: ServerEnv) => Promise<unknown>;
}

// ---------------------------------------------------------------- screening inputs (T32)

const IMAGES_DIR = path.resolve(
  import.meta.dirname,
  "../../assets/example-images",
);
const SCREENING_TIMEOUT_MS = 25_000;

/** Original files; pixel sizes from assets/example-images/README.md (the request never carries them). */
export const SCREENING_PHOTOS = [
  {
    id: "phone-1",
    file: "phone-1.jpg",
    category: "smartphone",
    product: "Smartfon testowy",
    width: 900,
    height: 1200,
  },
  {
    id: "phone-2",
    file: "phone-2.jpeg",
    category: "smartphone",
    product: "Smartfon testowy",
    width: 387,
    height: 516,
  },
  {
    id: "phone-3",
    file: "phone-3.jpeg",
    category: "smartphone",
    product: "Smartfon testowy",
    width: 449,
    height: 445,
  },
  // `.png` name, JPEG bytes (README): the original bytes are valid `image/jpeg`.
  {
    id: "laptop-1",
    file: "laptop-1.png",
    category: "laptop",
    product: "Laptop testowy",
    width: 3024,
    height: 3135,
  },
  // WebP: converted to JPEG with `sharp` (browser compression of T22 is not available in node).
  {
    id: "laptop-2",
    file: "laptop-2.webp",
    category: "laptop",
    product: "Laptop testowy",
    width: 863,
    height: 843,
    convert: true,
  },
] as const;

export const SCREENING_CASE_TYPES = ["return", "complaint"] as const;

export type ScreeningPhoto = (typeof SCREENING_PHOTOS)[number];
export type ScreeningCaseType = (typeof SCREENING_CASE_TYPES)[number];

/** Synthetic form data only. The complaint description is never sent to the screening call. */
export function screeningCaseInput(
  photo: ScreeningPhoto,
  caseType: ScreeningCaseType,
): CaseInput {
  return {
    caseType,
    category: photo.category,
    productName: photo.product,
    purchaseDate: "2026-11-10",
    description:
      caseType === "complaint"
        ? "Syntetyczny opis do testu przechwytywania zapytan."
        : "",
  };
}

/** Image as the capture sends it. Replay tests call this too, so the request body hash matches the recording. */
export async function loadScreeningCaseImage(
  photo: ScreeningPhoto,
): Promise<CaseImage> {
  const original = readFileSync(path.join(IMAGES_DIR, photo.file));
  let bytes: Buffer = original;
  if ("convert" in photo) {
    const { default: sharp } = await import("sharp");
    bytes = await sharp(original).jpeg({ quality: 90 }).toBuffer();
  }
  return {
    mediaType: "image/jpeg",
    base64: bytes.toString("base64"),
    width: photo.width,
    height: photo.height,
  };
}

function screeningSummary(photo: ScreeningPhoto, caseType: string): string {
  const converted =
    "convert" in photo ? " (converted from WebP with sharp)" : "";
  return (
    "Decisions: 4 questions (photo_quality, observed_category, visible_damage_or_use, condition); " +
    `state = instruction text + json {caseType: ${caseType}, formCategory: ${photo.category}, productName: ${photo.product}} + ` +
    `image/jpeg from ${photo.file}${converted}; no description; data_collection deny`
  );
}

const screeningScenarios: CaptureScenario[] = SCREENING_PHOTOS.flatMap(
  (photo) =>
    SCREENING_CASE_TYPES.map((caseType): CaptureScenario => ({
      name: `screening-${photo.id}-${caseType}`,
      dir: "screening",
      endpoint: "alpha/decisions",
      modelId: (env) => env.decisionsModel,
      promptVersion: SCREENING_PROMPT_VERSION,
      requestSummary: screeningSummary(photo, caseType),
      run: async (provider, env) =>
        screenCase(
          screeningCaseInput(photo, caseType),
          await loadScreeningCaseImage(photo),
          {
            decisionModel: getDecisionModel(provider, env.decisionsModel),
            signal: AbortSignal.timeout(SCREENING_TIMEOUT_MS),
            threshold: env.confidenceThreshold,
          },
        ),
    })),
);

const INVALID_KEY = "invalid-key-for-capture";
const UNKNOWN_MODEL = "openai/does-not-exist-hsdc";
const errorPhoto = SCREENING_PHOTOS[0];

/** Real error responses of the Decisions endpoint (401 and 404 expected). Both use the real request builder. */
const screeningErrorScenarios: CaptureScenario[] = [
  {
    name: "screening-error-invalid-key",
    dir: "screening",
    endpoint: "alpha/decisions",
    modelId: (env) => env.decisionsModel,
    promptVersion: SCREENING_PROMPT_VERSION,
    requestSummary: `${screeningSummary(errorPhoto, "return")}; Authorization replaced with the literal "${INVALID_KEY}"`,
    // A call-level header replaces the provider key (a single Authorization header goes out; see screening tests).
    run: async (provider, env) =>
      experimental_decide({
        model: getDecisionModel(provider, env.decisionsModel) as never,
        abortSignal: AbortSignal.timeout(SCREENING_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${INVALID_KEY}` },
        ...buildScreeningCall(
          screeningCaseInput(errorPhoto, "return"),
          await loadScreeningCaseImage(errorPhoto),
        ),
      }),
  },
  {
    name: "screening-error-unknown-model",
    dir: "screening",
    endpoint: "alpha/decisions",
    modelId: () => UNKNOWN_MODEL,
    promptVersion: SCREENING_PROMPT_VERSION,
    requestSummary: `${screeningSummary(errorPhoto, "return")}; model id "${UNKNOWN_MODEL}"`,
    run: async (provider, env) =>
      screenCase(
        screeningCaseInput(errorPhoto, "return"),
        await loadScreeningCaseImage(errorPhoto),
        {
          decisionModel: getDecisionModel(provider, UNKNOWN_MODEL),
          signal: AbortSignal.timeout(SCREENING_TIMEOUT_MS),
          threshold: env.confidenceThreshold,
        },
      ),
  },
];

/** T32 registers the screening scenarios; T33-T34 add theirs. */
export const scenarios: CaptureScenario[] = [
  ...screeningScenarios,
  ...screeningErrorScenarios,
];

import type { CaseInput } from "@/domain/case-schema";
import {
  DecisionResponseSchema,
  ScreeningResponseSchema,
  type CaseImage,
  type DecisionResponse,
  type ScreeningResult,
} from "@/domain/contracts";
import { compressImage } from "@/lib/compress-image";

/** Hard limit from submit for compression plus both requests (ADR-001 section 3, ADR-002 timing budget). */
export const PROCESSING_TIMEOUT_MS = 90_000;

export type ProcessingErrorCode =
  "timeout" | "aborted" | "compress" | "network" | "http" | "invalid_response";

/** Typed failure. Its detail is never shown to the user (the UI shows one AC-17 banner). */
export class ProcessingError extends Error {
  readonly code: ProcessingErrorCode;
  constructor(code: ProcessingErrorCode, options?: { cause?: unknown }) {
    super(`Processing failed: ${code}`, options);
    this.name = "ProcessingError";
    this.code = code;
  }
}

export type ProcessingStageName = "screening" | "decision";

export type RunCaseProcessingParams = {
  caseInput: CaseInput;
  photo: File;
  /** Caller cancellation (unmount). Combined with the 90 s timer. */
  signal: AbortSignal;
  fetch?: typeof globalThis.fetch;
  compress?: (file: File) => Promise<CaseImage>;
  /** Called once screening succeeded, before the decision request. */
  onStage?: (
    stage: "decision",
    partial: { image: CaseImage; screening: ScreeningResult },
  ) => void;
};

export type ProcessingResult = {
  image: CaseImage;
  screening: ScreeningResult;
  response: DecisionResponse;
};

export async function runCaseProcessing({
  caseInput,
  photo,
  signal,
  fetch = globalThis.fetch.bind(globalThis),
  compress = compressImage,
  onStage,
}: RunCaseProcessingParams): Promise<ProcessingResult> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), PROCESSING_TIMEOUT_MS);

  // Rejects as soon as either signal fires, even if the awaited work ignores abort.
  const aborted = new Promise<never>((_, reject) => {
    const fail = () =>
      reject(
        new ProcessingError(timeout.signal.aborted ? "timeout" : "aborted"),
      );
    if (signal.aborted) return fail();
    signal.addEventListener("abort", fail, { once: true });
    timeout.signal.addEventListener("abort", fail, { once: true });
  });
  aborted.catch(() => {});
  const combined = AbortSignal.any([signal, timeout.signal]);
  const guard = <T>(work: Promise<T>) => Promise.race([work, aborted]);

  const post = async <T>(
    url: string,
    body: unknown,
    parse: (json: unknown) => T | null,
  ): Promise<T> => {
    let res: Response;
    try {
      res = await guard(
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: combined,
        }),
      );
    } catch (e) {
      if (e instanceof ProcessingError) throw e;
      throw new ProcessingError("network", { cause: e });
    }
    if (!res.ok) throw new ProcessingError("http");
    let json: unknown;
    try {
      json = await guard(res.json());
    } catch (e) {
      if (e instanceof ProcessingError) throw e;
      throw new ProcessingError("invalid_response", { cause: e });
    }
    const parsed = parse(json);
    if (parsed === null) throw new ProcessingError("invalid_response");
    return parsed;
  };

  try {
    let image: CaseImage;
    try {
      image = await guard(compress(photo));
    } catch (e) {
      if (e instanceof ProcessingError) throw e;
      throw new ProcessingError("compress", { cause: e });
    }
    const { screening } = await post(
      "/api/cases/screening",
      { caseInput, caseImage: image },
      (j) => {
        const r = ScreeningResponseSchema.safeParse(j);
        return r.success ? r.data : null;
      },
    );
    onStage?.("decision", { image, screening });
    const response = await post(
      "/api/cases/decision",
      { caseInput, caseImage: image, screening },
      (j) => {
        const r = DecisionResponseSchema.safeParse(j);
        return r.success ? r.data : null;
      },
    );
    return { image, screening, response };
  } finally {
    clearTimeout(timer);
  }
}

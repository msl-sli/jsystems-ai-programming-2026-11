"use client";

import { useCaseProcessing } from "./use-case-processing";
import type { RunCaseProcessingParams } from "./run-case-processing";

/** Renders nothing; mount it once inside CaseSessionProvider to drive the processing flow. */
export function ProcessingController(
  deps: Pick<RunCaseProcessingParams, "fetch" | "compress">,
) {
  useCaseProcessing(deps);
  return null;
}

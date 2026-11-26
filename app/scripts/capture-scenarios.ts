import type { LlmProvider } from "@/server/llm";
import type { ServerEnv } from "@/server/env";

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

/** T32-T34 register their scenarios here. */
export const scenarios: CaptureScenario[] = [];

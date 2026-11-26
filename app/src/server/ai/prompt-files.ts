import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ServerConfigError } from "../env";

export interface PromptFile {
  /** `YYYY-MM-DD.n` from the first line; logged and recorded in capture metadata (TAC-003-04). */
  version: string;
  /** Everything after the version line. */
  body: string;
}

const VERSION_LINE = /^prompt-version: (\d{4}-\d{2}-\d{2}\.\d+)\r?\n/;

/**
 * Prompt files are read with `fs` relative to the project root (`process.cwd()` = `app/`), like the policy files.
 * `import.meta.dirname` is not usable: Next bundles server code into `.next/server/chunks`, away from the sources.
 * `next dev`, `next start`, Vitest and `tsx` all run from `app/`.
 */
export const DEFAULT_PROMPTS_DIR = path.join("src", "server", "ai", "prompts");

export function parsePromptFile(text: string, label: string): PromptFile {
  const match = VERSION_LINE.exec(text);
  if (!match)
    throw new ServerConfigError(
      `Prompt file ${label} must start with "prompt-version: YYYY-MM-DD.n"`,
    );
  return {
    version: match[1] as string,
    body: text.slice(match[0].length).replace(/^\r?\n+/, ""),
  };
}

export function loadPromptFile(name: string, dir?: string): PromptFile {
  const base = dir ?? path.resolve(process.cwd(), DEFAULT_PROMPTS_DIR);
  let text: string;
  try {
    text = readFileSync(path.join(base, name), "utf8");
  } catch {
    throw new ServerConfigError(`Prompt file unavailable: ${name}`);
  }
  return parsePromptFile(text, name);
}

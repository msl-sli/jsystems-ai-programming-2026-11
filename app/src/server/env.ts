import "server-only";
import path from "node:path";
import { z } from "zod";
import { DecisionModeSchema, type DecisionMode } from "@/domain/contracts";

export class ServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerConfigError";
  }
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const EnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1),
  DECISIONS_MODEL: z.string().min(1),
  DECISION_MODE: DecisionModeSchema.default("hybrid"),
  DECISIONS_CONFIDENCE_THRESHOLD: z.coerce.number().min(0.5).max(0.99).default(0.8),
  POLICIES_DIR: z.string().min(1).default("../docs/policies"),
  APP_TIME_ZONE: z.string().min(1).refine(isValidTimeZone).default("Europe/Warsaw"),
});

export interface ServerEnv {
  openrouterApiKey: string;
  llmModel: string;
  decisionsModel: string;
  decisionMode: DecisionMode;
  confidenceThreshold: number;
  policiesDir: string;
  appTimeZone: string;
}

/** Empty strings from `.env` files count as unset for the optional variables. */
const OPTIONAL = ["DECISION_MODE", "DECISIONS_CONFIDENCE_THRESHOLD", "POLICIES_DIR", "APP_TIME_ZONE"];

export function loadServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const input: Record<string, string | undefined> = {};
  for (const key of Object.keys(EnvSchema.shape)) {
    const value = source[key];
    input[key] = OPTIONAL.includes(key) && value === "" ? undefined : value;
  }
  const parsed = EnvSchema.safeParse(input);
  if (!parsed.success) {
    // Names only: values (API key) must never reach the message.
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new ServerConfigError(`Invalid server configuration: ${names.join(", ")}`);
  }
  const env = parsed.data;
  return {
    openrouterApiKey: env.OPENROUTER_API_KEY,
    llmModel: env.LLM_MODEL,
    decisionsModel: env.DECISIONS_MODEL,
    decisionMode: env.DECISION_MODE,
    confidenceThreshold: env.DECISIONS_CONFIDENCE_THRESHOLD,
    policiesDir: path.resolve(process.cwd(), env.POLICIES_DIR),
    appTimeZone: env.APP_TIME_ZONE,
  };
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= loadServerEnv();
  return cached;
}

export function resetServerEnvForTests(): void {
  cached = undefined;
}

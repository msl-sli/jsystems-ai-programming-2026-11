import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ServerConfigError } from "./env";

export interface PolicyDocument {
  text: string;
  ruleIds: string[];
}

export interface Policies {
  return: PolicyDocument;
  complaint: PolicyDocument;
}

const cache = new Map<string, Policies>();

function readPolicy(dir: string, file: string, prefix: "RET" | "CMP"): PolicyDocument {
  let text: string;
  try {
    text = readFileSync(path.join(dir, file), "utf8");
  } catch {
    throw new ServerConfigError(`Policy file unavailable: ${file}`);
  }
  const pattern = new RegExp(`^## (${prefix}-\\d+)\\b`, "gm");
  const ruleIds = [...text.matchAll(pattern)].map((match) => match[1] as string);
  return { text, ruleIds };
}

export function loadPolicies(dir: string): Policies {
  const hit = cache.get(dir);
  if (hit) return hit;
  const policies: Policies = {
    return: readPolicy(dir, "return-policy.md", "RET"),
    complaint: readPolicy(dir, "complaint-policy.md", "CMP"),
  };
  cache.set(dir, policies);
  return policies;
}

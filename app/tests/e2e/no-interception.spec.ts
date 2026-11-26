import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Plan 7a.1: E2E must hit the real stack. Forbidden tokens are assembled at runtime
// so this file does not match itself; it is also skipped by name.
const FORBIDDEN = [
  ["page", "route"],
  ["context", "route"],
  ["route", "fulfill"],
  ["route", "FromHAR"],
  ["m", "sw"],
].map(([a, b]) => (a === "m" ? "msw" : a === "route" ? `route${b === "fulfill" ? ".fulfill" : "FromHAR"}` : `${a}.route`));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test("no request interception or mocking in tests/e2e", () => {
  const self = path.resolve(__filename);
  const offenders: string[] = [];
  for (const file of walk(path.resolve(__dirname))) {
    if (path.resolve(file) === self) continue;
    if (!/\.(ts|tsx|js|mjs|cjs|json|har)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const token of FORBIDDEN) {
      if (new RegExp(token.replace(".", "\\s*\\.\\s*"), "i").test(text)) {
        offenders.push(`${path.relative(__dirname, file)}: ${token}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});

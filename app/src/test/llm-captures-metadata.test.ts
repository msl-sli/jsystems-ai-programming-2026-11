import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_META_FIELDS } from "./capture-store";

const ROOT = path.resolve(
  import.meta.dirname,
  "../../tests/fixtures/llm-captures",
);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const all = walk(ROOT);
const bodies = all.filter(
  (f) => f.endsWith(".json") && !f.endsWith(".meta.json"),
);

describe("llm-captures fixtures", () => {
  it("has a sibling meta with all required fields for every capture", () => {
    for (const file of bodies) {
      const metaFile = file.replace(/\.json$/, ".meta.json");
      expect(all, `${file} lacks a .meta.json`).toContain(metaFile);
      const meta = JSON.parse(readFileSync(metaFile, "utf8")) as Record<
        string,
        unknown
      >;
      for (const field of REQUIRED_META_FIELDS)
        expect(meta[field], `${metaFile}: ${field}`).toBeDefined();
      const packages = meta.packages as Record<string, unknown>;
      expect(packages.ai).toEqual(expect.any(String));
      expect(packages["@openrouter/ai-sdk-provider"]).toEqual(
        expect.any(String),
      );
    }
  });

  it("has no orphan meta files", () => {
    for (const metaFile of all.filter((f) => f.endsWith(".meta.json"))) {
      expect(all).toContain(metaFile.replace(/\.meta\.json$/, ".json"));
    }
  });

  it("contains no API key and no unredacted authorization value", () => {
    for (const file of all.filter((f) => f.endsWith(".json"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/sk-or-v1-[A-Za-z0-9]+/);
      for (const match of text.matchAll(/"authorization"\s*:\s*"([^"]*)"/gi)) {
        expect(match[1], file).toBe("[redacted]");
      }
    }
  });
});

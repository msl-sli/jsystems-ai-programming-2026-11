import "server-only";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ServerConfigError } from "../env";
import { loadPromptFile, parsePromptFile } from "./prompt-files";

describe("parsePromptFile", () => {
  it("reads the version line and returns the rest as the body", () => {
    const parsed = parsePromptFile(
      "prompt-version: 2026-11-26.3\n\n# Title\ntext\n",
      "x.md",
    );
    expect(parsed.version).toBe("2026-11-26.3");
    expect(parsed.body).toBe("# Title\ntext\n");
  });

  it("rejects a missing or malformed version line", () => {
    expect(() => parsePromptFile("# no version\n", "x.md")).toThrow(
      ServerConfigError,
    );
    expect(() => parsePromptFile("prompt-version: 26-11-26\n", "x.md")).toThrow(
      /x\.md/,
    );
  });
});

describe("loadPromptFile", () => {
  it("loads from an explicit directory", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "prompts-"));
    writeFileSync(
      path.join(dir, "a.md"),
      "prompt-version: 2026-01-01.1\nbody\n",
    );
    expect(loadPromptFile("a.md", dir)).toEqual({
      version: "2026-01-01.1",
      body: "body\n",
    });
  });

  it("throws ServerConfigError for a missing file", () => {
    expect(() => loadPromptFile("missing.md", os.tmpdir())).toThrow(
      ServerConfigError,
    );
  });

  it("resolves the default directory from the project root", () => {
    expect(loadPromptFile("screening.questions.md").version).toMatch(
      /^\d{4}-\d{2}-\d{2}\.\d+$/,
    );
  });
});

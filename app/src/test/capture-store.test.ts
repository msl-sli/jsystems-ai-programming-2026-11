import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadCapture, readPackageVersions, sha256Hex } from "./capture-store";

const dirs: string[] = [];
function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), "capture-store-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("capture-store", () => {
  it("hashes with sha256 hex", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("throws when a capture has no .meta.json", () => {
    const dir = tmp();
    const file = path.join(dir, "x.json");
    writeFileSync(file, "{}");
    expect(() => loadCapture(file)).toThrow(/meta/i);
  });

  it("throws when the meta lacks required fields", () => {
    const dir = tmp();
    const file = path.join(dir, "x.json");
    writeFileSync(file, "{}");
    writeFileSync(
      path.join(dir, "x.meta.json"),
      JSON.stringify({ endpoint: "e" }),
    );
    expect(() => loadCapture(file)).toThrow(/modelId|capturedAt|required/i);
  });

  it("reads installed package versions", () => {
    const versions = readPackageVersions();
    expect(versions.ai).toMatch(/^\d+\.\d+\.\d+/);
    expect(versions["@openrouter/ai-sdk-provider"]).toMatch(/^\d+\.\d+\.\d+/);
  });
});

import "server-only";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ServerConfigError } from "./env";
import { loadPolicies } from "./policies";

const realDir = path.resolve(process.cwd(), "../docs/policies");

describe("loadPolicies", () => {
  it("extracts rule IDs in document order from the real policy files", () => {
    const policies = loadPolicies(realDir);
    expect(policies.return.ruleIds).toEqual(["RET-1", "RET-2", "RET-3", "RET-4", "RET-5", "RET-6", "RET-7"]);
    expect(policies.complaint.ruleIds).toEqual([
      "CMP-1", "CMP-2", "CMP-3", "CMP-4", "CMP-5", "CMP-6", "CMP-7", "CMP-8",
    ]);
    expect(policies.return.text).toContain("## RET-1");
    expect(policies.complaint.text).toContain("## CMP-8");
  });

  it("caches per directory", () => {
    expect(loadPolicies(realDir)).toBe(loadPolicies(realDir));
  });

  it("throws ServerConfigError for a missing directory", () => {
    expect(() => loadPolicies("/nonexistent/policies-dir")).toThrow(ServerConfigError);
  });
});

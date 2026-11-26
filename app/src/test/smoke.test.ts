import "server-only";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("test infrastructure (node)", () => {
  it("loads server-only without throwing", () => {
    expect(true).toBe(true);
  });

  it("resolves the @ alias", () => {
    expect(cn("a", false, "b")).toBe("a b");
  });
});

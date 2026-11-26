import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCaptureFetch, loadApiCapture, toResponse } from "./api-capture";

describe("api-capture helper", () => {
  it("serves the captured status, headers and body verbatim", async () => {
    const capture = loadApiCapture("invalid-key-return-screening");
    const res = toResponse(capture);
    expect(res.status).toBe(502);
    expect(res.statusText).toBe(capture.response.statusText);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.text()).toBe(capture.response.body);
  });

  it("serves captures in order and rejects a mismatching path", async () => {
    const f = createCaptureFetch(["a-return-20d-screening"]);
    await expect(
      f.fetch("/api/cases/decision", { method: "POST", body: "{}" }),
    ).rejects.toThrow(/a-return-20d-screening/);
    const ok = createCaptureFetch(["a-return-20d-screening"]);
    const res = await ok.fetch("/api/cases/screening", {
      method: "POST",
      body: '{"x":1}',
    });
    expect(res.status).toBe(200);
    expect(ok.calls[0]!.body).toEqual({ x: 1 });
    await expect(
      ok.fetch("/api/cases/screening", { method: "POST" }),
    ).rejects.toThrow(/No capture left/);
  });

  it("refuses a capture without a .meta.json", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cap-"));
    try {
      writeFileSync(path.join(dir, "x.json"), "{}");
      expect(() => loadApiCapture("x", dir)).toThrow(/no \.meta\.json/);
      writeFileSync(path.join(dir, "x.meta.json"), "{}");
      expect(() => loadApiCapture("x", dir)).toThrow(/lacks/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { returnCase, image, photoFile } from "@/features/case-session/fixtures";
import {
  captureJson,
  createCaptureFetch,
  loadApiCapture,
  toResponse,
} from "@/test/api-capture";
import { ProcessingError, runCaseProcessing } from "./run-case-processing";

const never = () => new Promise<Response>(() => {});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("runCaseProcessing", () => {
  it("compresses the original file once and posts the screening body", async () => {
    const photo = photoFile();
    const compress = vi.fn().mockResolvedValue(image);
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return never();
    });
    void runCaseProcessing({
      caseInput: returnCase,
      photo,
      signal: new AbortController().signal,
      fetch: fetch as unknown as typeof globalThis.fetch,
      compress,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(compress).toHaveBeenCalledTimes(1);
    expect(compress.mock.calls[0]![0]).toBe(photo);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/cases/screening");
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      caseInput: returnCase,
      caseImage: image,
    });
  });

  it("rejects with a ProcessingError on a network error", async () => {
    const p = runCaseProcessing({
      caseInput: returnCase,
      photo: photoFile(),
      signal: new AbortController().signal,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
      compress: async () => image,
    });
    await expect(p).rejects.toBeInstanceOf(ProcessingError);
  });

  it("rejects with a ProcessingError when compression fails", async () => {
    const p = runCaseProcessing({
      caseInput: returnCase,
      photo: photoFile(),
      signal: new AbortController().signal,
      fetch: never,
      compress: () => Promise.reject(new Error("decode")),
    });
    await expect(p).rejects.toBeInstanceOf(ProcessingError);
  });

  it("aborts after 90 s (AC-17)", async () => {
    const p = runCaseProcessing({
      caseInput: returnCase,
      photo: photoFile(),
      signal: new AbortController().signal,
      fetch: never,
      compress: async () => image,
    });
    const settled = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(89_999);
    let done = false;
    void settled.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settled).toMatchObject({ code: "timeout" });
  });

  it("rejects with code aborted when the caller aborts", async () => {
    const ctrl = new AbortController();
    const p = runCaseProcessing({
      caseInput: returnCase,
      photo: photoFile(),
      signal: ctrl.signal,
      fetch: never,
      compress: async () => image,
    });
    const settled = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);
    ctrl.abort();
    expect(await settled).toMatchObject({ code: "aborted" });
  });

  it("success path: screening then decision, validated captured responses, onStage('decision')", async () => {
    const f = createCaptureFetch([
      "a-return-20d-screening",
      "a-return-20d-decision",
    ]);
    const stages: unknown[] = [];
    const result = await runCaseProcessing({
      caseInput: returnCase,
      photo: photoFile(),
      signal: new AbortController().signal,
      fetch: f.fetch,
      compress: async () => image,
      onStage: (stage, partial) => stages.push([stage, partial.screening]),
    });
    const { screening } = captureJson<{ screening: unknown }>(
      "a-return-20d-screening",
    );
    expect(f.calls.map((c) => [c.method, c.url])).toEqual([
      ["POST", "/api/cases/screening"],
      ["POST", "/api/cases/decision"],
    ]);
    expect(stages).toEqual([["decision", screening]]);
    expect(result.screening).toEqual(screening);
    expect(result.image).toEqual(image);
    // Template route R1 (return after 14 days).
    expect(result.response).toEqual(captureJson("a-return-20d-decision"));
    expect(result.response.decision).toMatchObject({
      category: "return_rejected",
      decisionPath: "template",
      routeRule: "R1",
    });
  });

  it("success path for an llm decision (R3) keeps llmFindings", async () => {
    const f = createCaptureFetch([
      "c-complaint-10d-screening",
      "c-complaint-10d-decision",
    ]);
    const result = await runCaseProcessing({
      caseInput: returnCase,
      photo: photoFile(),
      signal: new AbortController().signal,
      fetch: f.fetch,
      compress: async () => image,
    });
    expect(result.response.decision).toMatchObject({
      decisionPath: "llm",
      routeRule: "R3",
    });
    expect(result.response.llmFindings).toBeTruthy();
  });

  it("decision request body contains the screening from the first response", async () => {
    const f = createCaptureFetch([
      "a-return-20d-screening",
      "a-return-20d-decision",
    ]);
    await runCaseProcessing({
      caseInput: returnCase,
      photo: photoFile(),
      signal: new AbortController().signal,
      fetch: f.fetch,
      compress: async () => image,
    });
    const { screening } = captureJson<{ screening: unknown }>(
      "a-return-20d-screening",
    );
    expect(f.calls[1]!.body).toEqual({
      caseInput: returnCase,
      caseImage: image,
      screening,
    });
  });

  it.each([
    ["real 502 envelope", "invalid-key-return-screening"],
    ["real 413 envelope", "limits-oversize-screening"],
  ])("non-2xx %s rejects with ProcessingError(http)", async (_l, name) => {
    const f = createCaptureFetch([name]);
    const p = runCaseProcessing({
      caseInput: returnCase,
      photo: photoFile(),
      signal: new AbortController().signal,
      fetch: f.fetch,
      compress: async () => image,
    });
    await expect(p).rejects.toMatchObject({
      name: "ProcessingError",
      code: "http",
    });
    expect(f.calls).toHaveLength(1);
  });

  it("a 200 body that is not JSON rejects (real SSE capture served as a screening response)", async () => {
    const sse = loadApiCapture("c-chat-question");
    const p = runCaseProcessing({
      caseInput: returnCase,
      photo: photoFile(),
      signal: new AbortController().signal,
      fetch: async () => toResponse(sse),
      compress: async () => image,
    });
    await expect(p).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("a 200 body violating the schema rejects (real decision capture served as a screening response)", async () => {
    const decision = loadApiCapture("a-return-20d-decision");
    const p = runCaseProcessing({
      caseInput: returnCase,
      photo: photoFile(),
      signal: new AbortController().signal,
      fetch: async () => toResponse(decision),
      compress: async () => image,
    });
    await expect(p).rejects.toMatchObject({ code: "invalid_response" });
  });
});

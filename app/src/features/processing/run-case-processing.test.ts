import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { returnCase, image, photoFile } from "@/features/case-session/fixtures";
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

  it.todo(
    "success path: screening then decision requests, validated responses, onStage('decision') from I4 api-captures",
  );
  it.todo(
    "decision request body contains the screening from the first response from I4 api-captures",
  );
  it.todo(
    "non-2xx 502 and 413 ErrorResponse bodies reject with ProcessingError from I4 api-captures",
  );
  it.todo(
    "invalid JSON or schema-violating 200 body rejects from I4 api-captures",
  );
});

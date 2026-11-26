import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRecordingFetch } from "./recording-fetch";
import { createReplayFetch } from "./replay-fetch";

const SSE_CHUNKS = ["data: 1\n\n", "data: 2\n\n"];
let server: http.Server;
let base = "";
let dir = "";
let postCapture = "";
let sseCapture = "";
let errCapture = "";
let noBodyCapture = "";
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      if (req.url === "/sse") {
        res.writeHead(200, { "content-type": "text/event-stream" });
        let i = 0;
        const timer = setInterval(() => {
          const chunk = SSE_CHUNKS[i++];
          if (chunk === undefined) {
            clearInterval(timer);
            res.end();
          } else res.write(chunk);
        }, 30);
      } else if (req.url === "/err") {
        res.writeHead(404, "Not Found", {
          "content-type": "application/json",
          "x-id": "7",
        });
        res.end('{"error":"missing"}');
      } else {
        res.writeHead(200, { "content-type": "application/json", "x-id": "1" });
        res.end('{"ok":true}');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  dir = mkdtempSync(path.join(tmpdir(), "replay-fetch-"));
  const meta = {
    endpoint: "e",
    modelId: "m",
    promptVersion: "p",
    requestSummary: "s",
    scenario: "sc",
  };
  const record = async (
    name: string,
    url: string,
    body: string,
    extra: Record<string, unknown> = {},
  ) => {
    const rec = createRecordingFetch({
      dir,
      name,
      meta: { ...meta, ...extra },
    });
    await (await rec(`${base}${url}`, { method: "POST", body })).text();
    await rec.flush();
    return path.join(dir, `${name}.json`);
  };
  postCapture = await record("post", "/v1/x", '{"q":1}');
  sseCapture = await record("sse", "/sse", '{"q":2}');
  errCapture = await record("err", "/err", '{"q":3}');
  noBodyCapture = await record("nobody", "/v1/x", '{"q":4}', {
    matchBody: false,
  });
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

const post = (
  replay: typeof fetch,
  url: string,
  body: string,
  init: RequestInit = {},
) => replay(`http://replay.invalid${url}`, { method: "POST", body, ...init });

describe("createReplayFetch", () => {
  it("serves status, headers and body verbatim, in order, without any network", async () => {
    const replay = createReplayFetch({ captures: [postCapture, errCapture] });
    const first = await post(replay, "/v1/x", '{"q":1}');
    expect(first.status).toBe(200);
    expect(first.headers.get("x-id")).toBe("1");
    expect(await first.text()).toBe('{"ok":true}');
    const second = await post(replay, "/err", '{"q":3}');
    expect(second.status).toBe(404);
    expect(second.statusText).toBe("Not Found");
    expect(second.headers.get("x-id")).toBe("7");
    expect(await second.text()).toBe('{"error":"missing"}');
    expect(replay.calls).toBe(2);
    replay.assertAllConsumed();
  });

  it("replays SSE as a stream on the recorded chunk boundaries", async () => {
    const replay = createReplayFetch({ captures: [sseCapture] });
    const res = await post(replay, "/sse", '{"q":2}');
    const seen: string[] = [];
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      seen.push(value);
    }
    expect(seen).toEqual(SSE_CHUNKS);
  });

  it("throws on a different URL path, method or body hash", async () => {
    await expect(
      post(createReplayFetch({ captures: [postCapture] }), "/other", '{"q":1}'),
    ).rejects.toThrow(/URL|path/i);
    await expect(
      createReplayFetch({ captures: [postCapture] })(
        "http://replay.invalid/v1/x",
        { method: "GET" },
      ),
    ).rejects.toThrow(/method/i);
    await expect(
      post(
        createReplayFetch({ captures: [postCapture] }),
        "/v1/x",
        '{"q":999}',
      ),
    ).rejects.toThrow(/body/i);
  });

  it("skips the body check only when the capture says matchBody false", async () => {
    const replay = createReplayFetch({ captures: [noBodyCapture] });
    expect((await post(replay, "/v1/x", "anything")).status).toBe(200);
  });

  it("throws when captures are exhausted and never touches the network", async () => {
    let networkCalls = 0;
    globalThis.fetch = (() => {
      networkCalls++;
      return originalFetch("http://127.0.0.1:1");
    }) as typeof fetch;
    try {
      const replay = createReplayFetch({ captures: [postCapture] });
      await post(replay, "/v1/x", '{"q":1}');
      await expect(post(replay, "/v1/x", '{"q":1}')).rejects.toThrow(
        /exhausted|no more/i,
      );
      expect(networkCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("calls onUnmatched before throwing", async () => {
    const messages: string[] = [];
    const replay = createReplayFetch({
      captures: [postCapture],
      onUnmatched: (m) => messages.push(m),
    });
    await expect(post(replay, "/nope", "{}")).rejects.toThrow();
    expect(messages).toHaveLength(1);
  });

  it("assertAllConsumed fails when captures remain", () => {
    const replay = createReplayFetch({ captures: [postCapture] });
    expect(() => replay.assertAllConsumed()).toThrow(
      /unused|remaining|not consumed/i,
    );
  });

  it("delays the response and honors an abort during the delay", async () => {
    const replay = createReplayFetch({
      captures: [postCapture, postCapture],
      delayMs: 150,
    });
    const started = Date.now();
    await post(replay, "/v1/x", '{"q":1}');
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);

    const controller = new AbortController();
    const pending = post(replay, "/v1/x", '{"q":1}', {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(new Error("timed out")), 20);
    await expect(pending).rejects.toThrow("timed out");
  });

  it("rejects immediately for an already aborted signal", async () => {
    const replay = createReplayFetch({ captures: [postCapture] });
    await expect(
      post(replay, "/v1/x", '{"q":1}', { signal: AbortSignal.abort() }),
    ).rejects.toThrow();
  });

  it("refuses a capture without meta", () => {
    const lonely = path.join(dir, "lonely.json");
    writeFileSync(lonely, "{}");
    expect(() => createReplayFetch({ captures: [lonely] })).toThrow(/meta/i);
  });
});

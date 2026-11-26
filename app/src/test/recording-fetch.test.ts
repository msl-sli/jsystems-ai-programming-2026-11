import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { sha256Hex } from "./capture-store";
import { createRecordingFetch } from "./recording-fetch";

const SSE_CHUNKS = [
  'data: {"a":1}\n\n',
  'data: {"b":"zażółć"}\n\n',
  "data: [DONE]\n\n",
];
let server: http.Server;
let base = "";
const dirs: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (req.url === "/sse") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "x-openrouter-provider": "Acme",
        });
        let i = 0;
        const timer = setInterval(() => {
          const chunk = SSE_CHUNKS[i++];
          if (chunk === undefined) {
            clearInterval(timer);
            res.end();
          } else res.write(chunk);
        }, 30);
      } else if (req.url === "/err") {
        res.writeHead(401, "Nope", {
          "content-type": "application/json",
          "set-cookie": "a=b",
        });
        res.end('{"error":{"message":"bad key"}}');
      } else {
        res.writeHead(200, {
          "content-type": "application/json",
          "x-test": "1",
        });
        res.end(
          JSON.stringify({ echoed: Buffer.concat(chunks).toString("utf8") }),
        );
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function setup(name = "cap") {
  const dir = mkdtempSync(path.join(tmpdir(), "recording-fetch-"));
  dirs.push(dir);
  const rec = createRecordingFetch({
    dir,
    name,
    meta: {
      endpoint: "chat/completions",
      modelId: "test/model",
      promptVersion: "p1",
      requestSummary: "unit test",
      scenario: "unit",
    },
  });
  const read = (file: string) =>
    JSON.parse(readFileSync(path.join(dir, file), "utf8"));
  return { dir, rec, read };
}

describe("createRecordingFetch", () => {
  it("passes the request through, returns the body untouched and stores a redacted capture", async () => {
    const { rec, read } = setup();
    const body = JSON.stringify({ hello: "world" });
    const res = await rec(`${base}/echo?x=1`, {
      method: "POST",
      headers: {
        authorization: "Bearer sk-or-v1-abc",
        Cookie: "s=1",
        "X-Api-Key": "k",
        "content-type": "application/json",
      },
      body,
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ echoed: body });
    await rec.flush();

    const capture = read("cap.json");
    expect(capture.request.method).toBe("POST");
    expect(capture.request.url).toBe(`${base}/echo?x=1`);
    expect(capture.request.headers.authorization).toBe("[redacted]");
    expect(capture.request.headers.cookie).toBe("[redacted]");
    expect(capture.request.headers["x-api-key"]).toBe("[redacted]");
    expect(capture.request.headers["content-type"]).toBe("application/json");
    expect(capture.request.bodySha256).toBe(sha256Hex(body));
    expect(JSON.stringify(capture)).not.toContain("sk-or-v1");
    expect(capture.request.body).toBeUndefined();
    expect(capture.response.status).toBe(200);
    expect(capture.response.headers["x-test"]).toBe("1");
    expect(capture.response.body).toBe(text);

    const meta = read("cap.meta.json");
    expect(meta.endpoint).toBe("chat/completions");
    expect(meta.modelId).toBe("test/model");
    expect(new Date(meta.capturedAt).toISOString()).toBe(meta.capturedAt);
    expect(meta.packages.ai).toMatch(/^\d/);
    expect(meta.packages["@openrouter/ai-sdk-provider"]).toMatch(/^\d/);
  });

  it("records error responses verbatim (status text and body)", async () => {
    const { rec, read } = setup("err");
    const res = await rec(`${base}/err`, { method: "GET" });
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('{"error":{"message":"bad key"}}');
    await rec.flush();
    const capture = read("err.json");
    expect(capture.response.status).toBe(401);
    expect(capture.response.statusText).toBe("Nope");
    expect(capture.response.body).toBe('{"error":{"message":"bad key"}}');
  });

  it("tees SSE chunk for chunk and stores the raw byte stream", async () => {
    const { rec, read } = setup("sse");
    const res = await rec(`${base}/sse`, { method: "POST", body: "{}" });
    const seen: string[] = [];
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      seen.push(value);
    }
    expect(seen.join("")).toBe(SSE_CHUNKS.join(""));
    await rec.flush();
    const capture = read("sse.json");
    expect(capture.response.body).toBe(SSE_CHUNKS.join(""));
    expect(capture.response.chunks).toEqual(seen);
    expect(read("sse.meta.json").providerHeaders["x-openrouter-provider"]).toBe(
      "Acme",
    );
  });

  it("uses a numbered file name for a second request", async () => {
    const { rec, dir } = setup("multi");
    await (await rec(`${base}/echo`, { method: "POST", body: "1" })).text();
    await (await rec(`${base}/echo`, { method: "POST", body: "2" })).text();
    await rec.flush();
    expect(rec.files.map((f) => path.relative(dir, f))).toEqual([
      "multi.json",
      "multi-2.json",
    ]);
  });
});

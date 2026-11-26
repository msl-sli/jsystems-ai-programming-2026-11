import "server-only";
import { describe, expect, it } from "vitest";
import { HttpError } from "./envelope";
import { decodeJpegBase64, readJsonBody } from "./body";

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", body, headers });

async function rejection(promise: Promise<unknown> | (() => unknown)) {
  try {
    await (typeof promise === "function" ? promise() : promise);
  } catch (error) {
    return error as HttpError;
  }
  return undefined;
}

describe("readJsonBody", () => {
  it("parses valid JSON within the limit", async () => {
    expect(await readJsonBody(post('{"a":1}'), 100)).toEqual({ a: 1 });
  });

  it("rejects by Content-Length with 413", async () => {
    const error = await rejection(readJsonBody(post("{}", { "content-length": "5000" }), 100));
    expect(error).toBeInstanceOf(HttpError);
    expect(error?.status).toBe(413);
    expect(error?.code).toBe("payload_too_large");
  });

  it("rejects by actual bytes read when Content-Length lies", async () => {
    const big = JSON.stringify({ a: "x".repeat(500) });
    const error = await rejection(readJsonBody(post(big, { "content-length": "10" }), 100));
    expect(error?.status).toBe(413);
  });

  it("stops reading a stream once the limit is exceeded", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(60));
        if (pulled > 50) controller.close();
      },
    });
    const request = new Request("http://localhost/x", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    const error = await rejection(readJsonBody(request, 100));
    expect(error?.status).toBe(413);
    expect(pulled).toBeLessThan(10);
  });

  it("returns 400 on invalid JSON", async () => {
    const error = await rejection(readJsonBody(post("{nope"), 100));
    expect(error?.status).toBe(400);
    expect(error?.code).toBe("invalid_request");
  });

  it("returns 400 on empty body", async () => {
    expect((await rejection(readJsonBody(post(""), 100)))?.status).toBe(400);
  });
});

const toB64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");

describe("decodeJpegBase64", () => {
  it("decodes JPEG bytes", () => {
    const bytes = decodeJpegBase64(toB64([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    expect(Array.from(bytes)).toEqual([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  });

  it.each(["", "not base64!!", "abc$def", "QUJD=QUJD"])("rejects invalid base64 %j with 400", (input) => {
    const error = (() => {
      try {
        decodeJpegBase64(input);
      } catch (e) {
        return e as HttpError;
      }
    })();
    expect(error?.status).toBe(400);
    expect(error?.code).toBe("invalid_request");
  });

  it("rejects oversize images with 413", () => {
    const b64 = toB64([0xff, 0xd8, 0xff, ...new Array(100).fill(0)]);
    try {
      decodeJpegBase64(b64, 50);
      expect.unreachable();
    } catch (e) {
      expect((e as HttpError).status).toBe(413);
      expect((e as HttpError).code).toBe("payload_too_large");
    }
  });

  it("accepts exactly the limit", () => {
    expect(decodeJpegBase64(toB64([0xff, 0xd8, 0xff, 0]), 4).length).toBe(4);
  });

  it("rejects non-JPEG magic bytes with 415", () => {
    try {
      decodeJpegBase64(toB64([0x89, 0x50, 0x4e, 0x47, 1, 2]));
      expect.unreachable();
    } catch (e) {
      expect((e as HttpError).status).toBe(415);
      expect((e as HttpError).code).toBe("unsupported_image");
    }
  });

  it("rejects images shorter than the magic bytes with 415", () => {
    try {
      decodeJpegBase64(toB64([0xff, 0xd8]));
      expect.unreachable();
    } catch (e) {
      expect((e as HttpError).status).toBe(415);
    }
  });
});

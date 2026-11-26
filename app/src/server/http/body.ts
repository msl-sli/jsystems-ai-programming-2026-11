import "server-only";
import { HttpError } from "./envelope";

export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

const tooLarge = () => new HttpError(413, "payload_too_large");
const invalid = () => new HttpError(400, "invalid_request");

/** Reads and parses a JSON body, enforcing the byte limit before parsing (Content-Length and streamed count). */
export async function readJsonBody(request: Request, limitBytes: number): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > limitBytes) throw tooLarge();
  }
  if (!request.body) throw invalid();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limitBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalid();
  }
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Decodes a base64 JPEG: 400 invalid base64, 413 above maxBytes, 415 without JPEG magic bytes. */
export function decodeJpegBase64(base64: string, maxBytes: number = MAX_IMAGE_BYTES): Uint8Array {
  if (base64.length === 0 || !BASE64.test(base64)) throw invalid();
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  if (bytes.length > maxBytes) throw tooLarge();
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new HttpError(415, "unsupported_image");
  }
  return bytes;
}

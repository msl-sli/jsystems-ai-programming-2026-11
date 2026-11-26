import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectImageType,
  MAX_PHOTO_BYTES,
  PHOTO_MESSAGES,
  validatePhoto,
} from "./file-signature";

const imagesDir = resolve(
  import.meta.dirname,
  "../../../assets/example-images",
);
const load = (name: string) =>
  new Uint8Array(readFileSync(resolve(imagesDir, name)));
const ascii = (text: string) =>
  new Uint8Array([...text].map((c) => c.charCodeAt(0)));

describe("detectImageType (real example files)", () => {
  it("detects JPEG bytes in laptop-1.png regardless of the extension", () => {
    expect(detectImageType(load("laptop-1.png"))).toBe("jpeg");
  });
  it("detects WEBP", () => {
    expect(detectImageType(load("laptop-2.webp"))).toBe("webp");
  });
  it("detects JPEG in phone-1.jpg", () => {
    expect(detectImageType(load("phone-1.jpg"))).toBe("jpeg");
  });
});

describe("detectImageType (synthetic signatures)", () => {
  it("detects PNG", () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
    ]);
    expect(detectImageType(png)).toBe("png");
  });
  it.each([
    ["GIF", ascii("GIF89a....")],
    ["plain text", ascii("hello world, not an image")],
    ["PDF header", ascii("%PDF-1.7\n")],
    ["empty buffer", new Uint8Array(0)],
    ["truncated RIFF without WEBP", ascii("RIFF\0\0\0\0WAVE")],
    ["RIFF shorter than 12 bytes", ascii("RIFF\0\0\0\0WEB")],
    ["truncated PNG signature", new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
  ])("returns null for %s", (_name, bytes) => {
    expect(detectImageType(bytes)).toBeNull();
  });
});

describe("validatePhoto", () => {
  const jpegHead = load("phone-1.jpg").slice(0, 32);

  it("rejects a missing file", () => {
    expect(validatePhoto(null)).toEqual({
      ok: false,
      message: "Dodaj zdjęcie sprzętu.",
    });
  });
  it("accepts the real JPEG named .png", () => {
    const bytes = load("laptop-1.png");
    expect(
      validatePhoto({ size: bytes.length, headBytes: bytes.slice(0, 32) }),
    ).toEqual({
      ok: true,
      type: "jpeg",
    });
  });
  it("accepts exactly 10 MiB", () => {
    expect(
      validatePhoto({ size: MAX_PHOTO_BYTES, headBytes: jpegHead }),
    ).toEqual({
      ok: true,
      type: "jpeg",
    });
  });
  it("rejects 10 MiB + 1", () => {
    expect(
      validatePhoto({ size: MAX_PHOTO_BYTES + 1, headBytes: jpegHead }),
    ).toEqual({
      ok: false,
      message: "Zdjęcie przekracza limit 10 MB.",
    });
  });
  it("checks size before signature", () => {
    expect(
      validatePhoto({ size: MAX_PHOTO_BYTES + 1, headBytes: ascii("GIF89a") }),
    ).toEqual({ ok: false, message: PHOTO_MESSAGES.tooLarge });
  });
  it("rejects an unsupported format", () => {
    expect(validatePhoto({ size: 10, headBytes: ascii("GIF89a") })).toEqual({
      ok: false,
      message: "Dozwolone formaty: JPG, PNG, WEBP.",
    });
  });
  it("has the 10 MiB limit", () => {
    expect(MAX_PHOTO_BYTES).toBe(10485760);
  });
});

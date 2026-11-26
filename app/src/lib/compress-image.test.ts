// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageDimensionsError, compressImage } from "./compress-image";

/**
 * The canvas and createImageBitmap are browser APIs (not endpoints), so jsdom gets a stand-in:
 * encoded size is derived from the requested JPEG quality. Real compression is proven in live E2E.
 */
function stubBrowser(source: { width: number; height: number }) {
  const close = vi.fn();
  const createImageBitmapMock = vi.fn(async () => ({ ...source, close }));
  vi.stubGlobal("createImageBitmap", createImageBitmapMock);

  const drawImage = vi.fn();
  const qualities: number[] = [];
  const canvases: HTMLCanvasElement[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      canvases.push(this);
      return { drawImage } as unknown as CanvasRenderingContext2D;
    } as never,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(((
    callback: BlobCallback,
    type?: string,
    quality?: number,
  ) => {
    qualities.push(quality ?? -1);
    const bytes = new Uint8Array(Math.round((quality ?? 0) * 1000)).fill(65); // "A"
    callback(new Blob([bytes], { type }));
  }) as never);

  return { close, createImageBitmapMock, drawImage, qualities, canvases };
}

const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", {
  type: "image/jpeg",
});

describe("compressImage", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("scales the long edge to 1568 px preserving the aspect ratio and decodes with EXIF orientation", async () => {
    const stub = stubBrowser({ width: 3024, height: 3135 });

    const result = await compressImage(file, { maxBytes: 10_000 });

    expect(stub.createImageBitmapMock).toHaveBeenCalledWith(file, {
      imageOrientation: "from-image",
    });
    expect(result.height).toBe(1568);
    expect(result.width).toBe(Math.round((3024 * 1568) / 3135));
    expect(stub.canvases[0]?.width).toBe(result.width);
    expect(stub.canvases[0]?.height).toBe(result.height);
    expect(stub.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      result.width,
      result.height,
    );
    expect(result.mediaType).toBe("image/jpeg");
    expect(stub.close).toHaveBeenCalled();
  });

  it("leaves an image that already satisfies the Jev limits untouched", async () => {
    stubBrowser({ width: 800, height: 600 });
    const result = await compressImage(file, { maxBytes: 10_000 });
    expect([result.width, result.height]).toEqual([800, 600]);
  });

  it.each([
    [100, 100, 280, 280], // 78,400 px minimum is the binding limit
    [200, 1000, 256, 1280], // 256 px minimum edge is the binding limit
    [5000, 4000, 1568, 1254],
    [1568, 1568, 1568, 1568],
  ])(
    "maps %i x %i to %i x %i (edges 256..1568, at least 78,400 px)",
    async (w, h, ew, eh) => {
      stubBrowser({ width: w, height: h });
      const result = await compressImage(file, { maxBytes: 10_000 });
      expect([result.width, result.height]).toEqual([ew, eh]);
      expect(Math.min(result.width, result.height)).toBeGreaterThanOrEqual(256);
      expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1568);
      expect(result.width * result.height).toBeGreaterThanOrEqual(78_400);
    },
  );

  it.each([
    [100, 2000],
    [4000, 100],
  ])(
    "throws ImageDimensionsError for the impossible aspect ratio %i x %i",
    async (w, h) => {
      const stub = stubBrowser({ width: w, height: h });
      await expect(
        compressImage(file, { maxBytes: 10_000 }),
      ).rejects.toBeInstanceOf(ImageDimensionsError);
      expect(stub.canvases).toHaveLength(0);
      expect(stub.close).toHaveBeenCalled();
    },
  );

  it("keeps the 1280 px fallback within the minimums", async () => {
    const stub = stubBrowser({ width: 2000, height: 500 });
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      callback(new Blob([new Uint8Array(this.width > 1300 ? 5000 : 100)]));
    } as never);
    const result = await compressImage(file, { maxBytes: 1000 });
    expect([result.width, result.height]).toEqual([1280, 320]);
    expect(stub.canvases.map((c) => c.width)).toEqual([1568, 1280]);
  });

  it("does not use a fallback that would break the minimum edge", async () => {
    const stub = stubBrowser({ width: 2000, height: 380 }); // 1280 px would give 243 px height
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(function (
      callback: BlobCallback,
    ) {
      callback(new Blob([new Uint8Array(5000)]));
    } as never);
    await expect(compressImage(file, { maxBytes: 1000 })).rejects.toThrow(
      /too large/i,
    );
    expect(stub.canvases.every((c) => c.height >= 256)).toBe(true);
  });

  it("honours a custom maxEdge for landscape images", async () => {
    stubBrowser({ width: 4000, height: 2000 });
    const result = await compressImage(file, {
      maxEdge: 1000,
      maxBytes: 10_000,
    });
    expect([result.width, result.height]).toEqual([1000, 500]);
  });

  it("steps JPEG quality down from 0.85 until the result fits maxBytes and returns its base64", async () => {
    const stub = stubBrowser({ width: 2000, height: 1000 });

    const result = await compressImage(file, { maxBytes: 700 });

    expect(stub.qualities).toEqual([0.85, 0.8, 0.75, 0.7]);
    expect(result.base64).toBe(Buffer.from("A".repeat(700)).toString("base64"));
  });

  it("encodes once at 0.85 when the first attempt already fits", async () => {
    const stub = stubBrowser({ width: 2000, height: 1000 });
    await compressImage(file, { maxBytes: 5_000 });
    expect(stub.qualities).toEqual([0.85]);
  });

  it("rejects when the image cannot be decoded", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("decode")),
    );
    await expect(compressImage(file)).rejects.toThrow("decode");
  });

  it("rejects when the result stays above maxBytes even at the lowest quality", async () => {
    stubBrowser({ width: 2000, height: 1000 });
    await expect(compressImage(file, { maxBytes: 100 })).rejects.toThrow(
      /too large/i,
    );
  });
});

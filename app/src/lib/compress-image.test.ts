// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compressImage } from "./compress-image";

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

  it("never upscales a small image", async () => {
    stubBrowser({ width: 800, height: 600 });
    const result = await compressImage(file, { maxBytes: 10_000 });
    expect([result.width, result.height]).toEqual([800, 600]);
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

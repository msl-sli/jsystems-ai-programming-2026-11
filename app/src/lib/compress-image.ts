import {
  IMAGE_MAX_EDGE,
  IMAGE_MIN_EDGE,
  IMAGE_MIN_PIXELS,
} from "@/domain/contracts";

/** The photo cannot be scaled into the Jev limits (for example an extreme panorama). */
export class ImageDimensionsError extends Error {
  constructor(width: number, height: number) {
    super(
      `Image ${width}x${height} cannot be scaled to ${IMAGE_MIN_EDGE}-${IMAGE_MAX_EDGE} px edges and ${IMAGE_MIN_PIXELS} px`,
    );
    this.name = "ImageDimensionsError";
  }
}

export type CompressedImage = {
  mediaType: "image/jpeg";
  base64: string;
  width: number;
  height: number;
};

export type CompressImageOptions = {
  /** Longest allowed edge in pixels. Images are upscaled only as far as the Jev minimums (256 px edge, 78,400 px) require. */
  maxEdge?: number;
  /** Upper bound for the encoded JPEG. */
  maxBytes?: number;
};

const DEFAULT_MAX_EDGE = IMAGE_MAX_EDGE;
const DEFAULT_MAX_BYTES = 1.5 * 1024 * 1024;
const FALLBACK_EDGE = 1280;
/** Quality steps tried in order; the first result within maxBytes wins. */
const QUALITY_STEPS = [0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5];

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("JPEG encoding failed")),
      "image/jpeg",
      quality,
    );
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Reading the image failed"));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

const satisfiesLimits = (width: number, height: number, maxEdge: number) =>
  Math.min(width, height) >= IMAGE_MIN_EDGE &&
  Math.max(width, height) <= maxEdge &&
  width * height >= IMAGE_MIN_PIXELS;

/**
 * Smallest change of size that keeps the long edge <= maxEdge, the short edge >= 256 and the area >= 78,400 px
 * (no change when the image already complies). Undefined when no such size exists.
 */
function planSize(width: number, height: number, maxEdge: number) {
  const lowest = Math.max(
    IMAGE_MIN_EDGE / Math.min(width, height),
    Math.sqrt(IMAGE_MIN_PIXELS / (width * height)),
  );
  const highest = maxEdge / Math.max(width, height);
  const scale = Math.min(Math.max(1, lowest), highest);
  for (const round of [Math.round, Math.ceil]) {
    const candidate = {
      width: round(width * scale),
      height: round(height * scale),
    };
    if (satisfiesLimits(candidate.width, candidate.height, maxEdge))
      return candidate;
  }
  return undefined;
}

/**
 * Decodes (applying EXIF orientation), downsizes and re-encodes a photo as JPEG.
 * Rejects when the image cannot be decoded, cannot be scaled into the Jev limits (`ImageDimensionsError`) or cannot be
 * brought within `maxBytes`.
 */
export async function compressImage(
  file: File,
  {
    maxEdge = DEFAULT_MAX_EDGE,
    maxBytes = DEFAULT_MAX_BYTES,
  }: CompressImageOptions = {},
): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    if (!planSize(bitmap.width, bitmap.height, maxEdge))
      throw new ImageDimensionsError(bitmap.width, bitmap.height);
    const edges = [maxEdge];
    if (FALLBACK_EDGE < maxEdge) edges.push(FALLBACK_EDGE);

    for (const edge of edges) {
      const size = planSize(bitmap.width, bitmap.height, edge);
      if (!size) continue;
      const { width, height } = size;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D context is not available");
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, quality);
        if (blob.size <= maxBytes) {
          return {
            mediaType: "image/jpeg",
            base64: await blobToBase64(blob),
            width,
            height,
          };
        }
      }
    }
    throw new Error("Image is too large after compression");
  } finally {
    bitmap.close?.();
  }
}

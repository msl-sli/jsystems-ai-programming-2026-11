export type CompressedImage = {
  mediaType: "image/jpeg";
  base64: string;
  width: number;
  height: number;
};

export type CompressImageOptions = {
  /** Longest allowed edge in pixels. Images are never upscaled. */
  maxEdge?: number;
  /** Upper bound for the encoded JPEG. */
  maxBytes?: number;
};

const DEFAULT_MAX_EDGE = 1568;
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

function fitWithin(width: number, height: number, edge: number) {
  const scale = Math.min(1, edge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Decodes (applying EXIF orientation), downsizes and re-encodes a photo as JPEG.
 * Rejects when the image cannot be decoded or cannot be brought within `maxBytes`.
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
    const edges = [maxEdge];
    if (FALLBACK_EDGE < maxEdge) edges.push(FALLBACK_EDGE);

    for (const edge of edges) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, edge);
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

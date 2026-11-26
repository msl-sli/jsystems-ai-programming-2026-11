export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export type ImageType = "jpeg" | "png" | "webp";

export const PHOTO_MESSAGES = {
  required: "Dodaj zdjęcie sprzętu.",
  unsupportedFormat: "Dozwolone formaty: JPG, PNG, WEBP.",
  tooLarge: "Zdjęcie przekracza limit 10 MB.",
} as const;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(
  bytes: Uint8Array,
  signature: number[],
  offset = 0,
): boolean {
  return (
    bytes.length >= offset + signature.length &&
    signature.every((b, i) => bytes[offset + i] === b)
  );
}

/** Detects the image type from magic bytes only; extension and MIME type are ignored. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, PNG_SIGNATURE)) return "png";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && // "RIFF"
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8) // "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export type PhotoValidation =
  { ok: true; type: ImageType } | { ok: false; message: string };

export function validatePhoto(
  input: { size: number; headBytes: Uint8Array } | null,
): PhotoValidation {
  if (input === null) return { ok: false, message: PHOTO_MESSAGES.required };
  if (input.size > MAX_PHOTO_BYTES)
    return { ok: false, message: PHOTO_MESSAGES.tooLarge };
  const type = detectImageType(input.headBytes);
  if (type === null)
    return { ok: false, message: PHOTO_MESSAGES.unsupportedFormat };
  return { ok: true, type };
}

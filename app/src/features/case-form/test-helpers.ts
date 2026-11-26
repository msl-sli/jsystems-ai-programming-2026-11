import { readFileSync } from "node:fs";
import path from "node:path";
import { vi } from "vitest";

const EXAMPLE_IMAGES = path.resolve(
  import.meta.dirname,
  "../../../../assets/example-images",
);

/** A real example photo from assets/example-images as a File (bytes are not altered). */
export function exampleImage(name: string, type = ""): File {
  const bytes = readFileSync(path.join(EXAMPLE_IMAGES, name));
  return new File([new Uint8Array(bytes)], name, { type });
}

/** In-memory file for negative cases only (plan §10.6). */
export function memoryFile(
  name: string,
  head: number[],
  size = head.length,
): File {
  const bytes = new Uint8Array(Math.max(size, head.length));
  bytes.set(head);
  return new File([bytes], name);
}

/** jsdom lacks the browser APIs that Radix, react-day-picker and the thumbnail rely on. */
export function installDomStubs() {
  const created: string[] = [];
  const revoked: string[] = [];
  let counter = 0;
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:mock-${(counter += 1)}`;
    created.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });

  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  return { created, revoked };
}

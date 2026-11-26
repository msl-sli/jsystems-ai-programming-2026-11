import {
  describeRequest,
  loadCapture,
  type LoadedCapture,
} from "./capture-store";

export interface ReplayFetchOptions {
  /** Capture body files, served strictly in this order. */
  captures: string[];
  /** Delay before every response (for timeout tests). */
  delayMs?: number;
  /** Called with the mismatch description right before the replay throws. */
  onUnmatched?: (message: string) => void;
}

export type ReplayFetch = typeof fetch & {
  readonly calls: number;
  assertAllConsumed(): void;
};

export class ReplayMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayMismatchError";
  }
}

function sleep(
  ms: number,
  signal: AbortSignal | null | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortReason(signal));
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal | null | undefined): unknown {
  return (
    signal?.reason ??
    new DOMException("This operation was aborted", "AbortError")
  );
}

function buildResponse(capture: LoadedCapture): Response {
  const { status, statusText, headers, body, chunks } = capture.response;
  const nullBody = status === 204 || status === 205 || status === 304;
  if (nullBody) return new Response(null, { status, statusText, headers });
  const encoder = new TextEncoder();
  const parts = chunks && chunks.join("") === body ? chunks : [body];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  return new Response(stream, { status, statusText, headers });
}

/**
 * A `fetch` that serves recorded captures strictly in order. It never reaches the network, never alters
 * status, headers or body, and throws on any mismatch or when the captures run out.
 */
export function createReplayFetch(options: ReplayFetchOptions): ReplayFetch {
  const captures = options.captures.map(loadCapture);
  let next = 0;

  const fail = (message: string): never => {
    options.onUnmatched?.(message);
    throw new ReplayMismatchError(message);
  };

  const replay = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : null);
    if (signal?.aborted) throw abortReason(signal);
    const request = await describeRequest(input, init);
    const capture = captures[next];
    if (!capture)
      return fail(
        `Replay exhausted: no more captures for ${request.method} ${request.url}`,
      );
    const label = `capture #${next + 1} (${capture.file})`;
    if (request.method !== capture.request.method) {
      fail(
        `Method mismatch for ${label}: got ${request.method}, recorded ${capture.request.method}`,
      );
    }
    const gotPath = new URL(request.url).pathname;
    const wantPath = new URL(capture.request.url).pathname;
    if (gotPath !== wantPath)
      fail(
        `URL path mismatch for ${label}: got ${gotPath}, recorded ${wantPath}`,
      );
    if (
      capture.meta.matchBody !== false &&
      request.bodySha256 !== capture.request.bodySha256
    ) {
      fail(
        `Request body hash mismatch for ${label}: got ${request.bodySha256}, recorded ${capture.request.bodySha256}`,
      );
    }
    next += 1;
    if (options.delayMs) await sleep(options.delayMs, signal);
    return buildResponse(capture);
  }) as ReplayFetch;

  Object.defineProperty(replay, "calls", { get: () => next });
  replay.assertAllConsumed = () => {
    if (next < captures.length) {
      throw new Error(
        `${captures.length - next} of ${captures.length} captures not consumed (remaining unused)`,
      );
    }
  };
  return replay;
}

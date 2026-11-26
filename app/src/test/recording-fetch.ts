import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  describeRequest,
  metaPathFor,
  readPackageVersions,
  type CaptureFile,
  type CaptureMeta,
} from "./capture-store";

export type RecordingMeta = Omit<CaptureMeta, "capturedAt" | "packages"> &
  Partial<Pick<CaptureMeta, "capturedAt" | "packages">>;

export interface RecordingFetchOptions {
  dir: string;
  name: string;
  meta: RecordingMeta;
  realFetch?: typeof fetch;
  bodySummary?: string;
  onCaptured?: (info: { status: number; file: string }) => void;
}

export type RecordingFetch = typeof fetch & {
  /** Resolves when every started capture has been fully read and written. */
  flush(): Promise<void>;
  /** Body files written or reserved so far, in request order. */
  readonly files: string[];
};

const PROVIDER_HEADER = /^(x-openrouter|openrouter-)/i;

/**
 * Forwards requests unchanged to `realFetch`, tees the response and writes
 * `<dir>/<name>.json` + `.meta.json` once the caller's copy is fully read.
 * Later requests use `<name>-2`, `<name>-3`, ...
 */
export function createRecordingFetch(
  options: RecordingFetchOptions,
): RecordingFetch {
  const realFetch = options.realFetch ?? fetch;
  const pending: Promise<void>[] = [];
  const files: string[] = [];

  const recording = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const index = files.length + 1;
    const file = path.join(
      options.dir,
      `${options.name}${index === 1 ? "" : `-${index}`}.json`,
    );
    files.push(file);

    // Describe a copy of the request; the original goes to realFetch untouched.
    const request = await describeRequest(
      input instanceof Request ? input.clone() : input,
      init,
    );
    const response = await realFetch(input, init);
    if (!response.body) {
      write(file, request, response, [], options);
      return response;
    }
    const [forCaller, forRecorder] = response.body.tee();
    pending.push(
      (async () => {
        const decoder = new TextDecoder();
        const chunks: string[] = [];
        const reader = forRecorder.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(decoder.decode(value, { stream: true }));
        }
        const tail = decoder.decode();
        if (tail) chunks.push(tail);
        write(file, request, response, chunks, options);
      })(),
    );
    return new Response(forCaller, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }) as RecordingFetch;

  recording.flush = async () => {
    await Promise.all(pending);
  };
  Object.defineProperty(recording, "files", { get: () => [...files] });
  return recording;
}

function write(
  file: string,
  request: Awaited<ReturnType<typeof describeRequest>>,
  response: Response,
  chunks: string[],
  options: RecordingFetchOptions,
): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const responseHeaders: Record<string, string> = {};
  const providerHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
    if (PROVIDER_HEADER.test(key)) providerHeaders[key] = value;
  });
  const capture: CaptureFile = {
    request: {
      ...request,
      ...(options.bodySummary ? { bodySummary: options.bodySummary } : {}),
    },
    response: {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: chunks.join(""),
      ...(chunks.length > 1 ? { chunks } : {}),
    },
  };
  const meta: CaptureMeta = {
    ...options.meta,
    capturedAt: options.meta.capturedAt ?? new Date().toISOString(),
    packages: options.meta.packages ?? readPackageVersions(),
    ...(options.meta.providerHeaders ||
    Object.keys(providerHeaders).length === 0
      ? {}
      : { providerHeaders }),
  };
  writeFileSync(file, `${JSON.stringify(capture, null, 2)}\n`);
  writeFileSync(metaPathFor(file), `${JSON.stringify(meta, null, 2)}\n`);
  options.onCaptured?.({ status: response.status, file });
}

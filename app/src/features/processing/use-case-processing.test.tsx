import { act, render, screen } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaseSessionProvider, useCaseSession } from "@/features/case-session";
import { image, photoFile, returnCase } from "@/features/case-session/fixtures";
import { ProcessingController } from "./processing-controller";

const never = () => new Promise<Response>(() => {});
type Probe = ReturnType<typeof useCaseSession>;

function setup(
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
  strict = false,
) {
  const compress = vi.fn().mockResolvedValue(image);
  const fetchMock = vi.fn(fetchImpl);
  const probe: { current: Probe | null } = { current: null };
  function Probe() {
    probe.current = useCaseSession();
    return <span data-testid="status">{probe.current.state.status}</span>;
  }
  const Wrap = ({ children }: { children: ReactNode }) =>
    strict ? <StrictMode>{children}</StrictMode> : <>{children}</>;
  const utils = render(
    <Wrap>
      <CaseSessionProvider>
        <ProcessingController
          fetch={fetchMock as unknown as typeof globalThis.fetch}
          compress={compress}
        />
        <Probe />
      </CaseSessionProvider>
    </Wrap>,
  );
  const api = () => probe.current as Probe;
  return { compress, fetchMock, api, ...utils };
}

const status = () => screen.getByTestId("status").textContent;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => "blob:1",
      revokeObjectURL: () => {},
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ProcessingController", () => {
  it("does nothing while the form is shown", async () => {
    const { fetchMock, compress } = setup(never);
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(compress).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls compress once with the original File and posts the screening body", async () => {
    const photo = photoFile();
    const { api, compress, fetchMock } = setup(never);
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => api().submit(returnCase, photo));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(compress).toHaveBeenCalledTimes(1);
    expect(compress.mock.calls[0]![0]).toBe(photo);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/cases/screening");
    expect(JSON.parse(String(init.body))).toEqual({
      caseInput: returnCase,
      caseImage: image,
    });
    expect(api().state.stage).toBe("screening");
    expect(status()).toBe("processing");
  });

  it("dispatches failed after 90 s with a never-settling fetch (AC-17)", async () => {
    const { api } = setup(never);
    act(() => api().submit(returnCase, photoFile()));
    await act(() => vi.advanceTimersByTimeAsync(89_000));
    expect(status()).toBe("processing");
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(status()).toBe("form");
    expect(api().state.processingError).toBe(true);
    expect(api().state.caseInput).toEqual(returnCase);
  });

  it("dispatches failed when fetch rejects (AC-17)", async () => {
    const { api } = setup(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    act(() => api().submit(returnCase, photoFile()));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(status()).toBe("form");
    expect(api().state.processingError).toBe(true);
  });

  it("runs the flow again with the same data on retry", async () => {
    const photo = photoFile();
    const { api, compress, fetchMock } = setup(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    act(() => api().submit(returnCase, photo));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(status()).toBe("form");
    act(() => api().dispatch({ type: "retry" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(compress).toHaveBeenCalledTimes(2);
    expect(compress.mock.calls[1]![0]).toBe(photo);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![1].body).toBe(
      fetchMock.mock.calls[0]![1].body,
    );
  });

  it("sends one screening request under StrictMode double effects", async () => {
    const { api, fetchMock, compress } = setup(never, true);
    act(() => api().submit(returnCase, photoFile()));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(compress).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts the request on unmount without dispatching", async () => {
    let signal: AbortSignal | undefined;
    const { api, unmount } = setup((_url, init) => {
      signal = init.signal as AbortSignal;
      return never();
    });
    act(() => api().submit(returnCase, photoFile()));
    await act(() => vi.advanceTimersByTimeAsync(0));
    unmount();
    await Promise.resolve();
    expect(signal?.aborted).toBe(true);
  });

  it.todo(
    "success path: screened then decided dispatched, state becomes chat from I4 api-captures",
  );
  it.todo("real 502 / 413 error responses lead to failed from I4 api-captures");
});

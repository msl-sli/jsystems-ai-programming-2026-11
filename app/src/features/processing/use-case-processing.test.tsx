import { act, render, screen } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaseSessionProvider, useCaseSession } from "@/features/case-session";
import { image, photoFile, returnCase } from "@/features/case-session/fixtures";
import { captureJson, createCaptureFetch } from "@/test/api-capture";
import type { DecisionResponse } from "@/domain/contracts";
import { ProcessingScreen } from "./processing-screen";
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

  describe("with real API captures", () => {
    /** Serves captures verbatim; holds each response until released, to observe the stage. */
    function gated(names: string[]) {
      const f = createCaptureFetch(names);
      const releases: (() => void)[] = [];
      const gates = names.map(
        (_, i) => new Promise<void>((r) => (releases[i] = r)),
      );
      const fetch = async (url: string, init: RequestInit) => {
        const call = f.calls.length;
        const res = await f.fetch(url, init);
        await gates[call];
        return res;
      };
      return { f, fetch, release: (i: number) => releases[i]!() };
    }

    function StageText() {
      const { state } = useCaseSession();
      return state.status === "processing" ? (
        <ProcessingScreen photoUrl={null} stage={state.stage ?? "screening"} />
      ) : null;
    }

    it.each([
      ["template R1", "a-return-20d", "template", "return_rejected"],
      ["llm R3", "c-complaint-10d", "llm", "complaint_rejected"],
    ])(
      "success path (%s): stage text switches, then decided leads to chat",
      async (_label, prefix, path, category) => {
        const g = gated([`${prefix}-screening`, `${prefix}-decision`]);
        const compress = vi.fn().mockResolvedValue(image);
        const probe: { current: Probe | null } = { current: null };
        function Inner() {
          probe.current = useCaseSession();
          return <StageText />;
        }
        render(
          <CaseSessionProvider>
            <ProcessingController
              fetch={g.fetch as unknown as typeof globalThis.fetch}
              compress={compress}
            />
            <Inner />
          </CaseSessionProvider>,
        );
        act(() => probe.current!.submit(returnCase, photoFile()));
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText("Analizujemy zdjęcie…")).toBeTruthy();
        g.release(0);
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText("Przygotowujemy decyzję…")).toBeTruthy();
        expect(probe.current!.state.stage).toBe("decision");
        expect(g.f.calls[1]!.body).toMatchObject({
          screening: captureJson<{ screening: unknown }>(`${prefix}-screening`)
            .screening,
        });

        g.release(1);
        await act(() => vi.advanceTimersByTimeAsync(0));
        const { state } = probe.current!;
        const captured = captureJson<DecisionResponse>(`${prefix}-decision`);
        expect(state.status).toBe("chat");
        expect(state.decision).toEqual(captured.decision);
        expect(state.decision).toMatchObject({ decisionPath: path, category });
        expect(state.firstMessage).toEqual(captured.firstMessage);
        expect(state.decisionHistory).toHaveLength(1);
      },
    );

    it.each([
      ["502 (AC-17)", "invalid-key-return-screening"],
      ["413", "limits-oversize-screening"],
    ])("real %s envelope leads to failed", async (_label, name) => {
      const f = createCaptureFetch([name]);
      const { api } = setup(f.fetch as never);
      act(() => api().submit(returnCase, photoFile()));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(status()).toBe("form");
      expect(api().state.processingError).toBe(true);
      expect(api().state.caseInput).toEqual(returnCase);
    });
  });
});

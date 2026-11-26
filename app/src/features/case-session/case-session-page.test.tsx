import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { installDomStubs } from "@/features/case-form/test-helpers";
import { CaseSessionPage, CaseSessionView } from "./case-session-page";
import { CaseSessionProvider, useCaseSession } from "./provider";
import {
  image,
  makeDecisionResponse,
  makeScreening,
  photoFile,
  returnCase,
} from "./fixtures";

const BANNER =
  "Nie udało się przeanalizować zgłoszenia. Spróbuj ponownie za chwilę.";
let stubs: ReturnType<typeof installDomStubs>;
beforeEach(() => {
  stubs = installDomStubs();
});

function renderPage() {
  const probe: { current: ReturnType<typeof useCaseSession> | null } = {
    current: null,
  };
  function Probe() {
    probe.current = useCaseSession();
    return null;
  }
  render(
    <CaseSessionProvider>
      <CaseSessionView />
      <Probe />
    </CaseSessionProvider>,
  );
  return probe as { current: ReturnType<typeof useCaseSession> };
}

const unloadPrevented = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("CaseSessionPage", () => {
  it("shows the empty form and no leave guard initially", () => {
    render(<CaseSessionPage />);
    expect(
      screen.getByRole("button", { name: "Wyślij zgłoszenie" }),
    ).toBeTruthy();
    expect(unloadPrevented()).toBe(false);
  });

  it("keeps the very first typed character after load (T60 regression)", async () => {
    render(<CaseSessionPage />);
    const name = screen.getByLabelText("Nazwa lub model sprzętu");
    await userEvent.type(name, "Dell XPS");
    expect((name as HTMLInputElement).value).toBe("Dell XPS");
  });

  it("arms the guard once the user types into the form (AC-39)", async () => {
    render(<CaseSessionPage />);
    await userEvent.type(
      screen.getByLabelText("Nazwa lub model sprzętu"),
      "Tel",
    );
    expect(unloadPrevented()).toBe(true);
  });

  it("shows processing and chat placeholders and keeps the guard on", () => {
    const probe = renderPage();
    act(() => probe.current.submit(returnCase, photoFile()));
    expect(screen.getByTestId("processing-screen")).toBeTruthy();
    expect(unloadPrevented()).toBe(true);
    act(() =>
      probe.current.dispatch({
        type: "screened",
        screening: makeScreening(),
        image,
      }),
    );
    act(() =>
      probe.current.dispatch({
        type: "decided",
        response: makeDecisionResponse(),
      }),
    );
    expect(screen.getByTestId("chat-screen")).toBeTruthy();
    expect(unloadPrevented()).toBe(true);
    act(() => probe.current.dispatch({ type: "newCase" }));
    expect(
      screen.getByRole("button", { name: "Wyślij zgłoszenie" }),
    ).toBeTruthy();
    expect(unloadPrevented()).toBe(false);
  });

  it("restores the form with a banner after a failure and retries (AC-17)", async () => {
    const probe = renderPage();
    act(() => probe.current.submit(returnCase, photoFile()));
    act(() => probe.current.dispatch({ type: "failed" }));
    expect(screen.getByText(BANNER)).toBeTruthy();
    expect(screen.getByLabelText("Nazwa lub model sprzętu")).toHaveProperty(
      "value",
      returnCase.productName,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Spróbuj ponownie/ }),
    );
    expect(screen.getByTestId("processing-screen")).toBeTruthy();
  });
});

describe("object URL lifecycle", () => {
  function setup() {
    return renderHook(() => useCaseSession(), {
      wrapper: CaseSessionProvider,
    });
  }

  it("creates a URL on submit and revokes it on newCase", () => {
    const { result } = setup();
    act(() => result.current.submit(returnCase, photoFile()));
    expect(result.current.state.photoUrl).toBe(stubs.created[0]);
    expect(stubs.revoked).toEqual([]);
    act(() => result.current.dispatch({ type: "newCase" }));
    expect(stubs.revoked).toEqual([stubs.created[0]]);
    expect(result.current.state.photoUrl).toBeNull();
  });

  it("revokes the old URL when the photo is replaced but reuses it for the same file", () => {
    const { result } = setup();
    const first = photoFile();
    act(() => result.current.submit(returnCase, first));
    act(() => result.current.dispatch({ type: "failed" }));
    act(() => result.current.submit(returnCase, first));
    expect(stubs.created).toHaveLength(1);
    expect(stubs.revoked).toEqual([]);
    act(() => result.current.dispatch({ type: "failed" }));
    act(() => result.current.submit(returnCase, photoFile()));
    expect(stubs.created).toHaveLength(2);
    expect(stubs.revoked).toEqual([stubs.created[0]]);
  });
});

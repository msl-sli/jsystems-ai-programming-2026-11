import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOMATED_DECISION_NOTICE,
  type DecisionResponse,
} from "@/domain/contracts";
import {
  captureJson,
  createCaptureFetch,
  loadApiCapture,
} from "@/test/api-capture";
import { installDomStubs } from "@/features/case-form/test-helpers";
import { CaseSessionProvider, useCaseSession } from "@/features/case-session";
import { AgentMarkdown } from "./agent-markdown";
import { AssistantMessage } from "./assistant-message";
import { ChatErrorNotice } from "./chat-error-notice";
import { ChatScreen } from "./chat-screen";
import {
  accepted,
  betterPhoto,
  capturedChatState,
  capturedReturnInput,
  chatState,
  complaintInput,
  freshReturn,
  lateReturn,
  rejected,
} from "./test-fixtures";
import { TypingIndicator } from "./typing-indicator";
import type { CaseUIMessage } from "./types";

beforeEach(() => {
  installDomStubs();
});

function renderScreen(state: ReturnType<typeof chatState>) {
  const probe: { current: ReturnType<typeof useCaseSession> | null } = {
    current: null,
  };
  function Probe() {
    probe.current = useCaseSession();
    return null;
  }
  render(
    <CaseSessionProvider initialState={state}>
      <ChatScreen />
      <Probe />
    </CaseSessionProvider>,
  );
  return probe as { current: ReturnType<typeof useCaseSession> };
}

const newCaseButton = () =>
  screen.getByRole("button", { name: "Nowe zgłoszenie" });

describe("ChatScreen composition", () => {
  it("shows summary card, the first message as the first agent bubble and the input", () => {
    const d = rejected();
    renderScreen(chatState(lateReturn, d));
    expect(screen.getByTestId("case-summary")).toBeTruthy();
    const log = screen.getByRole("log");
    expect(within(log).getByText(d.firstMessage.justification)).toBeTruthy();
    expect(within(log).getByText(AUTOMATED_DECISION_NOTICE)).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Zadaj pytanie lub dodaj informacje…"),
    ).toBeTruthy();
    expect(screen.queryByText("Nie udało się uzyskać odpowiedzi.")).toBeNull();
    expect(screen.queryByRole("status", { name: /pisze/ })).toBeNull();
  });

  it("shows the latest decision label and emphasizes New case for better_photo", () => {
    const d = betterPhoto();
    renderScreen(chatState(freshReturn, d));
    expect(
      within(screen.getByTestId("case-summary")).getByText(d.decision.label),
    ).toBeTruthy();
    expect(newCaseButton().getAttribute("data-emphasized")).toBe("true");
  });

  it("does not emphasize New case for an accepted decision", () => {
    renderScreen(chatState(freshReturn, accepted()));
    expect(newCaseButton().getAttribute("data-emphasized")).toBe("false");
  });

  it("cancel keeps the chat, confirm dispatches newCase (AC-38)", async () => {
    const probe = renderScreen(chatState(lateReturn, rejected()));
    await userEvent.click(newCaseButton());
    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(probe.current.state.status).toBe("chat");
    await userEvent.click(newCaseButton());
    await userEvent.click(screen.getByRole("button", { name: "Kontynuuj" }));
    expect(probe.current.state.status).toBe("form");
  });

  it("has no file or photo input (AC-36)", () => {
    renderScreen(chatState(lateReturn, rejected()));
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});

// Streaming and transport behaviour is proven against the real recorded SSE streams of /api/chat
// (plan 7a.3): useChat + the real DefaultChatTransport, fetch serves the capture body verbatim.
describe("ChatScreen with real API captures", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Holds the response of call `index` until released (verbatim body afterwards). */
  function gatedFetch(names: string[], opts: { matchPath?: boolean } = {}) {
    const f = createCaptureFetch(names, opts);
    const releases: (() => void)[] = [];
    const gates = names.map(
      (_, i) => new Promise<void>((r) => (releases[i] = r)),
    );
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = f.calls.length;
      const res = await f.fetch(input, init);
      await gates[call];
      return res;
    }) as typeof globalThis.fetch;
    vi.stubGlobal("fetch", fetch);
    return { calls: f.calls, release: (i: number) => releases[i]!() };
  }

  const send = async (text: string) => {
    await userEvent.type(
      screen.getByPlaceholderText("Zadaj pytanie lub dodaj informacje…"),
      text,
    );
    await userEvent.click(screen.getByRole("button", { name: /Wyślij/ }));
  };
  const sendButton = () =>
    screen.getByRole("button", { name: /Wyślij/ }) as HTMLButtonElement;
  const noticeCount = () =>
    (screen.getByRole("log").textContent ?? "").split(AUTOMATED_DECISION_NOTICE)
      .length - 1;
  function streamedText(name: string): string {
    // Text of the capture, read from the raw SSE exactly as received (assertion helper only).
    return loadApiCapture(name)
      .response.body.split("\n\n")
      .filter((e) => e.includes('"type":"text-delta"'))
      .map(
        (e) =>
          (JSON.parse(e.slice("data: ".length)) as { delta: string }).delta,
      )
      .join("");
  }

  it("shows the typing indicator and disables Send until the stream ends; text appears (AC-31)", async () => {
    const state = capturedChatState("c-complaint-10d", complaintInput);
    const g = gatedFetch(["c-chat-question"]);
    renderScreen(state);
    await send("Jaką datę zakupu podałem?");
    await screen.findByRole("status", { name: "Agent pisze odpowiedź…" });
    expect(sendButton().disabled).toBe(true);
    expect(g.calls).toHaveLength(1);
    expect(screen.getByText("Jaką datę zakupu podałem?")).toBeTruthy();

    g.release(0);
    const text = streamedText("c-chat-question");
    expect(text).toContain("16 listopada");
    await within(screen.getByRole("log")).findByText(text);
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: /pisze/ })).toBeNull(),
    );
    // The model's reasoning is never rendered.
    expect(screen.queryByText(/Providing a direct answer/)).toBeNull();
    // A plain answer is not a decision change.
    expect(screen.queryByTestId("decision-change")).toBeNull();
    expect(noticeCount()).toBe(1);
  });

  it("builds the chat request body from the captured session state", async () => {
    const state = capturedChatState("c-complaint-10d", complaintInput);
    const g = gatedFetch(["c-chat-question"]);
    renderScreen(state);
    await send("Jaką datę zakupu podałem?");
    await waitFor(() => expect(g.calls).toHaveLength(1));
    const decided = captureJson<DecisionResponse>("c-complaint-10d-decision");
    const screening = captureJson<{ screening: unknown }>(
      "c-complaint-10d-screening",
    ).screening;
    expect(g.calls[0]).toMatchObject({ url: "/api/chat", method: "POST" });
    expect(g.calls[0]!.body).toEqual({
      caseContext: {
        caseInput: complaintInput,
        screening,
        decisionHistory: state.decisionHistory,
        firstMessage: decided.firstMessage,
        llmFindings: decided.llmFindings,
      },
      messages: [
        {
          id: expect.any(String),
          role: "user",
          parts: [{ type: "text", text: "Jaką datę zakupu podałem?" }],
        },
      ],
    });
    expect(state.decisionHistory).toEqual([
      expect.objectContaining({
        source: "initial",
        label: decided.decision.label,
      }),
    ]);
    g.release(0);
  });

  it("c-chat-new-fact: a text-only answer shows no decision header and keeps the badge", async () => {
    const state = capturedChatState("c-complaint-10d", complaintInput);
    const g = gatedFetch(["c-chat-new-fact"]);
    const probe = renderScreen(state);
    await send("Pęknięcie powstało po upadku telefonu.");
    g.release(0);
    await within(screen.getByRole("log")).findByText(
      streamedText("c-chat-new-fact"),
    );
    expect(screen.queryByTestId("decision-change")).toBeNull();
    expect(noticeCount()).toBe(1);
    expect(probe.current.state.decisionHistory).toHaveLength(1);
    expect(
      within(screen.getByTestId("case-summary")).getByText(
        state.decisionHistory[0]!.label,
      ),
    ).toBeTruthy();
  });

  it("f-chat-new-fact: decision header and notice, summary badge updated, decisionChanged once (AC-33)", async () => {
    const state = capturedChatState("f-return-nodesc", capturedReturnInput);
    expect(state.decisionHistory[0]!.category).toBe("return_accepted");
    const g = gatedFetch(["f-chat-new-fact"]);
    const probe = renderScreen(state);
    expect(noticeCount()).toBe(1);
    await send("Telefon mi spadł i ma pęknięty ekran.");
    g.release(0);
    const log = screen.getByRole("log");
    await within(log).findByText("Zmiana decyzji: Zwrot odrzucony");
    await within(log).findByText(streamedText("f-chat-new-fact"));
    expect(noticeCount()).toBe(2);
    const history = probe.current.state.decisionHistory;
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({
      source: "chat",
      category: "return_rejected",
      label: "Zwrot odrzucony",
      citedRuleIds: ["RET-2"],
    });
    expect(
      within(screen.getByTestId("case-summary")).getByText("Zwrot odrzucony"),
    ).toBeTruthy();
    expect(screen.getAllByTestId("decision-change")).toHaveLength(1);
  });

  it("two decision changes in a row (AC-33): the second request carries the first change", async () => {
    const state = capturedChatState("f-return-nodesc", capturedReturnInput);
    const g = gatedFetch(["f-chat-new-fact", "f-chat-new-fact"]);
    const probe = renderScreen(state);
    await send("Telefon mi spadł.");
    g.release(0);
    await within(screen.getByRole("log")).findByText(
      "Zmiana decyzji: Zwrot odrzucony",
    );
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: /pisze/ })).toBeNull(),
    );
    await send("Ekran jest pęknięty.");
    g.release(1);
    // The same capture is replayed, so its assistant message id repeats: assert on the session state.
    await waitFor(() =>
      expect(probe.current.state.decisionHistory).toHaveLength(3),
    );
    expect(probe.current.state.decisionHistory).toHaveLength(3);
    const second = g.calls[1]!.body as {
      caseContext: { decisionHistory: unknown[] };
      messages: unknown[];
    };
    expect(second.caseContext.decisionHistory).toHaveLength(2);
    expect(second.messages).toHaveLength(3);
  });

  it("shows the chat error with retry and keeps one user message after regenerate (AC-37)", async () => {
    const state = capturedChatState("c-complaint-10d", complaintInput);
    // Real 502 envelope (recorded from /api/cases/screening) as the failed chat response, then a real SSE.
    const g = gatedFetch(["invalid-key-return-screening", "c-chat-question"], {
      matchPath: false,
    });
    renderScreen(state);
    await send("Jaką datę zakupu podałem?");
    g.release(0);
    await screen.findByText("Nie udało się uzyskać odpowiedzi.");
    expect(screen.getAllByText("Jaką datę zakupu podałem?")).toHaveLength(1);
    expect(sendButton().disabled).toBe(true); // empty input
    await userEvent.click(
      screen.getByRole("button", { name: "Spróbuj ponownie" }),
    );
    g.release(1);
    await within(screen.getByRole("log")).findByText(
      streamedText("c-chat-question"),
    );
    expect(screen.queryByText("Nie udało się uzyskać odpowiedzi.")).toBeNull();
    expect(screen.getAllByText("Jaką datę zakupu podałem?")).toHaveLength(1);
    const [first, retry] = g.calls.map(
      (c) => (c.body as { messages: unknown[] }).messages,
    );
    expect(retry).toHaveLength(1);
    expect(retry).toEqual(first);
  });

  // No real capture of a stream that fails midway exists (the recorded failure is a plain 502).
  it.todo(
    "discards partial assistant text of a failed attempt (AC-37): needs a recorded mid-stream failure",
  );
});

describe("presentational chat pieces", () => {
  it("TypingIndicator is a Polish status (AC-31)", () => {
    render(<TypingIndicator />);
    expect(
      screen.getByRole("status", { name: "Agent pisze odpowiedź…" }),
    ).toBeTruthy();
  });

  it("ChatErrorNotice shows the AC-37 text and retries on click", async () => {
    let retried = 0;
    render(<ChatErrorNotice onRetry={() => (retried += 1)} />);
    expect(screen.getByText("Nie udało się uzyskać odpowiedzi.")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Spróbuj ponownie" }),
    );
    expect(retried).toBe(1);
  });

  it("AgentMarkdown renders formatting but never raw HTML, and opens links safely", () => {
    const { container } = render(
      <AgentMarkdown>
        {"**Ważne** <b>surowy</b> [serwis](https://example.com)"}
      </AgentMarkdown>,
    );
    expect(screen.getByText("Ważne").getAttribute("data-streamdown")).toBe(
      "strong",
    );
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("surowy");
    const link = screen.getByRole("link", { name: "serwis" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("AssistantMessage orders decision header, text, then notice; other parts render nothing", () => {
    const { decision } = accepted();
    const message: CaseUIMessage = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { type: "text", text: "Treść odpowiedzi." },
        {
          type: "data-decision",
          data: {
            category: decision.category,
            label: decision.label,
            citedRuleIds: decision.citedRuleIds,
            manualReviewKind: decision.manualReviewKind,
          },
        },
      ],
    };
    const { container } = render(<AssistantMessage message={message} />);
    const text = container.textContent ?? "";
    const iHeader = text.indexOf(`Zmiana decyzji: ${decision.label}`);
    const iBody = text.indexOf("Treść odpowiedzi.");
    const iNotice = text.indexOf(AUTOMATED_DECISION_NOTICE);
    expect(iHeader).toBeGreaterThanOrEqual(0);
    expect(iHeader).toBeLessThan(iBody);
    expect(iBody).toBeLessThan(iNotice);
  });

  it("AssistantMessage without a decision part shows no notice", () => {
    const message: CaseUIMessage = {
      id: "a2",
      role: "assistant",
      parts: [{ type: "text", text: "Zwykła odpowiedź." }],
    };
    render(<AssistantMessage message={message} />);
    expect(screen.queryByText(AUTOMATED_DECISION_NOTICE)).toBeNull();
  });
});

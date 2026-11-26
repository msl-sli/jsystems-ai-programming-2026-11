import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AUTOMATED_DECISION_NOTICE } from "@/domain/contracts";
import { installDomStubs } from "@/features/case-form/test-helpers";
import { CaseSessionProvider, useCaseSession } from "@/features/case-session";
import { AgentMarkdown } from "./agent-markdown";
import { AssistantMessage } from "./assistant-message";
import { ChatErrorNotice } from "./chat-error-notice";
import { ChatScreen } from "./chat-screen";
import {
  accepted,
  betterPhoto,
  chatState,
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

  // Streaming and transport behaviour must be proven against real recorded streams (plan 7a.3).
  it.todo(
    "shows the typing indicator and disables Send during a real stream (AC-31) from I4 SSE captures",
  );
  it.todo("progressively appends streamed text (AC-31) from I4 SSE captures");
  it.todo(
    "dispatches decisionChanged once per data-decision part and updates the summary badge (AC-33) from I4 SSE captures",
  );
  it.todo("shows two decision changes in a row (AC-33) from I4 SSE captures");
  it.todo(
    "shows the chat error with retry and keeps one user message after regenerate (AC-37) from I4 SSE captures",
  );
  it.todo(
    "discards partial assistant text of a failed attempt (AC-37) from I4 SSE captures",
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

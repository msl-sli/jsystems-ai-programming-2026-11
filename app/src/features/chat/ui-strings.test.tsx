import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";

// AC-40: English defaults of the installed AI Elements primitives are replaced with Polish.
describe("Polish strings in installed UI components (AC-40)", () => {
  it("Spinner is labelled in Polish", () => {
    render(<Spinner />);
    expect(screen.getByRole("status", { name: "Ładowanie" })).toBeTruthy();
    expect(screen.queryByLabelText("Loading")).toBeNull();
  });

  it("Message scroller viewport and scroll buttons are Polish", () => {
    const { container } = render(
      <MessageScrollerProvider>
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent>x</MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" />
          <MessageScrollerButton direction="start" />
        </MessageScroller>
      </MessageScrollerProvider>,
    );
    expect(screen.getByLabelText("Wiadomości")).toBeTruthy();
    const text = container.textContent ?? "";
    expect(text).toContain("Przewiń do najnowszej wiadomości");
    expect(text).toContain("Przewiń na początek rozmowy");
    expect(text).not.toMatch(/Scroll to/);
  });
});

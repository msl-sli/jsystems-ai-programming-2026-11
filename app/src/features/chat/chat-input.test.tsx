import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "./chat-input";

const LIMIT_MESSAGE = "Wiadomość może mieć maksymalnie 1000 znaków.";
const box = () =>
  screen.getByPlaceholderText("Zadaj pytanie lub dodaj informacje…");
const send = () => screen.getByRole("button", { name: "Wyślij" });
const sendDisabled = () => (send() as HTMLButtonElement).disabled;

describe("ChatInput (AC-30, AC-36)", () => {
  it("has the Polish placeholder, a Send button and no upload control", () => {
    const { container } = render(<ChatInput busy={false} onSend={vi.fn()} />);
    expect(box()).toBeTruthy();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("disables Send for empty and whitespace-only input", async () => {
    render(<ChatInput busy={false} onSend={vi.fn()} />);
    expect(sendDisabled()).toBe(true);
    await userEvent.type(box(), "   ");
    expect(sendDisabled()).toBe(true);
    await userEvent.type(box(), "a");
    expect(sendDisabled()).toBe(false);
  });

  it("disables Send while busy and does not send on Enter", async () => {
    const onSend = vi.fn();
    render(<ChatInput busy onSend={onSend} />);
    await userEvent.type(box(), "pytanie{Enter}");
    expect(sendDisabled()).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends the trimmed text on click and clears the field", async () => {
    const onSend = vi.fn();
    render(<ChatInput busy={false} onSend={onSend} />);
    await userEvent.type(box(), "  jaka data?  ");
    await userEvent.click(send());
    expect(onSend).toHaveBeenCalledExactlyOnceWith("jaka data?");
    expect((box() as HTMLTextAreaElement).value).toBe("");
  });

  it("Enter sends, Shift+Enter inserts a newline", async () => {
    const onSend = vi.fn();
    render(<ChatInput busy={false} onSend={onSend} />);
    await userEvent.type(box(), "a{Shift>}{Enter}{/Shift}b");
    expect(onSend).not.toHaveBeenCalled();
    expect((box() as HTMLTextAreaElement).value).toBe("a\nb");
    await userEvent.type(box(), "{Enter}");
    expect(onSend).toHaveBeenCalledExactlyOnceWith("a\nb");
  });

  it("accepts exactly 1000 characters", async () => {
    const onSend = vi.fn();
    render(<ChatInput busy={false} onSend={onSend} />);
    await userEvent.click(box());
    await userEvent.paste("x".repeat(1000));
    expect(screen.queryByText(LIMIT_MESSAGE)).toBeNull();
    await userEvent.click(send());
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("blocks 1001 characters with the AC-30 message", async () => {
    const onSend = vi.fn();
    render(<ChatInput busy={false} onSend={onSend} />);
    await userEvent.click(box());
    await userEvent.paste("x".repeat(1001));
    expect(screen.getByText(LIMIT_MESSAGE)).toBeTruthy();
    expect(box().getAttribute("aria-invalid")).toBe("true");
    expect(sendDisabled()).toBe(true);
    await userEvent.type(box(), "{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows a counter only near the limit", async () => {
    render(<ChatInput busy={false} onSend={vi.fn()} />);
    await userEvent.click(box());
    await userEvent.paste("x".repeat(899));
    expect(screen.queryByText("899/1000")).toBeNull();
    await userEvent.paste("y");
    expect(screen.getByText("900/1000")).toBeTruthy();
  });
});

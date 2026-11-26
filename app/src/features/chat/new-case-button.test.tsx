import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewCaseButton } from "./new-case-button";

const PROMPT = "Obecna rozmowa zostanie utracona. Kontynuować?";
const trigger = () => screen.getByRole("button", { name: "Nowe zgłoszenie" });

describe("NewCaseButton (AC-38)", () => {
  it("asks for confirmation and calls onConfirm only after confirming", async () => {
    const onConfirm = vi.fn();
    render(<NewCaseButton emphasized={false} onConfirm={onConfirm} />);
    await userEvent.click(trigger());
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(PROMPT)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Kontynuuj" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cancel closes the dialog and keeps the chat", async () => {
    const onConfirm = vi.fn();
    render(<NewCaseButton emphasized={false} onConfirm={onConfirm} />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("is secondary by default and primary when emphasized (PRD 9.3)", () => {
    const { rerender } = render(
      <NewCaseButton emphasized={false} onConfirm={vi.fn()} />,
    );
    expect(trigger().getAttribute("data-variant")).toBe("secondary");
    expect(trigger().getAttribute("data-emphasized")).toBe("false");
    rerender(<NewCaseButton emphasized onConfirm={vi.fn()} />);
    expect(trigger().getAttribute("data-variant")).toBe("default");
    expect(trigger().getAttribute("data-emphasized")).toBe("true");
  });
});

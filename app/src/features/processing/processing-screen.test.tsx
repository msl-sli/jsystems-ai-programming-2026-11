import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessingScreen } from "./processing-screen";

describe("ProcessingScreen", () => {
  it("shows the thumbnail, stage 1 text and the time hint (AC-14)", () => {
    render(<ProcessingScreen photoUrl="blob:photo" stage="screening" />);
    expect(screen.getByText("Analizujemy zdjęcie…")).toBeTruthy();
    expect(screen.queryByText("Przygotowujemy decyzję…")).toBeNull();
    expect(screen.getByText("To może potrwać do minuty.")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toBe("blob:photo");
  });

  it("shows stage 2 text", () => {
    render(<ProcessingScreen photoUrl="blob:photo" stage="decision" />);
    expect(screen.getByText("Przygotowujemy decyzję…")).toBeTruthy();
    expect(screen.queryByText("Analizujemy zdjęcie…")).toBeNull();
  });

  it("is a polite live region without a cancel button", () => {
    render(<ProcessingScreen photoUrl={null} stage="screening" />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

describe("test infrastructure (jsdom)", () => {
  it("renders a shadcn Button", () => {
    render(<Button>Wyślij</Button>);
    expect(screen.getByRole("button", { name: "Wyślij" })).toBeInTheDocument();
  });
});

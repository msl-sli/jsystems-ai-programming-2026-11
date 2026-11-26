import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("renders the product name as visible text inside a header landmark", () => {
    render(<SiteHeader />);
    const header = screen.getByRole("banner");
    expect(
      within(header).getByText("Hardware Service Decision Copilot"),
    ).toBeVisible();
  });

  it("renders the logo with a Polish alt text", () => {
    render(<SiteHeader />);
    const logo = within(screen.getByRole("banner")).getByRole("img", {
      name: "Logo firmy",
    });
    expect(logo).toHaveAttribute("src", expect.stringContaining("logo.svg"));
  });
});

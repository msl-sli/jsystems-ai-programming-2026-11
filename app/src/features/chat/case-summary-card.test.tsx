import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CASE_CATEGORY_LABELS, CASE_TYPE_LABELS } from "@/domain/case-schema";
import { CaseSummaryCard } from "./case-summary-card";
import { DecisionBadge } from "./decision-badge";
import {
  accepted,
  betterPhoto,
  entryOf,
  lateReturn,
  rejected,
} from "./test-fixtures";

describe("CaseSummaryCard (AC-29)", () => {
  function renderCard() {
    const d = rejected();
    render(
      <CaseSummaryCard
        caseInput={lateReturn}
        photoUrl="blob:mock-1"
        decision={entryOf(d)}
      />,
    );
    return d;
  }

  it("shows type, category, name, Polish date and the decision label", () => {
    const d = renderCard();
    const card = screen.getByTestId("case-summary");
    expect(within(card).getByText(CASE_TYPE_LABELS.return)).toBeTruthy();
    expect(
      within(card).getByText(CASE_CATEGORY_LABELS.smartphone),
    ).toBeTruthy();
    expect(within(card).getByText("Telefon X")).toBeTruthy();
    expect(within(card).getByText("01.09.2026")).toBeTruthy();
    expect(within(card).getByText(d.decision.label)).toBeTruthy();
  });

  it("shows a photo thumbnail that opens an enlarged view in a dialog", async () => {
    renderCard();
    const thumb = screen.getByRole("img", { name: /Zdjęcie sprzętu/ });
    expect(thumb.getAttribute("src")).toBe("blob:mock-1");
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /Powiększ zdjęcie/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("img").getAttribute("src")).toBe(
      "blob:mock-1",
    );
    expect(
      within(dialog).getByRole("button", { name: "Zamknij" }),
    ).toBeTruthy();
  });

  it("has a collapse control for mobile viewports", async () => {
    renderCard();
    const toggle = screen.getByRole("button", { name: /Szczegóły zgłoszenia/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("DecisionBadge variants (AC-29)", () => {
  it("uses a distinct tone for accepted, rejected and manual review", () => {
    const tones = [accepted(), rejected(), betterPhoto()].map((d) => {
      const { unmount } = render(
        <DecisionBadge
          category={d.decision.category}
          label={d.decision.label}
        />,
      );
      const badge = screen.getByText(d.decision.label);
      const result = {
        tone: badge.getAttribute("data-tone"),
        cls: badge.className,
      };
      unmount();
      return result;
    });
    expect(tones.map((t) => t.tone)).toEqual([
      "accepted",
      "rejected",
      "manual",
    ]);
    expect(new Set(tones.map((t) => t.cls)).size).toBe(3);
  });

  it("maps complaint outcomes to the same three tones", () => {
    const cases = [
      ["complaint_accepted_repair", "accepted"],
      ["complaint_accepted_replacement_or_refund", "accepted"],
      ["complaint_rejected", "rejected"],
      ["manual_review", "manual"],
    ] as const;
    for (const [category, tone] of cases) {
      const { unmount } = render(
        <DecisionBadge category={category} label={category} />,
      );
      expect(screen.getByText(category).getAttribute("data-tone")).toBe(tone);
      unmount();
    }
  });
});

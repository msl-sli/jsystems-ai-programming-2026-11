import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AUTOMATED_DECISION_NOTICE } from "@/domain/contracts";
import { DecisionChangeHeader } from "./decision-change-header";
import { FirstMessageView } from "./first-message-view";
import { accepted, betterPhoto, rejected } from "./test-fixtures";

// Props come from the real decideWithTemplate (fixtures); I4 API captures replace them later.
describe("FirstMessageView (AC-25..AC-28)", () => {
  it.each([
    ["accepted", accepted],
    ["rejected", rejected],
    ["manual review", betterPhoto],
  ])("renders the sections in AC-25 order (%s)", (_name, make) => {
    const { firstMessage: fm } = make();
    const { container } = render(<FirstMessageView firstMessage={fm} />);
    const text = container.textContent ?? "";
    const positions = [
      fm.greeting,
      fm.decisionLabel,
      fm.justification,
      "Co widzimy na zdjęciu",
      fm.photoFindings,
      "Kolejne kroki",
      fm.nextSteps[0]!,
      AUTOMATED_DECISION_NOTICE,
    ].map((s) => text.indexOf(s));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("emphasizes the label, uses headings and a numbered list", () => {
    const { firstMessage: fm } = rejected();
    render(<FirstMessageView firstMessage={fm} />);
    expect(screen.getByText(fm.decisionLabel).tagName).toBe("STRONG");
    expect(
      screen.getByRole("heading", { name: "Co widzimy na zdjęciu" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Kolejne kroki" })).toBeTruthy();
    expect(screen.getByRole("list").tagName).toBe("OL");
    expect(screen.getAllByRole("listitem")).toHaveLength(fm.nextSteps.length);
  });

  it("ends with the AC-26 notice", () => {
    render(<FirstMessageView firstMessage={accepted().firstMessage} />);
    expect(screen.getByText(AUTOMATED_DECISION_NOTICE)).toBeTruthy();
  });

  it("shows no raw markup characters as text (AC-28)", () => {
    for (const make of [accepted, rejected, betterPhoto]) {
      const { container, unmount } = render(
        <FirstMessageView firstMessage={make().firstMessage} />,
      );
      const text = container.textContent ?? "";
      expect(text).not.toContain("**");
      expect(text).not.toContain("###");
      expect(text).not.toMatch(/<\/?[a-z]/i);
      unmount();
    }
  });
});

describe("DecisionChangeHeader (AC-33)", () => {
  const partOf = (d: ReturnType<typeof accepted>) => ({
    category: d.decision.category,
    label: d.decision.label,
    citedRuleIds: d.decision.citedRuleIds,
    manualReviewKind: d.decision.manualReviewKind,
  });

  it("shows 'Zmiana decyzji: <label>' in bold plus the notice", () => {
    const d = accepted();
    render(<DecisionChangeHeader part={partOf(d)} />);
    const header = screen.getByText(`Zmiana decyzji: ${d.decision.label}`);
    expect(header.tagName).toBe("STRONG");
    expect(screen.getByText(AUTOMATED_DECISION_NOTICE)).toBeTruthy();
  });

  it("can omit the notice when the message renders it after the text", () => {
    render(
      <DecisionChangeHeader withNotice={false} part={partOf(rejected())} />,
    );
    expect(screen.queryByText(AUTOMATED_DECISION_NOTICE)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { DeterministicFacts } from "./contracts";
import { computeFacts } from "./dates";
import { DECISION_LABELS } from "./decision-labels";
import { resolveOutcome } from "./decision-rules";

const RET = [
  "RET-1",
  "RET-2",
  "RET-3",
  "RET-4",
  "RET-5",
  "RET-6",
  "RET-7",
] as const;
const CMP = [
  "CMP-1",
  "CMP-2",
  "CMP-3",
  "CMP-4",
  "CMP-5",
  "CMP-6",
  "CMP-7",
  "CMP-8",
] as const;
const TODAY = "2026-11-26";

const day0 = computeFacts("2026-11-26", TODAY); // all windows true
const day14 = computeFacts("2026-11-12", TODAY);
const day15 = computeFacts("2026-11-11", TODAY); // return window closed, DOA open
const day30 = computeFacts("2026-10-27", TODAY);
const day31 = computeFacts("2026-10-26", TODAY); // repair zone
const months24 = computeFacts("2024-11-26", TODAY);
const months24p1 = computeFacts("2024-11-25", TODAY); // warranty closed

describe("resolveOutcome: return", () => {
  it("accepted inside the return window (day 0 and 14)", () => {
    for (const f of [day0, day14]) {
      expect(
        resolveOutcome("return", "accepted", f, ["RET-1", "RET-2"], RET),
      ).toEqual({
        ok: true,
        category: "return_accepted",
        label: DECISION_LABELS.return_accepted,
        citedRuleIds: ["RET-1", "RET-2"],
      });
    }
  });

  it("accepted outside the return window is refused (day 15, warranty irrelevant)", () => {
    expect(resolveOutcome("return", "accepted", day15, ["RET-1"], RET)).toEqual(
      {
        ok: false,
        why: "outside_return_window",
      },
    );
    expect(
      resolveOutcome("return", "accepted", months24p1, ["RET-1"], RET),
    ).toEqual({
      ok: false,
      why: "outside_return_window",
    });
  });

  it("rejected is allowed regardless of dates and never adds CMP-4", () => {
    for (const f of [day0, day15, months24p1]) {
      expect(resolveOutcome("return", "rejected", f, ["RET-2"], RET)).toEqual({
        ok: true,
        category: "return_rejected",
        label: DECISION_LABELS.return_rejected,
        citedRuleIds: ["RET-2"],
      });
    }
  });

  it("manual_review is refused when the date rule already rejects the return (AC-20)", () => {
    expect(
      resolveOutcome("return", "manual_review", day15, ["RET-4"], RET),
    ).toEqual({
      ok: false,
      why: "outside_return_window",
    });
  });

  it("manual_review is allowed inside the return window", () => {
    for (const f of [day0]) {
      expect(
        resolveOutcome("return", "manual_review", f, ["RET-3"], RET),
      ).toEqual({
        ok: true,
        category: "manual_review",
        label: DECISION_LABELS.manual_review,
        citedRuleIds: ["RET-3"],
      });
    }
  });
});

describe("resolveOutcome: complaint", () => {
  it("accepted within 30 days -> replacement or refund, CMP-4 added (day 0, 30)", () => {
    for (const f of [day0, day30]) {
      expect(
        resolveOutcome("complaint", "accepted", f, ["CMP-2"], CMP),
      ).toEqual({
        ok: true,
        category: "complaint_accepted_replacement_or_refund",
        label: DECISION_LABELS.complaint_accepted_replacement_or_refund,
        citedRuleIds: ["CMP-2", "CMP-4"],
      });
    }
  });

  it("accepted from day 31 up to 24 months -> repair, CMP-4 added", () => {
    for (const f of [day31, months24]) {
      expect(
        resolveOutcome("complaint", "accepted", f, ["CMP-1", "CMP-2"], CMP),
      ).toEqual({
        ok: true,
        category: "complaint_accepted_repair",
        label: DECISION_LABELS.complaint_accepted_repair,
        citedRuleIds: ["CMP-1", "CMP-2", "CMP-4"],
      });
    }
  });

  it("does not duplicate CMP-4 when already cited", () => {
    const r = resolveOutcome(
      "complaint",
      "accepted",
      day31,
      ["CMP-4", "CMP-2"],
      CMP,
    );
    expect(r).toMatchObject({ ok: true, citedRuleIds: ["CMP-4", "CMP-2"] });
  });

  it("keeps the first 4 ids plus CMP-4 when the list is full", () => {
    const r = resolveOutcome(
      "complaint",
      "accepted",
      day31,
      ["CMP-1", "CMP-2", "CMP-3", "CMP-5", "CMP-6"],
      CMP,
    );
    expect(r).toMatchObject({
      ok: true,
      citedRuleIds: ["CMP-1", "CMP-2", "CMP-3", "CMP-5", "CMP-4"],
    });
  });

  it("accepted outside the warranty is refused, also inside no other window", () => {
    expect(
      resolveOutcome("complaint", "accepted", months24p1, ["CMP-1"], CMP),
    ).toEqual({
      ok: false,
      why: "outside_warranty",
    });
  });

  it("manual_review is refused when the warranty has expired (AC-21)", () => {
    expect(
      resolveOutcome("complaint", "manual_review", months24p1, ["CMP-6"], CMP),
    ).toEqual({ ok: false, why: "outside_warranty" });
  });

  it("rejected and manual_review are allowed outside the warranty and add nothing", () => {
    expect(
      resolveOutcome("complaint", "rejected", months24p1, ["CMP-1"], CMP),
    ).toEqual({
      ok: true,
      category: "complaint_rejected",
      label: DECISION_LABELS.complaint_rejected,
      citedRuleIds: ["CMP-1"],
    });
    expect(
      resolveOutcome("complaint", "manual_review", day0, ["CMP-6"], CMP),
    ).toEqual({
      ok: true,
      category: "manual_review",
      label: DECISION_LABELS.manual_review,
      citedRuleIds: ["CMP-6"],
    });
  });
});

describe("resolveOutcome: rule id validation", () => {
  it("empty list -> unknown_rule_id", () => {
    expect(resolveOutcome("return", "rejected", day0, [], RET)).toEqual({
      ok: false,
      why: "unknown_rule_id",
    });
  });

  it("other case type prefix -> not_allowed_for_case_type", () => {
    expect(resolveOutcome("return", "rejected", day0, ["CMP-1"], RET)).toEqual({
      ok: false,
      why: "not_allowed_for_case_type",
    });
    expect(
      resolveOutcome("complaint", "rejected", day0, ["RET-1"], CMP),
    ).toEqual({
      ok: false,
      why: "not_allowed_for_case_type",
    });
    // foreign prefix wins over an unknown id in the same list
    expect(
      resolveOutcome("return", "rejected", day0, ["RET-99", "CMP-1"], RET),
    ).toEqual({
      ok: false,
      why: "not_allowed_for_case_type",
    });
  });

  it("id not in the loaded policy -> unknown_rule_id", () => {
    expect(
      resolveOutcome("return", "rejected", day0, ["RET-1", "RET-99"], RET),
    ).toEqual({
      ok: false,
      why: "unknown_rule_id",
    });
  });

  it("validation runs before the date checks", () => {
    expect(
      resolveOutcome("return", "accepted", day15, ["RET-99"], RET),
    ).toEqual({
      ok: false,
      why: "unknown_rule_id",
    });
  });

  it("deduplicates keeping order and caps at 5", () => {
    expect(
      resolveOutcome(
        "return",
        "rejected",
        day0,
        ["RET-2", "RET-1", "RET-2"],
        RET,
      ),
    ).toMatchObject({
      ok: true,
      citedRuleIds: ["RET-2", "RET-1"],
    });
    expect(
      resolveOutcome("return", "rejected", day0, [...RET.slice(0, 6)], RET),
    ).toMatchObject({
      ok: true,
      citedRuleIds: ["RET-1", "RET-2", "RET-3", "RET-4", "RET-5"],
    });
  });

  it("validates every unique ID before truncating to five", () => {
    expect(
      resolveOutcome(
        "return",
        "rejected",
        day0,
        ["RET-1", "RET-2", "RET-3", "RET-4", "RET-5", "RET-99"],
        RET,
      ),
    ).toEqual({ ok: false, why: "unknown_rule_id" });
  });

  it("does not mutate its inputs", () => {
    const facts: DeterministicFacts = { ...day31 };
    const ids = ["CMP-2"];
    resolveOutcome("complaint", "accepted", facts, ids, CMP);
    expect(ids).toEqual(["CMP-2"]);
    expect(facts).toEqual(day31);
  });
});

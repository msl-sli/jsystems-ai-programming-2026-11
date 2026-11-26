import { describe, expect, it } from "vitest";
import { computeFacts, todayInTimeZone } from "./dates";

describe("todayInTimeZone", () => {
  it("returns the Warsaw calendar date in winter time (UTC+1)", () => {
    expect(
      todayInTimeZone("Europe/Warsaw", new Date("2026-11-26T23:30:00Z")),
    ).toBe("2026-11-27");
    expect(
      todayInTimeZone("Europe/Warsaw", new Date("2026-11-26T22:59:00Z")),
    ).toBe("2026-11-26");
  });

  it("returns the Warsaw calendar date in summer time (UTC+2)", () => {
    expect(
      todayInTimeZone("Europe/Warsaw", new Date("2026-07-01T21:59:00Z")),
    ).toBe("2026-07-01");
    expect(
      todayInTimeZone("Europe/Warsaw", new Date("2026-07-01T22:00:00Z")),
    ).toBe("2026-07-02");
  });

  it("handles the spring-forward week (2026-03-29)", () => {
    // 00:30Z is 01:30 CET, the day before the switch at 01:00Z.
    expect(
      todayInTimeZone("Europe/Warsaw", new Date("2026-03-29T00:30:00Z")),
    ).toBe("2026-03-29");
    expect(
      todayInTimeZone("Europe/Warsaw", new Date("2026-03-28T22:30:00Z")),
    ).toBe("2026-03-28");
    expect(
      todayInTimeZone("Europe/Warsaw", new Date("2026-03-28T23:00:00Z")),
    ).toBe("2026-03-29");
    expect(
      todayInTimeZone("Europe/Warsaw", new Date("2026-03-29T22:30:00Z")),
    ).toBe("2026-03-30");
  });

  it("handles the fall-back week (2026-10-25)", () => {
    expect(
      todayInTimeZone("Europe/Warsaw", new Date("2026-10-25T22:30:00Z")),
    ).toBe("2026-10-25");
    expect(
      todayInTimeZone("Europe/Warsaw", new Date("2026-10-25T23:00:00Z")),
    ).toBe("2026-10-26");
    expect(
      todayInTimeZone("Europe/Warsaw", new Date("2026-10-24T21:59:00Z")),
    ).toBe("2026-10-24");
    expect(
      todayInTimeZone("Europe/Warsaw", new Date("2026-10-24T22:00:00Z")),
    ).toBe("2026-10-25");
  });

  it("respects other zones", () => {
    expect(todayInTimeZone("UTC", new Date("2026-11-26T23:30:00Z"))).toBe(
      "2026-11-26",
    );
    expect(
      todayInTimeZone("Pacific/Auckland", new Date("2026-11-26T12:00:00Z")),
    ).toBe("2026-11-27");
  });
});

describe("computeFacts", () => {
  it("echoes today and treats the purchase day as day 0", () => {
    const f = computeFacts("2026-11-26", "2026-11-26");
    expect(f).toEqual({
      today: "2026-11-26",
      daysSincePurchase: 0,
      withinReturnWindow: true,
      withinWarranty: true,
      withinDeadOnArrival: true,
    });
  });

  it("return window: day 14 inside, day 15 outside (RET-1)", () => {
    const d14 = computeFacts("2026-11-12", "2026-11-26");
    expect(d14.daysSincePurchase).toBe(14);
    expect(d14.withinReturnWindow).toBe(true);
    const d15 = computeFacts("2026-11-11", "2026-11-26");
    expect(d15.daysSincePurchase).toBe(15);
    expect(d15.withinReturnWindow).toBe(false);
  });

  it("dead-on-arrival: day 30 inside, day 31 outside (CMP-4)", () => {
    const d30 = computeFacts("2026-10-27", "2026-11-26");
    expect(d30.daysSincePurchase).toBe(30);
    expect(d30.withinDeadOnArrival).toBe(true);
    const d31 = computeFacts("2026-10-26", "2026-11-26");
    expect(d31.daysSincePurchase).toBe(31);
    expect(d31.withinDeadOnArrival).toBe(false);
    expect(d31.withinWarranty).toBe(true);
  });

  it("warranty: exactly 24 months inside, +1 day outside (CMP-1)", () => {
    const exact = computeFacts("2024-11-26", "2026-11-26");
    expect(exact.withinWarranty).toBe(true);
    const over = computeFacts("2024-11-25", "2026-11-26");
    expect(over.withinWarranty).toBe(false);
    expect(over.withinReturnWindow).toBe(false);
    expect(over.withinDeadOnArrival).toBe(false);
  });

  it("warranty clamps a leap-day purchase to 2026-02-28", () => {
    expect(computeFacts("2024-02-29", "2026-02-28").withinWarranty).toBe(true);
    expect(computeFacts("2024-02-29", "2026-03-01").withinWarranty).toBe(false);
  });

  it("warranty clamps month-end purchases (2025-01-31 + 24 months = 2027-01-31)", () => {
    expect(computeFacts("2025-01-31", "2027-01-31").withinWarranty).toBe(true);
    expect(computeFacts("2025-01-31", "2027-02-01").withinWarranty).toBe(false);
    // 2023-02-28 + 24 months = 2025-02-28
    expect(computeFacts("2023-02-28", "2025-02-28").withinWarranty).toBe(true);
    expect(computeFacts("2023-02-28", "2025-03-01").withinWarranty).toBe(false);
    // 2022-02-28 -> 2024-02-28 (not the leap day)
    expect(computeFacts("2022-02-28", "2024-02-29").withinWarranty).toBe(false);
  });

  it("counts calendar days across DST changes without drift", () => {
    expect(computeFacts("2026-03-28", "2026-03-30").daysSincePurchase).toBe(2);
    expect(computeFacts("2026-10-24", "2026-10-26").daysSincePurchase).toBe(2);
  });

  it("a purchase date one day ahead (client time zone skew) counts as day 0", () => {
    const f = computeFacts("2026-11-27", "2026-11-26");
    expect(f.daysSincePurchase).toBe(0);
    expect(f.withinReturnWindow).toBe(true);
    expect(f.withinWarranty).toBe(true);
    expect(f.withinDeadOnArrival).toBe(true);
  });

  it("a purchase date more than one day ahead: negative days, all windows false, no throw", () => {
    const f = computeFacts("2026-11-28", "2026-11-26");
    expect(f.daysSincePurchase).toBe(-2);
    expect(f.withinReturnWindow).toBe(false);
    expect(f.withinWarranty).toBe(false);
    expect(f.withinDeadOnArrival).toBe(false);
  });
});

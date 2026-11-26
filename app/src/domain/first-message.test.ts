import { describe, expect, it } from "vitest";
import {
  AUTOMATED_DECISION_NOTICE,
  FirstMessageSchema,
  type FirstMessage,
} from "./contracts";
import {
  buildFirstMessage,
  daysPl,
  ensurePhotoTips,
  firstMessageToText,
} from "./first-message";
import { GREETING, PHOTO_TIPS } from "./templates";

const parts = {
  decisionLabel: "Zwrot przyjęty",
  justification: "Sprzęt spełnia warunki zwrotu (RET-1).",
  photoFindings: "Zdjęcie jest wyraźne.",
  nextSteps: ["Zapakuj produkt.", "Wyślij go."],
};

describe("daysPl", () => {
  it.each([
    [1, "1 dzień"],
    [2, "2 dni"],
    [5, "5 dni"],
    [0, "0 dni"],
    [22, "22 dni"],
    [14, "14 dni"],
    [21, "21 dni"],
  ])("daysPl(%i) = %s", (n, expected) => {
    expect(daysPl(n)).toBe(expected);
  });
});

describe("buildFirstMessage", () => {
  it("adds the fixed notice and the default greeting, and validates", () => {
    const fm = buildFirstMessage(parts);
    expect(fm.notice).toBe(AUTOMATED_DECISION_NOTICE);
    expect(fm.greeting).toBe(GREETING);
    expect(FirstMessageSchema.safeParse(fm).success).toBe(true);
    expect(fm.nextSteps).toEqual(parts.nextSteps);
  });

  it("accepts a custom greeting", () => {
    expect(buildFirstMessage({ ...parts, greeting: "Witamy." }).greeting).toBe(
      "Witamy.",
    );
  });

  it("throws when a required field is empty", () => {
    expect(() => buildFirstMessage({ ...parts, justification: "" })).toThrow();
    expect(() => buildFirstMessage({ ...parts, nextSteps: [] })).toThrow();
  });
});

describe("firstMessageToText", () => {
  const fm: FirstMessage = buildFirstMessage(parts);
  const text = firstMessageToText(fm);

  it("keeps the AC-25 order", () => {
    const order = [
      fm.greeting,
      `**${fm.decisionLabel}**`,
      fm.justification,
      "Co widzimy na zdjęciu",
      fm.photoFindings,
      "Kolejne kroki",
      "1. Zapakuj produkt.",
      "2. Wyślij go.",
      fm.notice,
    ].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("uses Markdown headings and a numbered list, no raw HTML", () => {
    expect(text).toContain("### Co widzimy na zdjęciu");
    expect(text).toContain("### Kolejne kroki");
    expect(text).not.toMatch(/<[a-z/][^>]*>/i);
  });

  it("ends with the notice", () => {
    expect(text.endsWith(AUTOMATED_DECISION_NOTICE)).toBe(true);
  });
});

describe("ensurePhotoTips", () => {
  const count = (steps: string[]) =>
    steps.filter((s) => PHOTO_TIPS.includes(s)).length;

  it("appends tips until at least two are present", () => {
    const result = ensurePhotoTips(["Złóż nowe zgłoszenie."]);
    expect(result[0]).toBe("Złóż nowe zgłoszenie.");
    expect(count(result)).toBe(2);
    expect(result.slice(1)).toEqual(PHOTO_TIPS.slice(0, 2));
  });

  it("counts existing tips and adds only the missing ones", () => {
    const tip = PHOTO_TIPS[1] as string;
    const result = ensurePhotoTips(["Krok.", tip]);
    expect(count(result)).toBe(2);
    expect(result.filter((s) => s === tip)).toHaveLength(1);
  });

  it("does not change steps that already have two tips", () => {
    const steps = ["A", ...PHOTO_TIPS];
    expect(ensurePhotoTips(steps)).toEqual(steps);
  });

  it("does not mutate its input", () => {
    const steps = ["A"];
    ensurePhotoTips(steps);
    expect(steps).toEqual(["A"]);
  });
});

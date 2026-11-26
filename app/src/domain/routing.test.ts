import { describe, expect, it } from "vitest";
import { CASE_CATEGORIES, type CaseInput } from "./case-schema";
import {
  CONDITION_LEVELS,
  OBSERVED_CATEGORY_VALUES,
  PHOTO_QUALITY_VALUES,
  SCREENING_QUESTION_IDS,
  type DecisionMode,
  type DeterministicFacts,
  type Route,
  type ScreeningQuestionId,
  type ScreeningResult,
} from "./contracts";
import { categoryBelongsToCaseType } from "./decision-labels";
import {
  categoryMatches,
  certaintyOf,
  isConfident,
  routeCase,
  uncertainAreasOf,
} from "./routing";

const T = 0.8;

// ---------------------------------------------------------------- helpers

type ScreeningSpec = {
  photo?: (typeof PHOTO_QUALITY_VALUES)[number] | null;
  category?: (typeof OBSERVED_CATEGORY_VALUES)[number] | null;
  damage?: boolean | null;
  condition?: (typeof CONDITION_LEVELS)[number] | null;
  /** Certainty per question; default 0.95. */
  certainty?: Partial<Record<ScreeningQuestionId, number>>;
  refused?: ScreeningQuestionId[];
};

function screening(spec: ScreeningSpec = {}): ScreeningResult {
  const certainty = (id: ScreeningQuestionId) =>
    spec.refused?.includes(id) ? 0 : (spec.certainty?.[id] ?? 0.95);
  const answer = <V>(id: ScreeningQuestionId, value: V | null) => ({
    value: spec.refused?.includes(id) ? null : value,
    probabilities: {},
    certainty: certainty(id),
    // Deliberately wrong: routing must never trust the incoming flags.
    confident: true,
    refused: spec.refused?.includes(id) ?? false,
  });
  return {
    answers: {
      photo_quality: answer(
        "photo_quality",
        spec.photo === undefined ? "ok" : spec.photo,
      ),
      observed_category: answer(
        "observed_category",
        spec.category === undefined ? "laptop" : spec.category,
      ),
      visible_damage_or_use: answer(
        "visible_damage_or_use",
        spec.damage === undefined ? false : spec.damage,
      ),
      condition: answer(
        "condition",
        spec.condition === undefined ? 0 : spec.condition,
      ),
    },
    uncertainAreas: [],
    model: "test-model",
    promptVersion: "test",
    latencyMs: 1,
  };
}

function facts(over: Partial<DeterministicFacts> = {}): DeterministicFacts {
  return {
    today: "2026-11-25",
    daysSincePurchase: 3,
    withinReturnWindow: true,
    withinWarranty: true,
    withinDeadOnArrival: true,
    ...over,
  };
}

function caseOf(over: Partial<CaseInput> = {}): CaseInput {
  return {
    caseType: "return",
    category: "laptop",
    productName: "Laptop X",
    purchaseDate: "2026-11-22",
    description: "",
    ...over,
  };
}

const ret = (over: Partial<CaseInput> = {}) =>
  caseOf({ caseType: "return", ...over });
const cmp = (over: Partial<CaseInput> = {}) =>
  caseOf({
    caseType: "complaint",
    description: "Ekran przestał się włączać po tygodniu.",
    ...over,
  });

const route = (
  c: CaseInput,
  s: ScreeningResult,
  f: DeterministicFacts,
  mode: DecisionMode,
  threshold = T,
): Route => routeCase(c, s, f, mode, threshold);

type Expected =
  | {
      kind: "template";
      rule: string;
      category: string;
      citedRuleIds: string[];
      manualReviewKind: "better_photo" | "contact_support" | null;
    }
  | {
      kind: "llm";
      rule: string;
      uncertainAreas?: string[];
      fixedCategory?: string;
    };

// ---------------------------------------------------------------- certainty

describe("certaintyOf", () => {
  it("choice and score use the highest probability", () => {
    expect(certaintyOf("choice", { ok: 0.7, blurry: 0.2, too_dark: 0.1 })).toBe(
      0.7,
    );
    expect(
      certaintyOf("score", { "0": 0.1, "1": 0.15, "2": 0.6, "3": 0.15 }),
    ).toBe(0.6);
  });

  it("boolean uses max(p, 1 - p)", () => {
    expect(certaintyOf("boolean", { true: 0.9, false: 0.1 })).toBe(0.9);
    expect(certaintyOf("boolean", { true: 0.25 })).toBe(0.75);
  });

  it("boolean with only the false key uses 1 - false", () => {
    expect(certaintyOf("boolean", { false: 0.3 })).toBe(0.7);
    expect(certaintyOf("boolean", { false: 0.9 })).toBeCloseTo(0.9);
  });

  it("empty probabilities give 0", () => {
    expect(certaintyOf("choice", {})).toBe(0);
    expect(certaintyOf("score", {})).toBe(0);
    expect(certaintyOf("boolean", {})).toBe(0);
  });
});

describe("isConfident", () => {
  it.each([
    [0.8, true],
    [0.79, false],
    [0.81, true],
    [1, true],
    [0, false],
  ])("certainty %s at threshold 0.80 -> %s", (certainty, expected) => {
    expect(isConfident(certainty, 0.8)).toBe(expected);
  });
});

describe("uncertainAreasOf", () => {
  it("is empty when every answer is confident", () => {
    expect(uncertainAreasOf(screening(), T)).toEqual([]);
  });

  it("lists low-certainty questions in the fixed question order", () => {
    const s = screening({ certainty: { condition: 0.5, photo_quality: 0.79 } });
    expect(uncertainAreasOf(s, T)).toEqual(["photo_quality", "condition"]);
  });

  it("treats 0.80 as confident and 0.79 as uncertain", () => {
    expect(
      uncertainAreasOf(screening({ certainty: { condition: 0.8 } }), T),
    ).toEqual([]);
    expect(
      uncertainAreasOf(screening({ certainty: { condition: 0.79 } }), T),
    ).toEqual(["condition"]);
  });

  it("flags refused answers even when their certainty claims to be high", () => {
    const s = screening({ refused: ["visible_damage_or_use"] });
    s.answers.visible_damage_or_use.certainty = 0.99;
    expect(uncertainAreasOf(s, T)).toEqual(["visible_damage_or_use"]);
  });

  it("flags an unrefused answer with a null value (tampered input)", () => {
    expect(uncertainAreasOf(screening({ condition: null }), T)).toEqual([
      "condition",
    ]);
  });

  it("ignores the incoming confident flag and uncertainAreas list", () => {
    const s = screening({ certainty: { observed_category: 0.1 } });
    s.uncertainAreas = [];
    s.answers.observed_category.confident = true;
    expect(uncertainAreasOf(s, T)).toEqual(["observed_category"]);
  });

  it("uses the threshold that is passed in", () => {
    const s = screening({ certainty: { condition: 0.9 } });
    expect(uncertainAreasOf(s, 0.95)).toEqual(["condition"]);
    expect(uncertainAreasOf(s, 0.9)).toEqual([]);
  });
});

// ---------------------------------------------------------------- category match

describe("categoryMatches", () => {
  const concrete = CASE_CATEGORIES.filter((c) => c !== "other");

  it.each(
    concrete.flatMap((form) =>
      OBSERVED_CATEGORY_VALUES.map((obs) => [form, obs] as const),
    ),
  )("form %s vs observed %s", (form, observed) => {
    expect(categoryMatches(form, observed)).toBe(observed === form);
  });

  it.each(OBSERVED_CATEGORY_VALUES.map((o) => [o] as const))(
    "form other vs observed %s",
    (o) => {
      expect(categoryMatches("other", o)).toBe(o !== "no_device");
    },
  );

  it("form other accepts other_electronics", () => {
    expect(categoryMatches("other", "other_electronics")).toBe(true);
  });

  it("form laptop does not accept other_electronics", () => {
    expect(categoryMatches("laptop", "other_electronics")).toBe(false);
  });

  it("no_device never matches", () => {
    for (const form of CASE_CATEGORIES)
      expect(categoryMatches(form, "no_device")).toBe(false);
  });
});

// ---------------------------------------------------------------- routing table

type Row = {
  name: string;
  c: CaseInput;
  s: ScreeningResult;
  f: DeterministicFacts;
  hybrid: Expected;
  decisionsOnly: Expected;
  llmAlways: Expected;
};

const outsideWindow = facts({
  withinReturnWindow: false,
  daysSincePurchase: 20,
});
const outsideWarranty = facts({
  withinWarranty: false,
  withinDeadOnArrival: false,
});
const afterDoa = facts({ withinDeadOnArrival: false });

const tpl = (
  rule: string,
  category: string,
  citedRuleIds: string[],
  manualReviewKind: "better_photo" | "contact_support" | null = null,
): Expected => ({
  kind: "template",
  rule,
  category,
  citedRuleIds,
  manualReviewKind,
});
const llm = (
  rule: string,
  extra: { uncertainAreas?: string[]; fixedCategory?: string } = {},
) => ({ kind: "llm", rule, ...extra }) as Expected;

const rows: Row[] = [
  {
    name: "R1 return outside the window",
    c: ret(),
    s: screening(),
    f: outsideWindow,
    hybrid: tpl("R1", "return_rejected", ["RET-1"]),
    decisionsOnly: tpl("R1", "return_rejected", ["RET-1"]),
    llmAlways: llm("R1", {
      fixedCategory: "return_rejected",
      uncertainAreas: [],
    }),
  },
  {
    name: "R2 complaint outside the warranty",
    c: cmp(),
    s: screening(),
    f: outsideWarranty,
    hybrid: tpl("R2", "complaint_rejected", ["CMP-1"]),
    decisionsOnly: tpl("R2", "complaint_rejected", ["CMP-1"]),
    llmAlways: llm("R2", {
      fixedCategory: "complaint_rejected",
      uncertainAreas: [],
    }),
  },
  {
    name: "R3 return, uncertain damage answer",
    c: ret(),
    s: screening({ certainty: { visible_damage_or_use: 0.6 } }),
    f: facts(),
    hybrid: llm("R3", { uncertainAreas: ["visible_damage_or_use"] }),
    decisionsOnly: tpl("R3", "manual_review", ["RET-4"], "contact_support"),
    llmAlways: llm("R3", { uncertainAreas: ["visible_damage_or_use"] }),
  },
  {
    name: "R3 return, uncertain photo quality",
    c: ret(),
    s: screening({ certainty: { photo_quality: 0.5, condition: 0.5 } }),
    f: facts(),
    hybrid: llm("R3", { uncertainAreas: ["photo_quality", "condition"] }),
    decisionsOnly: tpl("R3", "manual_review", ["RET-3"], "better_photo"),
    llmAlways: llm("R3", { uncertainAreas: ["photo_quality", "condition"] }),
  },
  {
    name: "R3 return, refused photo quality",
    c: ret(),
    s: screening({ refused: ["photo_quality"] }),
    f: facts(),
    hybrid: llm("R3", { uncertainAreas: ["photo_quality"] }),
    decisionsOnly: tpl("R3", "manual_review", ["RET-3"], "better_photo"),
    llmAlways: llm("R3", { uncertainAreas: ["photo_quality"] }),
  },
  {
    name: "R3 complaint, uncertain condition",
    c: cmp(),
    s: screening({ certainty: { condition: 0.7 } }),
    f: facts(),
    hybrid: llm("R3", { uncertainAreas: ["condition"] }),
    decisionsOnly: tpl("R3", "manual_review", ["CMP-6"], "contact_support"),
    llmAlways: llm("R3", { uncertainAreas: ["condition"] }),
  },
  {
    name: "R3 complaint, uncertain photo quality",
    c: cmp(),
    s: screening({ certainty: { photo_quality: 0.7 } }),
    f: facts(),
    hybrid: llm("R3", { uncertainAreas: ["photo_quality"] }),
    decisionsOnly: tpl("R3", "manual_review", ["CMP-6"], "better_photo"),
    llmAlways: llm("R3", { uncertainAreas: ["photo_quality"] }),
  },
  {
    name: "R4 return, blurry photo",
    c: ret(),
    s: screening({ photo: "blurry" }),
    f: facts(),
    hybrid: tpl("R4", "manual_review", ["RET-3"], "better_photo"),
    decisionsOnly: tpl("R4", "manual_review", ["RET-3"], "better_photo"),
    llmAlways: llm("R4"),
  },
  {
    name: "R4 complaint, device not fully visible",
    c: cmp(),
    s: screening({ photo: "device_not_fully_visible" }),
    f: facts(),
    hybrid: tpl("R4", "manual_review", ["CMP-6"], "better_photo"),
    decisionsOnly: tpl("R4", "manual_review", ["CMP-6"], "better_photo"),
    llmAlways: llm("R4"),
  },
  {
    name: "R5 return, observed category differs",
    c: ret({ category: "laptop" }),
    s: screening({ category: "tablet" }),
    f: facts(),
    hybrid: tpl("R5", "manual_review", ["RET-3"], "better_photo"),
    decisionsOnly: tpl("R5", "manual_review", ["RET-3"], "better_photo"),
    llmAlways: llm("R5"),
  },
  {
    name: "R5 complaint, no device observed (photo ok)",
    c: cmp({ category: "other" }),
    s: screening({ category: "no_device" }),
    f: facts(),
    hybrid: tpl("R5", "manual_review", ["CMP-6"], "better_photo"),
    decisionsOnly: tpl("R5", "manual_review", ["CMP-6"], "better_photo"),
    llmAlways: llm("R5"),
  },
  {
    name: "R6 return with a description, otherwise acceptable",
    c: ret({ description: "Zmieniłem zdanie." }),
    s: screening(),
    f: facts(),
    hybrid: llm("R6", { uncertainAreas: [] }),
    decisionsOnly: tpl("R8", "return_accepted", ["RET-1", "RET-2"]),
    llmAlways: llm("R6"),
  },
  {
    name: "R6 return with a description, signs of use (decisions-only continues to R7)",
    c: ret({ description: "Spadł mi raz." }),
    s: screening({ damage: true, condition: 2 }),
    f: facts(),
    hybrid: llm("R6"),
    decisionsOnly: tpl("R7", "return_rejected", ["RET-2"]),
    llmAlways: llm("R6"),
  },
  {
    name: "R6 whitespace-only description does not count",
    c: ret({ description: "   " }),
    s: screening(),
    f: facts(),
    hybrid: tpl("R8", "return_accepted", ["RET-1", "RET-2"]),
    decisionsOnly: tpl("R8", "return_accepted", ["RET-1", "RET-2"]),
    llmAlways: llm("R8"),
  },
  {
    name: "R6 description on a contradictory return (decisions-only continues to R9)",
    c: ret({ description: "Coś jest nie tak." }),
    s: screening({ damage: true, condition: 0 }),
    f: facts(),
    hybrid: llm("R6"),
    decisionsOnly: tpl("R9", "manual_review", ["RET-4"], "contact_support"),
    llmAlways: llm("R6"),
  },
  {
    name: "R7 return, damage and condition 1",
    c: ret(),
    s: screening({ damage: true, condition: 1 }),
    f: facts(),
    hybrid: tpl("R7", "return_rejected", ["RET-2"]),
    decisionsOnly: tpl("R7", "return_rejected", ["RET-2"]),
    llmAlways: llm("R7"),
  },
  {
    name: "R7 return, damage and condition 3",
    c: ret(),
    s: screening({ damage: true, condition: 3 }),
    f: facts(),
    hybrid: tpl("R7", "return_rejected", ["RET-2"]),
    decisionsOnly: tpl("R7", "return_rejected", ["RET-2"]),
    llmAlways: llm("R7"),
  },
  {
    name: "R8 return, no damage and condition 0",
    c: ret(),
    s: screening({ damage: false, condition: 0 }),
    f: facts(),
    hybrid: tpl("R8", "return_accepted", ["RET-1", "RET-2"]),
    decisionsOnly: tpl("R8", "return_accepted", ["RET-1", "RET-2"]),
    llmAlways: llm("R8"),
  },
  {
    name: "R9 return, damage true with condition 0",
    c: ret(),
    s: screening({ damage: true, condition: 0 }),
    f: facts(),
    hybrid: llm("R9"),
    decisionsOnly: tpl("R9", "manual_review", ["RET-4"], "contact_support"),
    llmAlways: llm("R9"),
  },
  {
    name: "R9 return, damage false with condition 2",
    c: ret(),
    s: screening({ damage: false, condition: 2 }),
    f: facts(),
    hybrid: llm("R9"),
    decisionsOnly: tpl("R9", "manual_review", ["RET-4"], "contact_support"),
    llmAlways: llm("R9"),
  },
  {
    name: "R9 return, damage false with condition 1",
    c: ret(),
    s: screening({ damage: false, condition: 1 }),
    f: facts(),
    hybrid: llm("R9"),
    decisionsOnly: tpl("R9", "manual_review", ["RET-4"], "contact_support"),
    llmAlways: llm("R9"),
  },
  {
    name: "R10 complaint, no damage, within dead-on-arrival",
    c: cmp(),
    s: screening({ damage: false, condition: 0 }),
    f: facts({ withinDeadOnArrival: true }),
    hybrid: llm("R10"),
    decisionsOnly: tpl("R10", "complaint_accepted_replacement_or_refund", [
      "CMP-6",
      "CMP-4",
    ]),
    llmAlways: llm("R10"),
  },
  {
    name: "R10 complaint, no damage, after dead-on-arrival",
    c: cmp(),
    s: screening({ damage: false, condition: 1 }),
    f: afterDoa,
    hybrid: llm("R10"),
    decisionsOnly: tpl("R10", "complaint_accepted_repair", ["CMP-6", "CMP-4"]),
    llmAlways: llm("R10"),
  },
  {
    name: "R10 complaint, damage visible",
    c: cmp(),
    s: screening({ damage: true, condition: 3 }),
    f: facts(),
    hybrid: llm("R10"),
    decisionsOnly: tpl("R10", "manual_review", ["CMP-6"], "contact_support"),
    llmAlways: llm("R10"),
  },
  {
    name: "R10 complaint, damage visible after dead-on-arrival",
    c: cmp({ category: "other" }),
    s: screening({ damage: true, condition: 2, category: "other_electronics" }),
    f: afterDoa,
    hybrid: llm("R10"),
    decisionsOnly: tpl("R10", "manual_review", ["CMP-6"], "contact_support"),
    llmAlways: llm("R10"),
  },
];

describe("routeCase table (ADR-003 section 3.3)", () => {
  const modes: [
    DecisionMode,
    keyof Pick<Row, "hybrid" | "decisionsOnly" | "llmAlways">,
  ][] = [
    ["hybrid", "hybrid"],
    ["decisions-only", "decisionsOnly"],
    ["llm-always", "llmAlways"],
  ];

  for (const row of rows) {
    describe(row.name, () => {
      it.each(modes)("%s", (mode, key) => {
        const expected = row[key];
        const actual = route(row.c, row.s, row.f, mode);
        if (expected.kind === "llm") {
          expect(actual).toEqual({ uncertainAreas: [], ...expected });
        } else {
          expect(actual).toEqual(expected);
        }
      });
    });
  }
});

// ---------------------------------------------------------------- order, boundaries, refusal

describe("first match wins", () => {
  it("R1 beats R3 (uncertain answers do not matter outside the return window)", () => {
    const s = screening({ certainty: { photo_quality: 0.1 } });
    expect(route(ret(), s, outsideWindow, "hybrid")).toMatchObject({
      kind: "template",
      rule: "R1",
    });
    expect(route(ret(), s, outsideWindow, "decisions-only")).toMatchObject({
      rule: "R1",
    });
  });

  it("R1 beats R2 is irrelevant by case type; R2 beats R3", () => {
    const s = screening({ refused: ["condition"] });
    expect(route(cmp(), s, outsideWarranty, "hybrid")).toMatchObject({
      rule: "R2",
    });
  });

  it("a return ignores warranty facts and a complaint ignores the return window", () => {
    expect(
      route(ret(), screening(), facts({ withinWarranty: false }), "hybrid"),
    ).toMatchObject({
      rule: "R8",
    });
    expect(
      route(cmp(), screening(), facts({ withinReturnWindow: false }), "hybrid"),
    ).toMatchObject({
      rule: "R10",
    });
  });

  it("R3 beats R4 when the photo answer itself is uncertain", () => {
    const s = screening({ photo: "blurry", certainty: { photo_quality: 0.6 } });
    expect(route(ret(), s, facts(), "hybrid")).toMatchObject({
      kind: "llm",
      rule: "R3",
    });
  });

  it("R4 beats R5", () => {
    const s = screening({ photo: "too_dark", category: "tablet" });
    expect(route(ret(), s, facts(), "hybrid")).toMatchObject({ rule: "R4" });
    expect(route(ret(), s, facts(), "llm-always")).toMatchObject({
      kind: "llm",
      rule: "R4",
    });
  });

  it("R5 beats R6 and R7", () => {
    const s = screening({ category: "tv", damage: true, condition: 2 });
    expect(
      route(ret({ description: "x" }), s, facts(), "hybrid"),
    ).toMatchObject({ rule: "R5" });
    expect(route(ret(), s, facts(), "hybrid")).toMatchObject({ rule: "R5" });
  });

  it("R6 beats R7 and R8 in hybrid", () => {
    expect(
      route(ret({ description: "x" }), screening(), facts(), "hybrid"),
    ).toMatchObject({
      kind: "llm",
      rule: "R6",
    });
  });

  it("R6 applies to returns only", () => {
    const r = route(
      cmp({ description: "Opis reklamacji dłuższy niż dwadzieścia znaków" }),
      screening(),
      facts(),
      "hybrid",
    );
    expect(r).toMatchObject({ rule: "R10" });
  });
});

describe("certainty threshold boundary", () => {
  it("0.80 is confident: no escalation", () => {
    const s = screening({ certainty: { visible_damage_or_use: 0.8 } });
    expect(route(ret(), s, facts(), "hybrid")).toMatchObject({
      kind: "template",
      rule: "R8",
    });
  });

  it("0.79 is not confident: R3 escalation", () => {
    const s = screening({ certainty: { visible_damage_or_use: 0.79 } });
    expect(route(ret(), s, facts(), "hybrid")).toEqual({
      kind: "llm",
      rule: "R3",
      uncertainAreas: ["visible_damage_or_use"],
    });
  });

  it("the passed threshold decides, not the incoming confident flag", () => {
    const s = screening({ certainty: { condition: 0.9 } });
    expect(route(ret(), s, facts(), "hybrid", 0.95)).toMatchObject({
      kind: "llm",
      rule: "R3",
    });
    expect(route(ret(), s, facts(), "hybrid", 0.9)).toMatchObject({
      kind: "template",
    });
  });
});

describe("refusal", () => {
  it("a refused answer (value null) escalates in hybrid", () => {
    const s = screening({ refused: ["condition"] });
    expect(s.answers.condition.value).toBeNull();
    expect(route(ret(), s, facts(), "hybrid")).toEqual({
      kind: "llm",
      rule: "R3",
      uncertainAreas: ["condition"],
    });
  });

  it("all four refused: every area is uncertain, in question order", () => {
    const s = screening({ refused: [...SCREENING_QUESTION_IDS] });
    expect(route(cmp(), s, facts(), "llm-always")).toEqual({
      kind: "llm",
      rule: "R3",
      uncertainAreas: [...SCREENING_QUESTION_IDS],
    });
  });

  it("decisions-only: a refusal becomes manual review", () => {
    const s = screening({ refused: ["visible_damage_or_use"] });
    expect(route(cmp(), s, facts(), "decisions-only")).toMatchObject({
      kind: "template",
      category: "manual_review",
      rule: "R3",
      manualReviewKind: "contact_support",
    });
  });
});

describe("contradictory screening", () => {
  const s = screening({ damage: true, condition: 0 });
  it("hybrid goes to the LLM (R9)", () => {
    expect(route(ret(), s, facts(), "hybrid")).toMatchObject({
      kind: "llm",
      rule: "R9",
    });
  });
  it("decisions-only gives manual review RET-4", () => {
    expect(route(ret(), s, facts(), "decisions-only")).toEqual({
      kind: "template",
      rule: "R9",
      category: "manual_review",
      citedRuleIds: ["RET-4"],
      manualReviewKind: "contact_support",
    });
  });
});

describe("form category other", () => {
  it("accepts other_electronics for a return and continues down the table", () => {
    const s = screening({ category: "other_electronics" });
    expect(
      route(ret({ category: "other" }), s, facts(), "hybrid"),
    ).toMatchObject({ rule: "R8" });
  });
  it("rejects no_device (R5)", () => {
    const s = screening({ category: "no_device" });
    expect(
      route(ret({ category: "other" }), s, facts(), "hybrid"),
    ).toMatchObject({ rule: "R5" });
  });
  it("laptop form vs other_electronics is R5", () => {
    const s = screening({ category: "other_electronics" });
    expect(
      route(ret({ category: "laptop" }), s, facts(), "hybrid"),
    ).toMatchObject({ rule: "R5" });
  });
});

// ---------------------------------------------------------------- AC-16 property

describe("AC-16: a route never yields a category of the other case type", () => {
  const photos = [...PHOTO_QUALITY_VALUES];
  const cats = [...OBSERVED_CATEGORY_VALUES];
  const bools = [true, false];
  const levels = [...CONDITION_LEVELS];
  const certainties = [0.5, 0.95];
  const factVariants = [
    facts(),
    outsideWindow,
    outsideWarranty,
    afterDoa,
    facts({
      withinReturnWindow: false,
      withinWarranty: false,
      withinDeadOnArrival: false,
    }),
  ];
  const modes: DecisionMode[] = ["hybrid", "decisions-only", "llm-always"];

  it("holds across the whole input grid", () => {
    let checked = 0;
    for (const caseType of ["return", "complaint"] as const) {
      for (const form of ["laptop", "other"] as const) {
        for (const description of ["", "opis opis opis opis opis"]) {
          const c = caseOf({ caseType, category: form, description });
          for (const photo of photos)
            for (const category of cats)
              for (const damage of bools)
                for (const condition of levels)
                  for (const cert of certainties)
                    for (const f of factVariants)
                      for (const mode of modes) {
                        const r = route(
                          c,
                          screening({
                            photo,
                            category,
                            damage,
                            condition,
                            certainty: { condition: cert },
                          }),
                          f,
                          mode,
                        );
                        checked++;
                        if (r.kind === "template") {
                          expect(
                            categoryBelongsToCaseType(caseType, r.category),
                          ).toBe(true);
                        } else if (r.fixedCategory !== undefined) {
                          expect(
                            categoryBelongsToCaseType(
                              caseType,
                              r.fixedCategory,
                            ),
                          ).toBe(true);
                        }
                      }
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
  });
});

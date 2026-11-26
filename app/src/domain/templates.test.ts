import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CaseInput } from "./case-schema";
import { CASE_CATEGORY_LABELS } from "./case-schema";
import {
  AUTOMATED_DECISION_NOTICE,
  DecisionResultSchema,
  FirstMessageSchema,
  type DecisionCategory,
  type DeterministicFacts,
  type RouteRule,
  type ScreeningResult,
  type TemplateRoute,
} from "./contracts";
import { computeFacts } from "./dates";
import { DECISION_LABELS } from "./decision-labels";
import { daysPl, firstMessageToText } from "./first-message";
import {
  GREETING,
  OFF_TOPIC_SENTENCE,
  PHOTO_TIPS,
  SUPPORT_EMAIL,
  TEMPLATE_POLICY_FACTS,
  decideWithTemplate,
} from "./templates";

const TODAY = "2026-11-26";
const RET = ["RET-1", "RET-2", "RET-3", "RET-4", "RET-5", "RET-6", "RET-7"];
const CMP = [
  "CMP-1",
  "CMP-2",
  "CMP-3",
  "CMP-4",
  "CMP-5",
  "CMP-6",
  "CMP-7",
  "CMP-8",
];

const policyDir = path.resolve(import.meta.dirname, "../../../docs/policies");
const policyText = {
  return: readFileSync(path.join(policyDir, "return-policy.md"), "utf8"),
  complaint: readFileSync(path.join(policyDir, "complaint-policy.md"), "utf8"),
};

// ---------------------------------------------------------------- fixtures

type Overrides = Partial<{
  photo: string | null;
  observed: string | null;
  damage: boolean | null;
  condition: number | null;
  unconfident: string[];
  refused: string[];
}>;

function screening(o: Overrides = {}): ScreeningResult {
  const unconfident = o.unconfident ?? [];
  const refused = o.refused ?? [];
  const ans = <T>(id: string, value: T) => {
    const isRefused = refused.includes(id);
    return {
      value: isRefused ? null : value,
      probabilities: {},
      certainty: isRefused ? 0 : unconfident.includes(id) ? 0.5 : 0.95,
      confident: !isRefused && !unconfident.includes(id),
      refused: isRefused,
    };
  };
  return {
    answers: {
      photo_quality: ans("photo_quality", o.photo ?? "ok"),
      observed_category: ans("observed_category", o.observed ?? "smartphone"),
      visible_damage_or_use: ans("visible_damage_or_use", o.damage ?? false),
      condition: ans("condition", o.condition ?? 0),
    },
    uncertainAreas: [...unconfident, ...refused],
    model: "test-model",
    promptVersion: "test",
    latencyMs: 1,
  } as unknown as ScreeningResult;
}

const returnCase: CaseInput = {
  caseType: "return",
  category: "smartphone",
  productName: "Telefon X",
  purchaseDate: "2026-11-06",
  description: "",
};
const complaintCase: CaseInput = {
  ...returnCase,
  caseType: "complaint",
  description: "Ekran przestał reagować na dotyk po tygodniu.",
};

const facts = (purchaseDate: string) => computeFacts(purchaseDate, TODAY);
const FACTS_IN = facts("2026-11-06"); // 20 days: in warranty, DOA, return closed
const FACTS_RET_OK = facts("2026-11-23"); // 3 days
const FACTS_REPAIR = facts("2026-09-01"); // 86 days
const FACTS_OLD = facts("2023-01-01");

function route(
  rule: RouteRule,
  category: DecisionCategory,
  citedRuleIds: string[],
  manualReviewKind: TemplateRoute["manualReviewKind"] = null,
): TemplateRoute {
  return { kind: "template", rule, category, citedRuleIds, manualReviewKind };
}

interface Scenario {
  name: string;
  caseInput: CaseInput;
  route: TemplateRoute;
  screening: ScreeningResult;
  facts: DeterministicFacts;
  expectedCited: string[];
}

const scenarios: Scenario[] = [
  {
    name: "R1 return outside window",
    caseInput: returnCase,
    route: route("R1", "return_rejected", ["RET-1"]),
    screening: screening(),
    facts: FACTS_IN,
    expectedCited: ["RET-1"],
  },
  {
    name: "R2 complaint outside warranty",
    caseInput: complaintCase,
    route: route("R2", "complaint_rejected", ["CMP-1"]),
    screening: screening(),
    facts: FACTS_OLD,
    expectedCited: ["CMP-1"],
  },
  {
    name: "R3 better_photo (decisions-only)",
    caseInput: returnCase,
    route: route("R3", "manual_review", ["RET-3"], "better_photo"),
    screening: screening({ unconfident: ["photo_quality"] }),
    facts: FACTS_RET_OK,
    expectedCited: ["RET-3"],
  },
  {
    name: "R3 contact_support (decisions-only)",
    caseInput: complaintCase,
    route: route("R3", "manual_review", ["CMP-6"], "contact_support"),
    screening: screening({
      unconfident: ["condition"],
      refused: ["visible_damage_or_use"],
    }),
    facts: FACTS_REPAIR,
    expectedCited: ["CMP-6"],
  },
  ...(
    [
      ["blurry", "nieostre"],
      ["too_dark", "ciemne"],
      ["device_not_fully_visible", "w całości"],
      ["no_device", "nie widać sprzętu"],
    ] as const
  ).map(([photo]): Scenario => ({
    name: `R4 ${photo}`,
    caseInput: returnCase,
    route: route("R4", "manual_review", ["RET-3"], "better_photo"),
    screening: screening({ photo }),
    facts: FACTS_RET_OK,
    expectedCited: ["RET-3"],
  })),
  {
    name: "R5 other category",
    caseInput: complaintCase,
    route: route("R5", "manual_review", ["CMP-6"], "better_photo"),
    screening: screening({ observed: "laptop" }),
    facts: FACTS_REPAIR,
    expectedCited: ["CMP-6"],
  },
  {
    name: "R5 observed no_device",
    caseInput: returnCase,
    route: route("R5", "manual_review", ["RET-3"], "better_photo"),
    screening: screening({ observed: "no_device" }),
    facts: FACTS_RET_OK,
    expectedCited: ["RET-3"],
  },
  {
    name: "R7 return rejected for use",
    caseInput: returnCase,
    route: route("R7", "return_rejected", ["RET-2"]),
    screening: screening({ damage: true, condition: 2 }),
    facts: FACTS_RET_OK,
    expectedCited: ["RET-2"],
  },
  {
    name: "R8 return accepted",
    caseInput: returnCase,
    route: route("R8", "return_accepted", ["RET-1", "RET-2"]),
    screening: screening(),
    facts: FACTS_RET_OK,
    expectedCited: ["RET-1", "RET-2"],
  },
  {
    name: "R9 contradictory signals",
    caseInput: returnCase,
    route: route("R9", "manual_review", ["RET-4"], "contact_support"),
    screening: screening({ damage: true, condition: 0 }),
    facts: FACTS_RET_OK,
    expectedCited: ["RET-4"],
  },
  {
    name: "R10 accepted repair",
    caseInput: complaintCase,
    route: route("R10", "complaint_accepted_repair", ["CMP-6"]),
    screening: screening(),
    facts: FACTS_REPAIR,
    expectedCited: ["CMP-6", "CMP-4"],
  },
  {
    name: "R10 accepted replacement or refund",
    caseInput: complaintCase,
    route: route("R10", "complaint_accepted_replacement_or_refund", [
      "CMP-6",
      "CMP-4",
    ]),
    screening: screening(),
    facts: FACTS_IN,
    expectedCited: ["CMP-6", "CMP-4"],
  },
  {
    name: "R10 manual review (damage)",
    caseInput: complaintCase,
    route: route("R10", "manual_review", ["CMP-6"], "contact_support"),
    screening: screening({ damage: true, condition: 3 }),
    facts: FACTS_REPAIR,
    expectedCited: ["CMP-6"],
  },
];

const policyIds = (c: CaseInput) => (c.caseType === "return" ? RET : CMP);
const run = (s: Scenario, mode: "hybrid" | "decisions-only" = "hybrid") =>
  decideWithTemplate(
    s.route,
    s.caseInput,
    s.screening,
    s.facts,
    mode,
    policyIds(s.caseInput),
  );

// ---------------------------------------------------------------- constants

describe("constants", () => {
  it("OFF_TOPIC_SENTENCE is verbatim (AC-35)", () => {
    expect(OFF_TOPIC_SENTENCE).toBe(
      "Mogę pomóc tylko w sprawie tego zgłoszenia — zwrotu lub reklamacji i związanych z nimi procedur.",
    );
  });
  it("has support e-mail, a greeting and at least three distinct photo tips", () => {
    expect(SUPPORT_EMAIL).toBe("support@example.com");
    expect(GREETING.length).toBeGreaterThan(0);
    expect(PHOTO_TIPS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(PHOTO_TIPS).size).toBe(PHOTO_TIPS.length);
  });
});

// ---------------------------------------------------------------- every template route

describe.each(scenarios)("template route: $name", (s) => {
  const { decision, firstMessage } = run(s, "decisions-only");
  const text = firstMessageToText(firstMessage);

  it("derives category, label and rule IDs through resolveOutcome", () => {
    expect(decision.category).toBe(s.route.category);
    expect(decision.label).toBe(DECISION_LABELS[s.route.category]);
    expect(decision.citedRuleIds).toEqual(s.expectedCited);
    expect(decision.decisionPath).toBe("template");
    expect(decision.routeRule).toBe(s.route.rule);
    expect(decision.mode).toBe("decisions-only");
    expect(decision.manualReviewKind).toBe(s.route.manualReviewKind);
  });

  it("satisfies the contracts and AC-25 / AC-26", () => {
    expect(DecisionResultSchema.safeParse(decision).success).toBe(true);
    expect(FirstMessageSchema.safeParse(firstMessage).success).toBe(true);
    expect(firstMessage.greeting).toBe(GREETING);
    expect(firstMessage.decisionLabel).toBe(decision.label);
    expect(firstMessage.justification).toBe(decision.justification);
    expect(firstMessage.photoFindings).toBe(decision.photoFindingsSummary);
    expect(firstMessage.nextSteps).toEqual(decision.nextSteps);
    expect(firstMessage.notice).toBe(AUTOMATED_DECISION_NOTICE);
    expect(decision.justification.trim().length).toBeGreaterThan(20);
    expect(decision.photoFindingsSummary.trim().length).toBeGreaterThan(10);
  });

  it("cites a rule ID inline (AC-24)", () => {
    expect(decision.justification).toMatch(
      /\((RET|CMP)-\d+(, (RET|CMP)-\d+)*\)/,
    );
    for (const id of decision.citedRuleIds) {
      expect(decision.justification).toContain(id);
    }
  });

  it("is Polish, gender-neutral, free of percentages and raw HTML", () => {
    expect(text).toMatch(/[ąćęłńóśźż]/);
    expect(text).not.toMatch(/\bPan(i|u|a)?\b/);
    expect(text).not.toContain("%");
    expect(text).not.toMatch(/<[a-z/][^>]*>/i);
    expect(text).not.toMatch(/\bAI\b|sztuczn/i);
  });

  it("gives at least two photo tips for better_photo (AC-23)", () => {
    const tips = decision.nextSteps.filter((step) => PHOTO_TIPS.includes(step));
    if (s.route.manualReviewKind === "better_photo") {
      expect(tips.length).toBeGreaterThanOrEqual(2);
      expect(decision.nextSteps.join(" ")).toMatch(/nowe zgłoszenie/);
    } else {
      expect(tips).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------- rule-specific content

const byName = (name: string) => {
  const s = scenarios.find((x) => x.name === name);
  if (!s) throw new Error(name);
  return s;
};

describe("justifications", () => {
  it("R1 states the day count and the 14-day limit (AC-20)", () => {
    const { decision } = run(byName("R1 return outside window"));
    expect(decision.justification).toContain("20 dni od zakupu");
    expect(decision.justification).toContain("14 dni");
    expect(decision.nextSteps.join(" ")).toContain("reklamację");
    expect(decision.nextSteps.join(" ")).toContain("24 miesiące");
    expect(decision.nextSteps.join(" ")).toContain(SUPPORT_EMAIL);
  });

  it.each([
    [1, "1 dzień"],
    [2, "2 dni"],
    [5, "5 dni"],
    [22, "22 dni"],
  ])("R1 uses the plural form for %i day(s)", (n, expected) => {
    const s = byName("R1 return outside window");
    const f = { ...s.facts, daysSincePurchase: n };
    const { decision } = decideWithTemplate(
      s.route,
      s.caseInput,
      s.screening,
      f,
      "hybrid",
      RET,
    );
    expect(decision.justification).toContain(`${expected} od zakupu`);
    expect(daysPl(n)).toBe(expected);
  });

  it("R2 cites the 24-month warranty (AC-21)", () => {
    const { decision, firstMessage } = run(
      byName("R2 complaint outside warranty"),
    );
    expect(decision.justification).toContain("24 miesiące");
    expect(decision.justification).toContain("CMP-1");
    expect(firstMessage.nextSteps).toEqual([
      `Płatna naprawa jest dostępna po kontakcie z obsługą: ${SUPPORT_EMAIL}.`,
    ]);
  });

  it("R3 says what could not be assessed", () => {
    const a = run(byName("R3 better_photo (decisions-only)")).decision;
    expect(a.justification).toContain("jakości zdjęcia");
    const b = run(byName("R3 contact_support (decisions-only)")).decision;
    expect(b.justification).toContain("stanu sprzętu");
    expect(b.justification).toContain("uszkodzeń lub śladów używania");
    expect(b.photoFindingsSummary).toMatch(/nie udało się ocenić/i);
    expect(b.nextSteps.join(" ")).toContain(SUPPORT_EMAIL);
  });

  it("R3 falls back to a generic phrase when no area is flagged", () => {
    const s = byName("R3 contact_support (decisions-only)");
    const { decision } = decideWithTemplate(
      s.route,
      s.caseInput,
      screening(),
      s.facts,
      "decisions-only",
      CMP,
    );
    expect(decision.justification).toContain("części oceny");
  });

  it.each([
    ["R4 blurry", "nieostre"],
    ["R4 too_dark", "ciemne"],
    ["R4 device_not_fully_visible", "w całości"],
    ["R4 no_device", "nie widać sprzętu"],
  ])("%s names the specific photo problem", (name, word) => {
    const { decision } = run(byName(name));
    expect(decision.justification).toContain(word);
  });

  it("R4 stays generic when the photo answer is missing", () => {
    const s = byName("R4 blurry");
    const { decision } = decideWithTemplate(
      s.route,
      s.caseInput,
      screening({ refused: ["photo_quality"] }),
      s.facts,
      "hybrid",
      RET,
    );
    expect(decision.justification).toContain("Zdjęcie nie pozwala");
  });

  it("R5 names observed and selected category", () => {
    const a = run(byName("R5 other category")).decision;
    expect(a.justification).toContain("laptop");
    expect(a.justification).toContain(CASE_CATEGORY_LABELS.smartphone);
    const b = run(byName("R5 observed no_device")).decision;
    expect(b.justification).toContain("nie widać sprzętu");
    expect(b.justification).toContain(CASE_CATEGORY_LABELS.smartphone);
  });

  it("R5 stays generic when the observed category is missing", () => {
    const s = byName("R5 other category");
    const { decision } = decideWithTemplate(
      s.route,
      s.caseInput,
      screening({ refused: ["observed_category"] }),
      s.facts,
      "hybrid",
      CMP,
    );
    expect(decision.justification).toContain(CASE_CATEGORY_LABELS.smartphone);
  });

  it("R7 describes the screening result and offers the complaint path", () => {
    const { decision } = run(byName("R7 return rejected for use"));
    expect(decision.justification).toContain("ślady używania");
    expect(decision.nextSteps).toEqual([
      "Jeśli sprzęt ma wadę, możesz złożyć reklamację zamiast zwrotu.",
      `W razie pytań napisz na ${SUPPORT_EMAIL}.`,
    ]);
  });

  it("R8 states days and no signs of use; steps are RET-6", () => {
    const { decision } = run(byName("R8 return accepted"));
    expect(decision.justification).toContain("3 dni");
    expect(decision.justification).toContain("14 dni");
    expect(decision.nextSteps).toHaveLength(4);
    expect(decision.nextSteps.join(" ")).toContain(
      "ul. Przykładowa 1, 00-001 Warszawa",
    );
    expect(decision.photoFindingsSummary).toContain("Nie widać śladów");
  });

  it("R9 explains the contradiction", () => {
    const { decision } = run(byName("R9 contradictory signals"));
    expect(decision.justification).toMatch(/sprzeczn|niespójn/);
    expect(decision.nextSteps.join(" ")).toContain(SUPPORT_EMAIL);
  });

  it("R10 accepted: CMP-7 steps and the remedy", () => {
    const repair = run(byName("R10 accepted repair")).decision;
    expect(repair.nextSteps).toHaveLength(4);
    expect(repair.nextSteps.join(" ")).toContain(
      "ul. Przykładowa 2, 00-001 Warszawa",
    );
    expect(repair.justification).toContain("napraw");
    const swap = run(byName("R10 accepted replacement or refund")).decision;
    expect(swap.justification).toContain("wymian");
    expect(swap.justification).toContain("30 dni");
  });

  it("R10 manual review asks for a consultant", () => {
    const { decision } = run(byName("R10 manual review (damage)"));
    expect(decision.justification).toContain("konsultant");
    expect(decision.nextSteps.join(" ")).toContain(SUPPORT_EMAIL);
  });
});

describe("photo findings", () => {
  it("describes category, damage and condition level without percentages", () => {
    const { decision } = run(byName("R7 return rejected for use"));
    const t = decision.photoFindingsSummary;
    expect(t).toContain("smartfon");
    expect(t).toContain("ślady");
    expect(t).toMatch(/wyraźne ślady używania/);
    expect(t).not.toMatch(/\d/);
  });

  it.each([
    [0, "jak nowy"],
    [1, "drobne ślady"],
    [2, "wyraźne ślady używania"],
    [3, "uszkodzony"],
  ])("condition %i", (level, word) => {
    const s = byName("R7 return rejected for use");
    const { decision } = decideWithTemplate(
      s.route,
      s.caseInput,
      screening({ damage: true, condition: level }),
      s.facts,
      "hybrid",
      RET,
    );
    expect(decision.photoFindingsSummary).toContain(word);
  });

  it.each([
    ["laptop", "laptop"],
    ["tablet", "tablet"],
    ["monitor", "monitor"],
    ["tv", "telewizor"],
    ["audio", "audio"],
    ["console", "konsola"],
    ["other_electronics", "inny sprzęt"],
  ])("observed category %s", (observed, word) => {
    const s = byName("R7 return rejected for use");
    const { decision } = decideWithTemplate(
      s.route,
      s.caseInput,
      screening({ observed, damage: true, condition: 2 }),
      s.facts,
      "hybrid",
      RET,
    );
    expect(decision.photoFindingsSummary).toContain(word);
  });

  it("says a refused or unconfident answer could not be assessed", () => {
    const s = byName("R7 return rejected for use");
    const { decision } = decideWithTemplate(
      s.route,
      s.caseInput,
      screening({ refused: ["photo_quality"], unconfident: ["condition"] }),
      s.facts,
      "hybrid",
      RET,
    );
    const t = decision.photoFindingsSummary;
    expect(t).toMatch(/Jakość zdjęcia: nie udało się ocenić/);
    expect(t).toMatch(/Stan sprzętu: nie udało się ocenić/);
  });
});

describe("programming errors", () => {
  it("throws when resolveOutcome refuses (acceptance outside the window)", () => {
    expect(() =>
      decideWithTemplate(
        route("R8", "return_accepted", ["RET-1"]),
        returnCase,
        screening(),
        FACTS_IN,
        "hybrid",
        RET,
      ),
    ).toThrow(/outside_return_window/);
  });

  it("throws on a rule ID missing from the policy", () => {
    expect(() =>
      decideWithTemplate(
        route("R7", "return_rejected", ["RET-99"]),
        returnCase,
        screening(),
        FACTS_IN,
        "hybrid",
        RET,
      ),
    ).toThrow(/unknown_rule_id/);
  });

  it("throws when the resolved category differs from the route category", () => {
    // DOA window is open, so resolveOutcome gives replacement_or_refund, not repair.
    expect(() =>
      decideWithTemplate(
        route("R10", "complaint_accepted_repair", ["CMP-6"]),
        complaintCase,
        screening(),
        FACTS_IN,
        "hybrid",
        CMP,
      ),
    ).toThrow(/category/);
  });

  it("throws for a rule/category/case-type combination without a template", () => {
    const bad: [RouteRule, DecisionCategory, CaseInput, string[]][] = [
      ["R6", "manual_review", returnCase, RET],
      ["R1", "return_accepted", returnCase, RET],
      ["R2", "complaint_rejected", returnCase, RET],
      ["R4", "return_rejected", returnCase, RET],
      ["R7", "manual_review", returnCase, RET],
      ["R3", "return_rejected", returnCase, RET],
      ["R5", "return_rejected", returnCase, RET],
      ["R8", "manual_review", returnCase, RET],
      ["R9", "return_rejected", returnCase, RET],
      ["R2", "manual_review", complaintCase, CMP],
      ["R1", "manual_review", returnCase, RET],
      ["R10", "complaint_rejected", complaintCase, CMP],
    ];
    for (const [rule, category, caseInput, ids] of bad) {
      const id = caseInput.caseType === "return" ? "RET-3" : "CMP-6";
      expect(() =>
        decideWithTemplate(
          route(rule, category, [id]),
          caseInput,
          screening(),
          FACTS_RET_OK,
          "hybrid",
          ids,
        ),
      ).toThrow();
    }
  });
});

// ---------------------------------------------------------------- policy guard (ADR-003 §3.5, PRD §12)

describe("template <-> policy guard", () => {
  it("every literal fact copied from a policy appears in that policy file", () => {
    expect(TEMPLATE_POLICY_FACTS.length).toBeGreaterThanOrEqual(8);
    for (const fact of TEMPLATE_POLICY_FACTS) {
      expect(
        policyText[fact.policy],
        `${fact.policy}: ${fact.literal}`,
      ).toContain(fact.policyLiteral);
    }
  });

  it("every fact is really used in the rendered templates", () => {
    const rendered = scenarios
      .map((s) => firstMessageToText(run(s).firstMessage))
      .join("\n");
    for (const fact of TEMPLATE_POLICY_FACTS) {
      expect(rendered, fact.literal).toContain(fact.literal);
    }
  });

  it("every e-mail, address line and day/month count in rendered texts is backed by a policy", () => {
    const both = `${policyText.return}\n${policyText.complaint}`;
    for (const s of scenarios) {
      const { decision } = run(s);
      const dynamicDays = String(s.facts.daysSincePurchase);
      const all = [
        decision.justification,
        decision.photoFindingsSummary,
        ...decision.nextSteps,
      ].join("\n");

      for (const email of all.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []) {
        expect(both, email).toContain(email);
      }
      for (const line of all.match(/ul\. [^,.]+ \d+, \d{2}-\d{3} [^\s.]+/g) ??
        []) {
        expect(both, line).toContain(line);
      }
      for (const m of all.matchAll(/(\d+) (dni|dzień|miesiące|miesięcy)/g)) {
        const [, n = "", unit = ""] = m;
        if (n === dynamicDays && (unit === "dni" || unit === "dzień")) continue;
        const en = unit.startsWith("mies") ? "months" : "days";
        expect(
          new RegExp(`\\b${n} (calendar )?${en}\\b`).test(both),
          `${s.name}: "${m[0]}" is not in a policy`,
        ).toBe(true);
      }
    }
  });
});

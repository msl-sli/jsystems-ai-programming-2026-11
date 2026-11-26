/**
 * Polish templates for LLM-free decisions (ADR-003 §3.5). Pure: no LLM, no I/O.
 * Policy facts (addresses, e-mail, deadlines) are copied from `docs/policies/*`;
 * `TEMPLATE_POLICY_FACTS` lists them so a test can check each against the policy file.
 */
import type { CaseInput } from "./case-schema";
import { CASE_CATEGORY_LABELS } from "./case-schema";
import {
  AUTOMATED_DECISION_NOTICE,
  FirstMessageSchema,
  type DecisionCategory,
  type DecisionMode,
  type DecisionResult,
  type DeterministicFacts,
  type FirstMessage,
  type Outcome,
  type RouteRule,
  type ScreeningQuestionId,
  type ScreeningResult,
  type TemplateRoute,
} from "./contracts";
import { resolveOutcome } from "./decision-rules";

// ---------------------------------------------------------------- constants

/** AC-35, verbatim. */
export const OFF_TOPIC_SENTENCE =
  "Mogę pomóc tylko w sprawie tego zgłoszenia — zwrotu lub reklamacji i związanych z nimi procedur.";

export const SUPPORT_EMAIL = "support@example.com";

export const GREETING =
  "Dzień dobry, dziękujemy za przesłanie zgłoszenia. Poniżej znajduje się nasza decyzja.";

/** Fixed photo tips (AC-23): daylight, whole device visible, damage in focus. */
export const PHOTO_TIPS: readonly string[] = [
  "Zrób zdjęcie w świetle dziennym, bez flesza i mocnych cieni.",
  "Upewnij się, że cały sprzęt jest widoczny w kadrze.",
  "Ustaw ostrość na uszkodzeniu lub miejscu, którego dotyczy zgłoszenie.",
];

// Copied from docs/policies/return-policy.md
const RETURN_WINDOW_DAYS = 14; // RET-1
const RETURN_SHIP_DAYS = 14; // RET-6 step 2
const REFUND_DAYS = 14; // RET-6 step 4
const RETURN_ADDRESS =
  "Hardware Service Returns, ul. Przykładowa 1, 00-001 Warszawa";
// Copied from docs/policies/complaint-policy.md
const WARRANTY_MONTHS = 24; // CMP-1
const DEAD_ON_ARRIVAL_DAYS = 30; // CMP-4
const REPAIR_DAYS = 14; // CMP-7 step 4
const SERVICE_ADDRESS =
  "Hardware Service Center, ul. Przykładowa 2, 00-001 Warszawa";

export interface TemplatePolicyFact {
  policy: "return" | "complaint";
  /** Literal as written in the Polish templates. */
  literal: string;
  /** The same fact as written in the (English) policy file. */
  policyLiteral: string;
}

/** Every literal policy fact the templates copy, one entry per fact and policy. */
export const TEMPLATE_POLICY_FACTS: readonly TemplatePolicyFact[] = [
  { policy: "return", literal: SUPPORT_EMAIL, policyLiteral: SUPPORT_EMAIL },
  { policy: "complaint", literal: SUPPORT_EMAIL, policyLiteral: SUPPORT_EMAIL },
  { policy: "return", literal: RETURN_ADDRESS, policyLiteral: RETURN_ADDRESS },
  {
    policy: "complaint",
    literal: SERVICE_ADDRESS,
    policyLiteral: SERVICE_ADDRESS,
  },
  {
    policy: "return",
    literal: `${RETURN_WINDOW_DAYS} dni od zakupu`,
    policyLiteral: `${RETURN_WINDOW_DAYS} calendar days`,
  },
  {
    policy: "return",
    literal: `w ciągu ${RETURN_SHIP_DAYS} dni od tej decyzji`,
    policyLiteral: `within ${RETURN_SHIP_DAYS} days of this decision`,
  },
  {
    policy: "return",
    literal: `w ciągu ${REFUND_DAYS} dni od pozytywnej kontroli`,
    policyLiteral: `within ${REFUND_DAYS} days of a positive inspection`,
  },
  {
    policy: "complaint",
    literal: `${WARRANTY_MONTHS} miesiące`,
    policyLiteral: `${WARRANTY_MONTHS} months`,
  },
  {
    policy: "complaint",
    literal: `w ciągu ${DEAD_ON_ARRIVAL_DAYS} dni od zakupu`,
    policyLiteral: `within **${DEAD_ON_ARRIVAL_DAYS} days** of purchase`,
  },
  {
    policy: "complaint",
    literal: `w ciągu ${REPAIR_DAYS} dni od otrzymania`,
    policyLiteral: `within ${REPAIR_DAYS} days of receipt`,
  },
];

/** Polish plural of "dzień": "dzień" only for exactly 1. */
export function daysPl(n: number): string {
  return n === 1 ? "1 dzień" : `${n} dni`;
}

/** "od zakupu minął 1 dzień" / "minęły 2 dni" / "minęło 5 dni" (verb agrees with the number). */
export function elapsedDaysPl(n: number): string {
  if (n === 1) return "minął 1 dzień";
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  const few =
    lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14);
  return `${few ? "minęły" : "minęło"} ${n} dni`;
}

// ---------------------------------------------------------------- photo findings

type Answers = ScreeningResult["answers"];
type Answer<T> = { value: T | null; confident: boolean; refused: boolean };

const QUESTION_LABELS: Record<ScreeningQuestionId, string> = {
  photo_quality: "Jakość zdjęcia",
  observed_category: "Rodzaj sprzętu",
  visible_damage_or_use: "Uszkodzenia lub ślady używania",
  condition: "Stan sprzętu",
};
/** Genitive forms for "nie udało się ocenić: ...". */
const AREA_LABELS: Record<ScreeningQuestionId, string> = {
  photo_quality: "jakości zdjęcia",
  observed_category: "rodzaju sprzętu",
  visible_damage_or_use: "uszkodzeń lub śladów używania",
  condition: "stanu sprzętu",
};

const OBSERVED_NAMES = {
  laptop: "laptop",
  smartphone: "smartfon",
  tablet: "tablet",
  monitor: "monitor",
  tv: "telewizor",
  audio: "słuchawki lub urządzenie audio",
  console: "konsola do gier",
  other_electronics: "inny sprzęt elektroniczny",
} as const;

const PHOTO_PROBLEMS = {
  blurry: "Zdjęcie jest nieostre",
  too_dark: "Zdjęcie jest zbyt ciemne",
  device_not_fully_visible: "Sprzęt nie jest w całości widoczny na zdjęciu",
  no_device: "Na zdjęciu nie widać sprzętu",
} as const;

const CONDITION_TEXT = [
  "jak nowy, bez widocznych śladów",
  "drobne ślady widoczne tylko z bliska",
  "wyraźne ślady używania",
  "uszkodzony",
] as const;

function assessed<T>(answer: Answer<T>): T | null {
  return answer.refused || !answer.confident ? null : answer.value;
}

function notAssessed(id: ScreeningQuestionId): string {
  return `${QUESTION_LABELS[id]}: nie udało się ocenić z wystarczającą pewnością.`;
}

/** With a failed photo gate (R4/R5) only the photo and device sentences are meaningful. */
function photoFindings(a: Answers, photoGate: boolean): string {
  const quality = assessed(a.photo_quality);
  const observed = assessed(a.observed_category);
  const damage = assessed(a.visible_damage_or_use);
  const condition = assessed(a.condition);
  const gate = [
    quality === null
      ? notAssessed("photo_quality")
      : quality === "ok"
        ? "Zdjęcie jest wyraźne i pozwala ocenić sprzęt."
        : `${PHOTO_PROBLEMS[quality]}.`,
    observed === null
      ? notAssessed("observed_category")
      : observed === "no_device"
        ? "Na zdjęciu nie widać sprzętu."
        : `Rozpoznany rodzaj sprzętu: ${OBSERVED_NAMES[observed]}.`,
  ];
  if (photoGate) return gate.join(" ");
  return [
    ...gate,
    damage === null
      ? notAssessed("visible_damage_or_use")
      : damage
        ? "Widoczne są ślady uszkodzenia lub używania."
        : "Nie widać śladów uszkodzenia ani używania.",
    condition === null
      ? notAssessed("condition")
      : `Stan sprzętu: ${CONDITION_TEXT[condition]}.`,
  ].join(" ");
}

function unassessedAreas(screening: ScreeningResult): string {
  const a = screening.answers;
  const unassessed: Record<ScreeningQuestionId, boolean> = {
    photo_quality: assessed(a.photo_quality) === null,
    observed_category: assessed(a.observed_category) === null,
    visible_damage_or_use: assessed(a.visible_damage_or_use) === null,
    condition: assessed(a.condition) === null,
  };
  const names = (Object.keys(AREA_LABELS) as ScreeningQuestionId[])
    .filter((id) => unassessed[id] || screening.uncertainAreas.includes(id))
    .map((id) => AREA_LABELS[id]);
  return names.length > 0 ? names.join(", ") : "części oceny";
}

// ---------------------------------------------------------------- next steps

const RETURN_ACCEPTED_STEPS = [
  "Zapakuj produkt w oryginalne opakowanie razem ze wszystkimi akcesoriami.",
  `Wyślij go w ciągu ${RETURN_SHIP_DAYS} dni od tej decyzji na adres: ${RETURN_ADDRESS}.`,
  "Produkt zostanie sprawdzony po dostarczeniu. Decyzja stanie się ostateczna dopiero po tej kontroli.",
  `Zwrot pieniędzy nastąpi na pierwotną metodę płatności w ciągu ${REFUND_DAYS} dni od pozytywnej kontroli.`,
];

const COMPLAINT_ACCEPTED_STEPS = [
  "Wykonaj kopię zapasową danych osobowych i usuń z urządzenia hasła oraz blokady.",
  `Wyślij urządzenie wraz z kopią dowodu zakupu na adres: ${SERVICE_ADDRESS}.`,
  "Urządzenie zostanie sprawdzone po dostarczeniu. Decyzja stanie się ostateczna dopiero po tej kontroli.",
  `Naprawa lub wymiana zostanie zakończona w ciągu ${REPAIR_DAYS} dni od otrzymania urządzenia.`,
];

const CONTACT_STEP = `Napisz na adres ${SUPPORT_EMAIL} — konsultant oceni zgłoszenie ręcznie.`;

function nextSteps(
  rule: RouteRule,
  category: DecisionCategory,
  kind: TemplateRoute["manualReviewKind"],
  facts: DeterministicFacts,
): string[] {
  switch (category) {
    case "return_accepted":
      return [...RETURN_ACCEPTED_STEPS];
    case "complaint_accepted_repair":
    case "complaint_accepted_replacement_or_refund":
      return [...COMPLAINT_ACCEPTED_STEPS];
    case "manual_review":
      return kind === "better_photo"
        ? [
            "Złóż nowe zgłoszenie z lepszym zdjęciem.",
            ...PHOTO_TIPS,
            `Możesz też napisać na adres ${SUPPORT_EMAIL}.`,
          ]
        : [CONTACT_STEP];
    case "complaint_rejected":
      return [
        `Płatna naprawa jest dostępna po kontakcie z obsługą: ${SUPPORT_EMAIL}.`,
      ];
    case "return_rejected":
      if (rule === "R1" && !facts.withinWarranty) {
        // A complaint would be rejected by CMP-1, so only the paid repair remains.
        return [
          `Płatna naprawa jest dostępna po kontakcie z obsługą: ${SUPPORT_EMAIL}.`,
        ];
      }
      return rule === "R1"
        ? [
            `Jeśli sprzęt jest wadliwy, możesz złożyć reklamację (gwarancja ${WARRANTY_MONTHS} miesiące od zakupu).`,
            `W razie pytań napisz na ${SUPPORT_EMAIL}.`,
          ]
        : [
            "Jeśli sprzęt ma wadę, możesz złożyć reklamację zamiast zwrotu.",
            `W razie pytań napisz na ${SUPPORT_EMAIL}.`,
          ];
  }
}

// ---------------------------------------------------------------- justifications

interface Ctx {
  caseInput: CaseInput;
  screening: ScreeningResult;
  facts: DeterministicFacts;
  category: DecisionCategory;
  /** "(RET-1, RET-2)" */
  cite: string;
}

function unsupported(rule: RouteRule, category: DecisionCategory): never {
  throw new Error(`No template for route ${rule} with category ${category}`);
}

function justification(rule: RouteRule, c: Ctx): string {
  const { category, cite, facts, screening } = c;
  const isReturn = c.caseInput.caseType === "return";
  const answers = screening.answers;
  switch (rule) {
    case "R1":
      if (category !== "return_rejected" || !isReturn) break;
      return `Zwrot jest możliwy w ciągu ${RETURN_WINDOW_DAYS} dni od zakupu, a zgłoszenie złożono ${daysPl(facts.daysSincePurchase)} od zakupu ${cite}.`;
    case "R2":
      if (category !== "complaint_rejected" || isReturn) break;
      return `Gwarancja trwa ${WARRANTY_MONTHS} miesiące od daty zakupu, a ten okres już minął ${cite}.`;
    case "R3":
      if (category !== "manual_review") break;
      return `Nie udało się z wystarczającą pewnością ocenić: ${unassessedAreas(screening)}. Dlatego zgłoszenie oceni konsultant ${cite}.`;
    case "R4": {
      if (category !== "manual_review") break;
      const quality = assessed(answers.photo_quality);
      const problem =
        quality === null || quality === "ok"
          ? "Zdjęcie nie pozwala ocenić sprzętu"
          : PHOTO_PROBLEMS[quality];
      return `${problem}, więc zgłoszenia nie można rozstrzygnąć automatycznie ${cite}.`;
    }
    case "R5": {
      if (category !== "manual_review") break;
      const observed = assessed(answers.observed_category);
      const selected = CASE_CATEGORY_LABELS[c.caseInput.category];
      const seen =
        observed === null
          ? "Rodzaj sprzętu na zdjęciu nie został rozpoznany"
          : observed === "no_device"
            ? "Na zdjęciu nie widać sprzętu"
            : `Na zdjęciu rozpoznano: ${OBSERVED_NAMES[observed]}`;
      return `${seen}, a w zgłoszeniu wybrano kategorię: ${selected} ${cite}.`;
    }
    case "R7":
      if (category !== "return_rejected" || !isReturn) break;
      return `Na zdjęciu widoczne są ślady używania lub uszkodzenia, a zwrot jest możliwy tylko dla sprzętu bez takich śladów ${cite}.`;
    case "R8":
      if (category !== "return_accepted") break;
      return `Od zakupu ${elapsedDaysPl(facts.daysSincePurchase)}, czyli zwrot mieści się w limicie ${RETURN_WINDOW_DAYS} dni, a na zdjęciu nie widać śladów używania ani uszkodzeń ${cite}.`;
    case "R9":
      if (category !== "manual_review") break;
      return `Wyniki analizy zdjęcia są niespójne: ślady używania i stan sprzętu nie pasują do siebie, więc stan musi ocenić konsultant ${cite}.`;
    case "R10":
      if (category === "manual_review") {
        return `Na zdjęciu widoczne są ślady uszkodzenia, a ich przyczyny nie da się ustalić automatycznie, dlatego ocenę przejmuje konsultant ${cite}.`;
      }
      if (category === "complaint_accepted_repair") {
        return `Zdjęcie jest wyraźne, sprzęt pasuje do wybranej kategorii i nie widać uszkodzeń, więc reklamacja zostaje przyjęta ${cite}. Sprzęt zostanie skierowany do naprawy.`;
      }
      if (category === "complaint_accepted_replacement_or_refund") {
        return `Zdjęcie jest wyraźne, sprzęt pasuje do wybranej kategorii i nie widać uszkodzeń, więc reklamacja zostaje przyjęta ${cite}. Wada zgłoszona w ciągu ${DEAD_ON_ARRIVAL_DAYS} dni od zakupu uprawnia do wymiany lub zwrotu pieniędzy.`;
      }
      break;
    default:
      break;
  }
  return unsupported(rule, category);
}

// ---------------------------------------------------------------- entry point

function outcomeOf(category: DecisionCategory): Outcome {
  switch (category) {
    case "return_accepted":
    case "complaint_accepted_repair":
    case "complaint_accepted_replacement_or_refund":
      return "accepted";
    case "return_rejected":
    case "complaint_rejected":
      return "rejected";
    case "manual_review":
      return "manual_review";
  }
}

/**
 * Builds the decision and first message for a template route without an LLM.
 * Category, label and rule IDs always come from `resolveOutcome` (TAC-003-02); a refusal or a
 * different category is a programming error in routing and throws.
 */
export function decideWithTemplate(
  route: TemplateRoute,
  caseInput: CaseInput,
  screening: ScreeningResult,
  facts: DeterministicFacts,
  mode: DecisionMode,
  policyRuleIds: readonly string[],
): { decision: DecisionResult; firstMessage: FirstMessage } {
  const resolved = resolveOutcome(
    caseInput.caseType,
    outcomeOf(route.category),
    facts,
    route.citedRuleIds,
    policyRuleIds,
  );
  if (!resolved.ok) {
    throw new Error(
      `Template route ${route.rule} refused by resolveOutcome: ${resolved.why}`,
    );
  }
  if (resolved.category !== route.category) {
    throw new Error(
      `Template route ${route.rule} category mismatch: route ${route.category}, resolved ${resolved.category}`,
    );
  }

  const text = justification(route.rule, {
    caseInput,
    screening,
    facts,
    category: resolved.category,
    cite: `(${resolved.citedRuleIds.join(", ")})`,
  });
  const findings = photoFindings(
    screening.answers,
    route.rule === "R4" || route.rule === "R5",
  );
  const steps = nextSteps(
    route.rule,
    resolved.category,
    route.manualReviewKind,
    facts,
  );

  const decision: DecisionResult = {
    category: resolved.category,
    label: resolved.label,
    citedRuleIds: resolved.citedRuleIds,
    justification: text,
    photoFindingsSummary: findings,
    nextSteps: steps,
    manualReviewKind: route.manualReviewKind,
    decisionPath: "template",
    routeRule: route.rule,
    mode,
  };
  const firstMessage = FirstMessageSchema.parse({
    greeting: GREETING,
    decisionLabel: resolved.label,
    justification: text,
    photoFindings: findings,
    nextSteps: steps,
    notice: AUTOMATED_DECISION_NOTICE,
  });
  return { decision, firstMessage };
}

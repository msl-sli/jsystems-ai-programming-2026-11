import path from "node:path";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { AUTOMATED_DECISION_NOTICE } from "../../../src/domain/contracts";
import type { DecisionCategory } from "../../../src/domain/contracts";
import {
  CATEGORIES_BY_CASE_TYPE,
  DECISION_LABELS,
} from "../../../src/domain/decision-labels";
import { dotted, openForm } from "./form";

// Live E2E helpers (plan 7a). The app is real, the calls are real. Playwright only OBSERVES
// traffic (request/response events); nothing here modifies or answers a request.

const IMAGES = path.resolve(__dirname, "../../../../assets/example-images");
export const PHOTO = {
  laptop1: path.join(IMAGES, "laptop-1.png"),
  laptop2: path.join(IMAGES, "laptop-2.webp"),
  phone1: path.join(IMAGES, "phone-1.jpg"),
  phone2: path.join(IMAGES, "phone-2.jpeg"),
  phone3: path.join(IMAGES, "phone-3.jpeg"),
} as const;

export const LIVE_TEST_TIMEOUT_MS = 150_000;
export const PROCESSING_TIMEOUT_MS = 90_000;
export const CHAT_ANSWER_TIMEOUT_MS = 60_000;

export const SCREEN_LINES_DESCRIPTION =
  "Na ekranie widoczne są pionowe linie, urządzenie nie upadło i nie było uderzone.";

// ------------------------------------------------------------------ dates (Europe/Warsaw)

function warsawParts(now = new Date()): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  return { y: y!, m: m!, d: d! };
}

/** Warsaw calendar date minus N days (and years), as a local Date at noon (no DST edge). */
export function warsawDate(daysAgo: number, yearsAgo = 0): Date {
  const { y, m, d } = warsawParts();
  return new Date(y - yearsAgo, m - 1, d - daysAgo, 12);
}

export const warsawDotted = (daysAgo: number, yearsAgo = 0) =>
  dotted(warsawDate(daysAgo, yearsAgo));

// ------------------------------------------------------------------ labels

const labelsOf = (cat: readonly DecisionCategory[]) =>
  cat.map((c) => DECISION_LABELS[c]);
export const RETURN_LABELS = labelsOf(CATEGORIES_BY_CASE_TYPE.return);
export const COMPLAINT_LABELS = labelsOf(CATEGORIES_BY_CASE_TYPE.complaint);
export const MANUAL_REVIEW_LABEL = DECISION_LABELS.manual_review;
export { AUTOMATED_DECISION_NOTICE, DECISION_LABELS };

// ------------------------------------------------------------------ routing consistency (ADR-003 3.3)

export type Mode = "hybrid" | "decisions-only" | "llm-always";
const HYBRID_LLM_RULES = ["R3", "R6", "R9", "R10"];

export function expectedPath(mode: Mode, rule: string): "template" | "llm" {
  if (mode === "decisions-only") return "template";
  if (mode === "llm-always") return "llm";
  return HYBRID_LLM_RULES.includes(rule) ? "llm" : "template";
}

// ------------------------------------------------------------------ traffic observation

export type DecisionBody = {
  decision: {
    category: string;
    label: string;
    citedRuleIds: string[];
    justification: string;
    nextSteps: string[];
    manualReviewKind: string | null;
    decisionPath: "template" | "llm";
    routeRule: string;
    mode: Mode;
  };
  firstMessage: { decisionLabel: string; nextSteps: string[] };
};

export type ApiCall = {
  endpoint: string;
  status: number;
  ms: number;
  requestBytes: number;
};

export type Traffic = {
  calls: ApiCall[];
  screeningImage: () => {
    mediaType: string;
    width: number;
    height: number;
    base64Length: number;
    decodedBytes: number;
    head: string;
  } | null;
  decision: () => DecisionBody | null;
  decisionResponse: () => Promise<DecisionBody>;
  screeningStatus: () => number | null;
};

/** Passive listeners only (page.on). Call before the first interaction. */
export function observeTraffic(page: Page): Traffic {
  const calls: ApiCall[] = [];
  let image: ReturnType<Traffic["screeningImage"]> = null;
  let decision: DecisionBody | null = null;
  let screeningStatus: number | null = null;
  let decisionWaiter: ((b: DecisionBody) => void) | null = null;
  const decisionPromise = new Promise<DecisionBody>((resolve) => {
    decisionWaiter = resolve;
  });

  page.on("request", (req) => {
    const url = new URL(req.url());
    if (!url.pathname.startsWith("/api/")) return;
    if (url.pathname === "/api/cases/screening") {
      try {
        const body = req.postDataJSON() as {
          caseImage?: {
            mediaType: string;
            width: number;
            height: number;
            base64: string;
          };
        };
        const ci = body.caseImage;
        if (ci) {
          image = {
            mediaType: ci.mediaType,
            width: ci.width,
            height: ci.height,
            base64Length: ci.base64.length,
            decodedBytes: Buffer.from(ci.base64, "base64").length,
            head: ci.base64.slice(0, 4),
          };
        }
      } catch {
        // body not JSON: leave image null, the test asserting it will fail visibly
      }
    }
  });

  page.on("response", async (res) => {
    const url = new URL(res.url());
    if (!url.pathname.startsWith("/api/")) return;
    const req = res.request();
    const timing = req.timing();
    calls.push({
      endpoint: `${req.method()} ${url.pathname}`,
      status: res.status(),
      ms: Math.round(timing.responseEnd > 0 ? timing.responseEnd : 0),
      requestBytes: Buffer.byteLength(req.postData() ?? ""),
    });
    if (url.pathname === "/api/cases/screening") screeningStatus = res.status();
    if (url.pathname === "/api/cases/decision" && res.ok()) {
      try {
        decision = (await res.json()) as DecisionBody;
        decisionWaiter?.(decision);
      } catch {
        // streamed or unreadable: ignore
      }
    }
  });

  return {
    calls,
    screeningImage: () => image,
    decision: () => decision,
    decisionResponse: () => decisionPromise,
    screeningStatus: () => screeningStatus,
  };
}

/** Evidence for the orchestrator's real-call table: decision JSON (no image) + observed calls. */
export async function attachEvidence(
  testInfo: TestInfo,
  name: string,
  traffic: Traffic,
) {
  await testInfo.attach(`${name}-decision.json`, {
    body: JSON.stringify(traffic.decision(), null, 2),
    contentType: "application/json",
  });
  await testInfo.attach(`${name}-calls.json`, {
    body: JSON.stringify(
      { calls: traffic.calls, screeningImage: traffic.screeningImage() },
      null,
      2,
    ),
    contentType: "application/json",
  });
}

// ------------------------------------------------------------------ form

export type CaseSpec = {
  caseType: "Reklamacja" | "Zwrot";
  category:
    | "Laptop"
    | "Smartfon"
    | "Tablet"
    | "Monitor"
    | "Telewizor"
    | "Słuchawki / audio"
    | "Konsola do gier"
    | "Inne";
  name: string;
  purchaseDate: string; // dd.mm.yyyy
  description?: string;
  photo: string;
};

export async function fillCase(page: Page, c: CaseSpec) {
  await page.getByRole("radio", { name: c.caseType }).check();
  await page.getByRole("combobox", { name: "Kategoria sprzętu" }).click();
  await page.getByRole("option", { name: c.category, exact: true }).click();
  await page.getByLabel("Nazwa lub model sprzętu").fill(c.name);
  await page.getByLabel("Data zakupu").fill(c.purchaseDate);
  if (c.description) {
    await page.getByLabel(/^Powód \/ opis problemu/).fill(c.description);
  }
  await page.locator('input[type="file"]').setInputFiles(c.photo);
  await page
    .getByRole("img", { name: /Podgląd zdjęcia/ })
    .waitFor({ state: "visible" });
}

export const submitButton = (page: Page) =>
  page.getByRole("button", { name: "Wyślij zgłoszenie" });

/** Fresh form, filled and submitted; resolves when the chat screen shows the first message. */
export async function submitToChat(page: Page, c: CaseSpec) {
  await openForm(page);
  await fillCase(page, c);
  await submitButton(page).click();
  await expect(page.getByTestId("chat-screen")).toBeVisible({
    timeout: PROCESSING_TIMEOUT_MS,
  });
}

// ------------------------------------------------------------------ first message / decision checks

export const firstMessage = (page: Page) => page.getByTestId("first-message");

/** AC-25 structure + AC-26 notice. */
export async function expectFirstMessageStructure(page: Page) {
  const fm = firstMessage(page);
  await expect(
    fm.getByRole("heading", { name: "Co widzimy na zdjęciu" }),
  ).toBeVisible();
  await expect(
    fm.getByRole("heading", { name: "Kolejne kroki" }),
  ).toBeVisible();
  expect(await fm.getByRole("listitem").count()).toBeGreaterThanOrEqual(1);
  await expect(fm.getByText(AUTOMATED_DECISION_NOTICE)).toBeVisible();
}

/** Route rule and path agree for the observed mode; the label shown equals the response label. */
export async function expectConsistentDecision(
  page: Page,
  body: DecisionBody,
  allowedLabels: readonly string[],
) {
  const d = body.decision;
  expect(allowedLabels, `label ${d.label}`).toContain(d.label);
  expect(d.decisionPath).toBe(expectedPath(d.mode, d.routeRule));
  await expect(firstMessage(page).getByText(d.label, { exact: true })).toBeVisible();
}

// ------------------------------------------------------------------ chat

export const chatInput = (page: Page) =>
  page.getByRole("textbox", { name: "Wiadomość do agenta" });
export const sendButton = (page: Page) =>
  page.getByRole("button", { name: "Wyślij", exact: true });
export const typingIndicator = (page: Page) =>
  page.getByRole("status", { name: "Agent pisze odpowiedź…" });
export const summaryCard = (page: Page) => page.getByTestId("case-summary");
export const decisionChanges = (page: Page) =>
  page.getByTestId("decision-change");

/** Agent replies after the first message (the first message has its own test id). */
export const agentReplies = (page: Page): Locator =>
  page
    .locator('[data-slot="message"][data-align="start"]')
    .filter({ hasNot: page.getByTestId("first-message") });

export type ChatTurn = {
  question: string;
  answer: string;
  lengthSamples: number[];
  typingSeen: boolean;
  sendDisabledWhileBusy: boolean;
};

/** Sends one message and waits for the complete answer. Observes typing, progressive text, Send state. */
export async function askAgent(page: Page, question: string): Promise<ChatTurn> {
  const before = await agentReplies(page).count();
  await chatInput(page).fill(question);
  await sendButton(page).click();

  await typingIndicator(page).waitFor({ state: "visible", timeout: 20_000 });
  const typingSeen = true;

  // While the answer is pending: Send stays disabled even with new text in the field (AC-31).
  await chatInput(page).fill("x");
  const sendDisabledWhileBusy = await sendButton(page).isDisabled();
  await chatInput(page).fill("");

  const lengthSamples: number[] = [];
  const deadline = Date.now() + CHAT_ANSWER_TIMEOUT_MS;
  while (await typingIndicator(page).isVisible()) {
    if (Date.now() > deadline) throw new Error("chat answer timed out");
    const replies = agentReplies(page);
    if ((await replies.count()) > before) {
      lengthSamples.push((await replies.last().innerText()).length);
    }
    await page.waitForTimeout(100);
  }
  await expect(
    page.getByRole("alert").filter({ hasText: "Nie udało się uzyskać odpowiedzi." }),
  ).toHaveCount(0);
  await expect(agentReplies(page)).toHaveCount(before + 1);
  const answer = await agentReplies(page).last().innerText();
  expect(answer.trim().length).toBeGreaterThan(0);
  return { question, answer, lengthSamples, typingSeen, sendDisabledWhileBusy };
}

export async function attachChatTurns(
  testInfo: TestInfo,
  name: string,
  turns: ChatTurn[],
) {
  await testInfo.attach(`${name}-chat.json`, {
    body: JSON.stringify(
      turns.map((t) => ({
        question: t.question,
        answerChars: t.answer.length,
        lengthSamples: t.lengthSamples,
      })),
      null,
      2,
    ),
    contentType: "application/json",
  });
}

/** True when the date appears in any common form (dd.mm.yyyy, d.m.yyyy, ISO). */
export function mentionsDate(text: string, d: Date): boolean {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const p = (n: number) => String(n).padStart(2, "0");
  const forms = [
    `${p(day)}.${p(m)}.${y}`,
    `${day}.${p(m)}.${y}`,
    `${day}.${m}.${y}`,
    `${y}-${p(m)}-${p(day)}`,
  ];
  return forms.some((f) => text.includes(f));
}

export async function expectNoHorizontalScroll(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
}

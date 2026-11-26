import "server-only";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CaseInput } from "@/domain/case-schema";
import {
  AUTOMATED_DECISION_NOTICE,
  ChangeDecisionInputSchema,
  type ChatCaseContext,
  type DecisionCategory,
  type DecisionDataPart,
  type ScreeningResult,
  type TemplateRoute,
} from "@/domain/contracts";
import { computeFacts } from "@/domain/dates";
import { DECISION_LABELS } from "@/domain/decision-labels";
import { firstMessageToText } from "@/domain/first-message";
import { OFF_TOPIC_SENTENCE, decideWithTemplate } from "@/domain/templates";
import { createLlmProvider, getChatModel } from "../llm";
import { loadPolicies } from "../policies";
import {
  CHAT_PROMPT_VERSION,
  buildChatModelMessages,
  buildChatSystemPrompt,
  createChangeDecisionTool,
  executeChangeDecision,
  streamChat,
} from "./chat";
import type { ChatUIMessage } from "./chat-types";

const TODAY = "2026-11-26";
const policies = loadPolicies(path.resolve(process.cwd(), "../docs/policies"));
const realPromptsDir = path.resolve(process.cwd(), "src/server/ai/prompts");

/** Real chat prompts plus a marker guardrails file, so builder tests do not depend on the concurrent T33 file. */
const promptsDir = mkdtempSync(path.join(os.tmpdir(), "chat-prompts-"));
for (const f of ["chat.return.md", "chat.complaint.md"])
  copyFileSync(path.join(realPromptsDir, f), path.join(promptsDir, f));
writeFileSync(
  path.join(promptsDir, "_guardrails.md"),
  "prompt-version: 2026-11-26.1\n\nGUARDRAILS-MARKER shared rules.\n",
);

// ---------------------------------------------------------------- fixtures

function screening(): ScreeningResult {
  const ans = <T>(value: T) => ({
    value,
    probabilities: {},
    certainty: 0.95,
    confident: true,
    refused: false,
  });
  return {
    answers: {
      photo_quality: ans("ok"),
      observed_category: ans("smartphone"),
      visible_damage_or_use: ans(false),
      condition: ans(0),
    },
    uncertainAreas: [],
    model: "test-model",
    promptVersion: "test",
    latencyMs: 1,
  } as unknown as ScreeningResult;
}

function templateRoute(
  rule: TemplateRoute["rule"],
  category: DecisionCategory,
  citedRuleIds: string[],
  manualReviewKind: TemplateRoute["manualReviewKind"] = null,
): TemplateRoute {
  return { kind: "template", rule, category, citedRuleIds, manualReviewKind };
}

const DESCRIPTION = "ZZ-OPIS-KLIENTA: ekran przestał reagować na dotyk.";

function contextFor(
  caseInput: CaseInput,
  route: TemplateRoute,
  withFindings = false,
): ChatCaseContext {
  const s = screening();
  const facts = computeFacts(caseInput.purchaseDate, TODAY);
  const ids =
    caseInput.caseType === "return"
      ? policies.return.ruleIds
      : policies.complaint.ruleIds;
  const { decision, firstMessage } = decideWithTemplate(
    route,
    caseInput,
    s,
    facts,
    "hybrid",
    ids,
  );
  return {
    caseInput,
    screening: s,
    decisionHistory: [
      {
        category: decision.category,
        label: decision.label,
        citedRuleIds: decision.citedRuleIds,
        source: "initial",
        manualReviewKind: decision.manualReviewKind,
      },
    ],
    firstMessage,
    ...(withFindings
      ? {
          llmFindings: {
            photoFindingsPl: "ZZ-FINDINGS: widoczne rysy na obudowie.",
            evidence: [{ source: "photo" as const, text: "ZZ-EVIDENCE rysa" }],
            signalReview: {},
          },
        }
      : {}),
  };
}

const complaintInput = (purchaseDate: string): CaseInput => ({
  caseType: "complaint",
  category: "smartphone",
  productName: "Telefon X",
  purchaseDate,
  description: DESCRIPTION,
});
const returnInput = (purchaseDate: string): CaseInput => ({
  caseType: "return",
  category: "smartphone",
  productName: "Telefon X",
  purchaseDate,
  description: "",
});

/** Complaint 10 days after purchase: accepted, replacement or refund (CMP-4 dead on arrival). */
const complaintCtx = () =>
  contextFor(
    complaintInput("2026-11-16"),
    templateRoute("R10", "complaint_accepted_replacement_or_refund", [
      "CMP-2",
      "CMP-4",
    ]),
  );
/** Return 3 days after purchase: accepted. */
const returnCtx = () =>
  contextFor(
    returnInput("2026-11-23"),
    templateRoute("R8", "return_accepted", ["RET-1", "RET-2"]),
  );

function userMessage(text: string): ChatUIMessage {
  return { id: "u1", role: "user", parts: [{ type: "text", text }] };
}

// ---------------------------------------------------------------- prompts

describe("chat prompt files", () => {
  it.each(["chat.return.md", "chat.complaint.md"])(
    "%s has the version line, the verbatim off-topic sentence and the key rules",
    async (file) => {
      const { loadPromptFile } = await import("./prompt-files");
      const prompt = loadPromptFile(file, realPromptsDir);
      expect(prompt.version).toBe(CHAT_PROMPT_VERSION);
      expect(prompt.body).toContain(OFF_TOPIC_SENTENCE);
      expect(prompt.body).toContain("changeDecision");
      expect(prompt.body).toContain("Zmiana decyzji");
      expect(prompt.body).toMatch(/Polish/);
    },
  );
});

describe("buildChatSystemPrompt", () => {
  const options = { policies, today: TODAY, promptsDir };

  it("contains guardrails, the policy of the case type and recomputed facts", () => {
    const prompt = buildChatSystemPrompt(complaintCtx(), options);
    expect(prompt).toContain("GUARDRAILS-MARKER");
    expect(prompt).toContain("## CMP-1");
    expect(prompt).not.toContain("## RET-1");
    expect(prompt).toContain(TODAY);
    expect(prompt).toMatch(/daysSincePurchase[^\n]*10/);
    expect(prompt).toMatch(/withinWarranty[^\n]*true/);
    expect(prompt).toMatch(/withinDeadOnArrival[^\n]*true/);
  });

  it("uses the return policy for a return and recomputes facts from `today`", () => {
    const prompt = buildChatSystemPrompt(returnCtx(), options);
    expect(prompt).toContain("## RET-1");
    expect(prompt).not.toContain("## CMP-1");
    const later = buildChatSystemPrompt(returnCtx(), {
      ...options,
      today: "2026-12-20",
    });
    expect(later).toMatch(/withinReturnWindow[^\n]*false/);
  });

  it("contains the current decision label, rule ids and decision path", () => {
    const ctx = complaintCtx();
    const prompt = buildChatSystemPrompt(ctx, options);
    expect(prompt).toContain(
      DECISION_LABELS.complaint_accepted_replacement_or_refund,
    );
    expect(prompt).toContain("CMP-2");
    expect(prompt).toMatch(/decision path[^\n]*template/i);
  });

  it("uses the LAST history entry as the current decision", () => {
    const ctx = complaintCtx();
    ctx.decisionHistory.push({
      category: "complaint_rejected",
      label: DECISION_LABELS.complaint_rejected,
      citedRuleIds: ["CMP-3"],
      source: "chat",
      manualReviewKind: null,
    });
    const prompt = buildChatSystemPrompt(ctx, options);
    expect(prompt).toMatch(/current decision[^\n]*Reklamacja odrzucona/i);
  });

  it("delimits the customer description as data and includes the case fields", () => {
    const prompt = buildChatSystemPrompt(complaintCtx(), options);
    expect(prompt).toContain("Telefon X");
    expect(prompt).toContain("2026-11-16");
    expect(prompt).toMatch(
      /<customer_description>[\s\S]*ZZ-OPIS-KLIENTA[\s\S]*<\/customer_description>/,
    );
  });

  it("includes screening values with certainty", () => {
    const prompt = buildChatSystemPrompt(complaintCtx(), options);
    expect(prompt).toMatch(/photo_quality[^\n]*ok[^\n]*0\.95/);
    expect(prompt).toMatch(/condition[^\n]*0[^\n]*0\.95/);
  });

  it("includes llmFindings only when present", () => {
    expect(buildChatSystemPrompt(complaintCtx(), options)).not.toContain(
      "ZZ-FINDINGS",
    );
    const ctx = contextFor(
      complaintInput("2026-11-16"),
      templateRoute("R10", "complaint_accepted_replacement_or_refund", [
        "CMP-2",
        "CMP-4",
      ]),
      true,
    );
    const prompt = buildChatSystemPrompt(ctx, options);
    expect(prompt).toContain("ZZ-FINDINGS");
    expect(prompt).toContain("ZZ-EVIDENCE");
  });

  it("carries the verbatim off-topic sentence and the chat prompt", () => {
    const prompt = buildChatSystemPrompt(returnCtx(), options);
    expect(prompt).toContain(OFF_TOPIC_SENTENCE);
  });
});

// ---------------------------------------------------------------- model messages

describe("buildChatModelMessages", () => {
  it("inserts the canonical first message as the first assistant message", async () => {
    const ctx = complaintCtx();
    const messages = await buildChatModelMessages(ctx, [
      userMessage("Jaka jest data zakupu?"),
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: firstMessageToText(ctx.firstMessage) }],
    });
    expect(JSON.stringify(messages[0])).toContain(AUTOMATED_DECISION_NOTICE);
    expect(messages[1]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Jaka jest data zakupu?" }],
    });
  });

  it("keeps only text parts: no files, images or data parts reach the model", async () => {
    const messages = await buildChatModelMessages(complaintCtx(), [
      {
        id: "u1",
        role: "user",
        parts: [
          { type: "text", text: "Pytanie" },
          {
            type: "file",
            mediaType: "image/jpeg",
            url: "data:image/jpeg;base64,AAAA",
          },
        ],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "data-decision",
            data: {
              category: "complaint_rejected",
              label: "x",
              citedRuleIds: ["CMP-3"],
              manualReviewKind: null,
            },
          },
          { type: "text", text: "Odpowiedź" },
        ],
      },
      userMessage("Dalej"),
    ]);
    const json = JSON.stringify(messages);
    expect(json).not.toContain("image");
    expect(json).not.toContain("data:");
    expect(json).not.toContain("data-decision");
    expect(messages.map((m) => m.role)).toEqual([
      "assistant",
      "user",
      "assistant",
      "user",
    ]);
  });
});

// ---------------------------------------------------------------- tool

describe("executeChangeDecision", () => {
  const run = (
    ctx: ChatCaseContext,
    input: Parameters<typeof executeChangeDecision>[0],
    today = TODAY,
  ) => {
    const accepted: DecisionDataPart[] = [];
    const result = executeChangeDecision(input, {
      caseContext: ctx,
      policies,
      today,
      onAccepted: (part) => accepted.push(part),
    });
    return { result, accepted };
  };

  it("accepts a complaint rejection after a new fact (exclusion CMP-3)", () => {
    const { result, accepted } = run(complaintCtx(), {
      outcome: "rejected",
      citedRuleIds: ["CMP-3"],
      reason: "Urządzenie spadło na podłogę.",
    });
    expect(result).toEqual({
      accepted: true,
      category: "complaint_rejected",
      label: DECISION_LABELS.complaint_rejected,
    });
    expect(accepted).toEqual([
      {
        category: "complaint_rejected",
        label: DECISION_LABELS.complaint_rejected,
        citedRuleIds: ["CMP-3"],
        manualReviewKind: null,
      },
    ]);
  });

  it("accepts a category change inside the day-10 window (repair to replacement or refund)", () => {
    const ctx = contextFor(
      complaintInput("2026-11-16"),
      templateRoute("R2", "complaint_rejected", ["CMP-1"]),
    );
    const { result, accepted } = run(ctx, {
      outcome: "accepted",
      citedRuleIds: ["CMP-2"],
      reason: "Nowa informacja o wadzie fabrycznej.",
    });
    expect(result).toMatchObject({
      accepted: true,
      category: "complaint_accepted_replacement_or_refund",
    });
    expect(accepted[0]?.citedRuleIds).toContain("CMP-4");
  });

  it("refuses an acceptance outside the return window", () => {
    const ctx = contextFor(
      returnInput("2026-11-23"),
      templateRoute("R8", "return_accepted", ["RET-1", "RET-2"]),
    );
    const { result, accepted } = run(
      ctx,
      { outcome: "accepted", citedRuleIds: ["RET-2"], reason: "x" },
      "2026-12-20",
    );
    expect(result).toEqual({ accepted: false, why: "outside_return_window" });
    expect(accepted).toEqual([]);
  });

  it("refuses a cross-type rule id", () => {
    const { result, accepted } = run(complaintCtx(), {
      outcome: "rejected",
      citedRuleIds: ["RET-1"],
      reason: "x",
    });
    expect(result).toEqual({
      accepted: false,
      why: "not_allowed_for_case_type",
    });
    expect(accepted).toEqual([]);
  });

  it("refuses an unknown rule id", () => {
    const { result } = run(complaintCtx(), {
      outcome: "rejected",
      citedRuleIds: ["CMP-99"],
      reason: "x",
    });
    expect(result).toEqual({ accepted: false, why: "unknown_rule_id" });
  });

  it("refuses with no_change when the resolved category equals the current one", () => {
    const { result, accepted } = run(complaintCtx(), {
      outcome: "accepted",
      citedRuleIds: ["CMP-2"],
      reason: "Klient nalega.",
    });
    expect(result).toEqual({ accepted: false, why: "no_change" });
    expect(accepted).toEqual([]);
  });

  it("compares with the LAST history entry, not the initial one", () => {
    const ctx = complaintCtx();
    ctx.decisionHistory.push({
      category: "complaint_rejected",
      label: DECISION_LABELS.complaint_rejected,
      citedRuleIds: ["CMP-3"],
      source: "chat",
      manualReviewKind: null,
    });
    const { result } = run(ctx, {
      outcome: "rejected",
      citedRuleIds: ["CMP-3"],
      reason: "x",
    });
    expect(result).toEqual({ accepted: false, why: "no_change" });
  });

  it("reports manualReviewKind contact_support for manual_review", () => {
    const { result, accepted } = run(complaintCtx(), {
      outcome: "manual_review",
      citedRuleIds: ["CMP-8"],
      reason: "Sprzeczne informacje.",
    });
    expect(result).toMatchObject({ accepted: true, category: "manual_review" });
    expect(accepted).toEqual([
      {
        category: "manual_review",
        label: DECISION_LABELS.manual_review,
        citedRuleIds: ["CMP-8"],
        manualReviewKind: "contact_support",
      },
    ]);
  });
});

describe("createChangeDecisionTool", () => {
  it("validates input with ChangeDecisionInputSchema and executes through the same path", async () => {
    const accepted: DecisionDataPart[] = [];
    const tool = createChangeDecisionTool({
      caseContext: complaintCtx(),
      policies,
      today: TODAY,
      onAccepted: (part) => accepted.push(part),
    });
    expect(tool.description).toMatch(/new fact/i);
    expect(tool.inputSchema).toBe(ChangeDecisionInputSchema);

    const output = await tool.execute?.(
      { outcome: "rejected", citedRuleIds: ["CMP-3"], reason: "spadło" },
      { toolCallId: "t1", messages: [], context: {} },
    );
    expect(output).toMatchObject({
      accepted: true,
      category: "complaint_rejected",
    });
    expect(accepted).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- request shape (no network: fetch records, then rejects)

interface Recorded {
  url: string;
  body: Record<string, unknown>;
  signal: AbortSignal | null | undefined;
}

function rejectingFetch(
  recorded: Recorded[],
  message = "PROVIDER-SECRET-TEXT upstream said no",
) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : undefined;
    const raw = init?.body ?? (request ? await request.clone().text() : "{}");
    recorded.push({
      url: request?.url ?? String(input),
      body: JSON.parse(String(raw)) as Record<string, unknown>,
      signal: init?.signal ?? request?.signal,
    });
    throw new Error(message);
  }) as unknown as typeof fetch;
}

describe("streamChat request shape and error masking", () => {
  const model = (f: typeof fetch) =>
    getChatModel(
      createLlmProvider({ apiKey: "test-key", fetch: f }),
      "vendor/chat-test",
    );

  it("sends a streaming request with the tool, privacy routing, no temperature and no image", async () => {
    const recorded: Recorded[] = [];
    const controller = new AbortController();
    const response = streamChat(
      complaintCtx(),
      [userMessage("Jaka jest data zakupu?")],
      {
        model: model(rejectingFetch(recorded)),
        policies,
        today: TODAY,
        signal: controller.signal,
        promptsDir,
      },
    );
    await response.text();

    expect(recorded).toHaveLength(1);
    const body = recorded[0]!.body;
    expect(body.model).toBe("vendor/chat-test");
    expect(body.stream).toBe(true);
    // openai/gpt-6-luna endpoints reject `temperature` (real routing 404 on 2026-11-26, ADR-003 §3.4).
    expect(body).not.toHaveProperty("temperature");
    expect(JSON.stringify(body.tools)).toContain("changeDecision");
    expect(
      (body.provider as { data_collection?: string }).data_collection,
    ).toBe("deny");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("image_url");
    expect(serialized).not.toContain("data:image");
    const messages = body.messages as { role: string; content: unknown }[];
    expect(messages[0]?.role).toBe("system");
    expect(JSON.stringify(messages[0])).toContain("GUARDRAILS-MARKER");
    expect(messages[1]?.role).toBe("assistant");
    expect(JSON.stringify(messages[1])).toContain(AUTOMATED_DECISION_NOTICE);
    expect(messages.at(-1)?.role).toBe("user");
  });

  it("combines the request signal with a timeout signal", async () => {
    const recorded: Recorded[] = [];
    const controller = new AbortController();
    const response = streamChat(complaintCtx(), [userMessage("Pytanie")], {
      model: model(rejectingFetch(recorded)),
      policies,
      today: TODAY,
      signal: controller.signal,
      promptsDir,
    });
    await response.text();
    const signal = recorded[0]!.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });

  it("masks provider errors: the stream carries chat_failed and no provider text", async () => {
    const recorded: Recorded[] = [];
    const response = streamChat(complaintCtx(), [userMessage("Pytanie")], {
      model: model(rejectingFetch(recorded)),
      policies,
      today: TODAY,
      signal: new AbortController().signal,
      promptsDir,
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("chat_failed");
    expect(text).not.toContain("PROVIDER-SECRET-TEXT");
    expect(text).not.toContain("upstream");
  });
});

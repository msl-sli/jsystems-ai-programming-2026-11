import { DefaultChatTransport } from "ai";
import { describe, expect, it } from "vitest";
import {
  buildCaseContext,
  buildChatRequestBody,
  createChatTransport,
} from "./transport";
import type { CaseUIMessage } from "./types";
import {
  accepted,
  chatState,
  freshReturn,
  lateReturn,
  rejected,
  screening,
} from "./test-fixtures";

const userMessage = (id: string, text: string): CaseUIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

describe("buildCaseContext", () => {
  it("takes the context fields from the session state", () => {
    const d = rejected();
    const scr = screening();
    const state = chatState(lateReturn, d, scr);
    expect(buildCaseContext(state)).toEqual({
      caseInput: lateReturn,
      screening: scr,
      decisionHistory: state.decisionHistory,
      firstMessage: d.firstMessage,
    });
  });

  it("includes llmFindings only when the session has them", () => {
    const base = chatState(freshReturn, accepted());
    const llmFindings = {
      photoFindingsPl: "Opis",
      evidence: [],
      signalReview: {},
    };
    expect(buildCaseContext({ ...base, llmFindings }).llmFindings).toEqual(
      llmFindings,
    );
    expect("llmFindings" in buildCaseContext(base)).toBe(false);
  });

  it("throws when the session has no first message", () => {
    const state = { ...chatState(freshReturn, accepted()), firstMessage: null };
    expect(() => buildCaseContext(state)).toThrow();
  });
});

describe("buildChatRequestBody (ADR-001 chat transport)", () => {
  it("sends { caseContext, messages } with the whole conversation, last user message last", () => {
    const ctx = buildCaseContext(chatState(lateReturn, rejected()));
    const messages = [
      userMessage("1", "pierwsze pytanie"),
      userMessage("2", "jaką datę zakupu podałem?"),
    ];
    const body = buildChatRequestBody(ctx, messages);
    expect(Object.keys(body).sort()).toEqual(["caseContext", "messages"]);
    expect(body.caseContext).toBe(ctx);
    expect(body.messages).toEqual(messages);
    expect(body.messages.at(-1)).toEqual(messages[1]);
  });
});

type Prepared = { body: { caseContext: { decisionHistory: unknown[] } } };

describe("createChatTransport", () => {
  it("is a DefaultChatTransport", () => {
    const transport = createChatTransport(() =>
      buildCaseContext(chatState(lateReturn, rejected())),
    );
    expect(transport).toBeInstanceOf(DefaultChatTransport);
  });

  it("reads the case context at request time so decision changes are included", async () => {
    let state = chatState(freshReturn, accepted());
    const transport = createChatTransport(() => buildCaseContext(state));
    const prepare = () =>
      (
        transport as unknown as {
          prepareSendMessagesRequest: (o: unknown) => Promise<Prepared>;
        }
      ).prepareSendMessagesRequest({
        id: "c",
        messages: [userMessage("1", "hej")],
        trigger: "submit-message",
        messageId: undefined,
        requestMetadata: undefined,
        body: undefined,
        credentials: undefined,
        headers: undefined,
        api: "/api/chat",
      });
    expect((await prepare()).body.caseContext.decisionHistory).toHaveLength(1);
    state = {
      ...state,
      decisionHistory: [...state.decisionHistory, ...state.decisionHistory],
    };
    expect((await prepare()).body.caseContext.decisionHistory).toHaveLength(2);
  });
});

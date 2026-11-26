import { DefaultChatTransport } from "ai";
import type { ChatCaseContext } from "@/domain/contracts";
import type { CaseSessionState } from "@/features/case-session";
import type { CaseUIMessage } from "./types";

export const CHAT_API = "/api/chat";

/** Case context of the chat request (ADR-001 chat transport), read from the session state. */
export function buildCaseContext(state: CaseSessionState): ChatCaseContext {
  const { caseInput, screening, firstMessage, llmFindings, decisionHistory } =
    state;
  if (!caseInput || !screening || !firstMessage) {
    throw new Error("Chat context requires a completed case session");
  }
  return {
    caseInput,
    screening,
    decisionHistory,
    firstMessage,
    ...(llmFindings ? { llmFindings } : {}),
  };
}

export function buildChatRequestBody(
  caseContext: ChatCaseContext,
  messages: CaseUIMessage[],
) {
  return { caseContext, messages };
}

/**
 * `getCaseContext` is called for every request, so decision changes received in the chat are
 * part of the next request's `decisionHistory`.
 */
export function createChatTransport(getCaseContext: () => ChatCaseContext) {
  return new DefaultChatTransport<CaseUIMessage>({
    api: CHAT_API,
    prepareSendMessagesRequest: ({ messages }) => ({
      body: buildChatRequestBody(getCaseContext(), messages),
    }),
  });
}

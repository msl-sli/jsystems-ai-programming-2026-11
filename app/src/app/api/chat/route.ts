import "server-only";
import { z } from "zod";
import {
  CHAT_MESSAGES_MAX,
  CHAT_MESSAGE_MAX_CHARS,
  ChatCaseContextSchema,
} from "@/domain/contracts";
import { todayInTimeZone } from "@/domain/dates";
import { streamChat } from "@/server/ai/chat";
import type { ChatUIMessage } from "@/server/ai/chat-types";
import { getChatModel } from "@/server/llm";
import { loadPolicies } from "@/server/policies";
import {
  defaultDeps,
  handle,
  readValidatedBody,
  type ApiDeps,
} from "@/server/http/handler";

const ENDPOINT = "/api/chat";
const BODY_LIMIT_BYTES = 256 * 1024;

/** Timeout (60 s, enforced in streamChat) + 5 s (ADR-002 section 3). */
export const maxDuration = 65;

const TextPart = z.looseObject({ type: z.literal("text"), text: z.string() });

/** User messages carry text parts only (AC-36); assistant messages may carry the parts the stream produced. */
const UserMessage = z.looseObject({
  id: z.string().min(1),
  role: z.literal("user"),
  parts: z.array(TextPart).min(1),
});
const AssistantMessage = z.looseObject({
  id: z.string().min(1),
  role: z.literal("assistant"),
  parts: z.array(z.looseObject({ type: z.string() })),
});

const userText = (message: z.infer<typeof UserMessage>) =>
  message.parts.map((part) => part.text).join("");

const ChatRequestSchema = z
  .strictObject({
    caseContext: ChatCaseContextSchema,
    messages: z
      .array(z.discriminatedUnion("role", [UserMessage, AssistantMessage]))
      .min(1)
      .max(CHAT_MESSAGES_MAX),
  })
  .superRefine((value, ctx) => {
    for (const message of value.messages) {
      if (
        message.role === "user" &&
        userText(message).length > CHAT_MESSAGE_MAX_CHARS
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["messages"],
          message: "message too long",
        });
      }
    }
    const last = value.messages[value.messages.length - 1];
    if (last?.role !== "user" || userText(last).trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["messages"],
        message: "last message must be non-empty user text",
      });
    }
  });

export function createChatHandler(deps: ApiDeps = defaultDeps) {
  return (request: Request): Promise<Response> =>
    handle(ENDPOINT, deps, async (env) => {
      const { caseContext, messages } = await readValidatedBody(
        request,
        BODY_LIMIT_BYTES,
        ChatRequestSchema,
        { image: false },
      );
      const policies = loadPolicies(env.policiesDir);
      const provider = deps.createProvider(env);
      // Streaming errors are masked inside streamChat (chat_failed); this log line is written when the stream starts.
      const response = streamChat(
        caseContext,
        messages as unknown as ChatUIMessage[],
        {
          model: getChatModel(provider, env.llmModel),
          policies,
          today: todayInTimeZone(env.appTimeZone, deps.now()),
          signal: request.signal,
        },
      );
      return { response, log: { models: { chat: env.llmModel } } };
    });
}

export const POST = createChatHandler();

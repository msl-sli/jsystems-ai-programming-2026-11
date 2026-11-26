"use client";

import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { DecisionDataPartSchema } from "@/domain/contracts";
import { useCaseSession } from "@/features/case-session";
import { AssistantMessage } from "./assistant-message";
import { CaseSummaryCard } from "./case-summary-card";
import { ChatErrorNotice } from "./chat-error-notice";
import { ChatInput } from "./chat-input";
import { FirstMessageView } from "./first-message-view";
import { NewCaseButton } from "./new-case-button";
import { buildCaseContext, createChatTransport } from "./transport";
import type { CaseUIMessage } from "./types";
import { TypingIndicator } from "./typing-indicator";

/** Stable getter of the latest value; the transport calls it per request. */
function useLatest<T>(value: T): () => T {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return useCallback(() => ref.current, []);
}

/** Chat screen (ADR-001 section 3): summary, conversation, input; rendered in the `chat` state. */
export function ChatScreen() {
  const { state, dispatch } = useCaseSession();

  // The transport reads the latest session state per request (decision changes included).
  const getState = useLatest(state);
  const [transport] = useState(() =>
    createChatTransport(() => buildCaseContext(getState())),
  );

  const { messages, sendMessage, regenerate, status } = useChat<CaseUIMessage>({
    id: `case-chat-${state.resetCount}`,
    transport,
    onData: (part) => {
      if (part.type !== "data-decision") return;
      const parsed = DecisionDataPartSchema.safeParse(part.data);
      if (parsed.success) {
        dispatch({ type: "decisionChanged", part: parsed.data });
      }
    },
  });

  const send = useCallback(
    (text: string) => {
      void sendMessage({ text });
    },
    [sendMessage],
  );

  const { caseInput, firstMessage, decisionHistory } = state;
  const latest = decisionHistory.at(-1);
  if (!caseInput || !firstMessage || !latest) return null;

  const busy = status === "submitted" || status === "streaming";
  const emphasized =
    latest.category === "manual_review" &&
    latest.manualReviewKind === "better_photo";
  const lastId = messages.at(-1)?.id;

  return (
    <div data-testid="chat-screen" className="flex flex-col gap-3">
      {/* Narrow screens: the button sits above the card so the card keeps the full width. */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <CaseSummaryCard
            caseInput={caseInput}
            photoUrl={state.photoUrl}
            decision={latest}
          />
        </div>
        <NewCaseButton
          emphasized={emphasized}
          onConfirm={() => dispatch({ type: "newCase" })}
        />
      </div>

      <div className="relative h-[55dvh] min-h-72">
        <MessageScrollerProvider autoScroll>
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent className="p-1">
                <MessageScrollerItem messageId="first-message">
                  <Message align="start">
                    <MessageContent>
                      <Bubble variant="muted" className="max-w-full">
                        <BubbleContent>
                          <FirstMessageView firstMessage={firstMessage} />
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>

                {messages.map((message) => (
                  <MessageScrollerItem key={message.id} messageId={message.id}>
                    {message.role === "user" ? (
                      <Message align="end">
                        <MessageContent>
                          <Bubble variant="default" align="end">
                            <BubbleContent className="whitespace-pre-wrap">
                              {message.parts.map((part, i) =>
                                part.type === "text" ? (
                                  <span key={i}>{part.text}</span>
                                ) : null,
                              )}
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    ) : (
                      <Message align="start">
                        <MessageContent>
                          <Bubble variant="muted" className="max-w-full">
                            <BubbleContent>
                              <AssistantMessage
                                message={message}
                                streaming={
                                  status === "streaming" &&
                                  message.id === lastId
                                }
                              />
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    )}
                  </MessageScrollerItem>
                ))}

                {busy ? (
                  <MessageScrollerItem messageId="typing">
                    <TypingIndicator />
                  </MessageScrollerItem>
                ) : null}
                {status === "error" ? (
                  <MessageScrollerItem messageId="error">
                    <ChatErrorNotice onRetry={() => void regenerate()} />
                  </MessageScrollerItem>
                ) : null}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton direction="end" />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>

      <ChatInput busy={busy} onSend={send} />
    </div>
  );
}

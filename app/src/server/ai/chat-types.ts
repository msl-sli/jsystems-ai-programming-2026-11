import type { UIMessage } from "ai";
import type { DecisionDataPart } from "@/domain/contracts";

/** Custom data parts of the chat UI message stream (ADR-001 section 3, ADR-002 section 5). */
export type ChatDataParts = { decision: DecisionDataPart };

/** Server-side UI message type; the client mirrors it in `features/chat` (`CaseUIMessage`). */
export type ChatUIMessage = UIMessage<unknown, ChatDataParts>;

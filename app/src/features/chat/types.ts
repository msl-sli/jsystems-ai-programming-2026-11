import type { UIMessage } from "ai";
import type { DecisionDataPart } from "@/domain/contracts";

/** Client mirror of the server `ChatUIMessage` (no server imports allowed in features). */
export type CaseUIMessage = UIMessage<unknown, { decision: DecisionDataPart }>;

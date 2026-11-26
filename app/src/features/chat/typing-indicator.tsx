import { Spinner } from "@/components/ui/spinner";
import { CHAT_TEXTS as T } from "./texts";

/** AC-31: shown while the agent is answering. */
export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label={T.typing}
      className="flex items-center gap-2 text-sm text-text-secondary"
    >
      <Spinner aria-hidden="true" role="presentation" />
      <span aria-hidden="true">{T.typing}</span>
    </div>
  );
}

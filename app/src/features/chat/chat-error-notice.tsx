import { Button } from "@/components/ui/button";
import { CHAT_TEXTS as T } from "./texts";

/** AC-37: inline error under the failed customer message. */
export function ChatErrorNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-decision-rejected-fg"
    >
      <span>{T.error}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {T.retry}
      </Button>
    </div>
  );
}

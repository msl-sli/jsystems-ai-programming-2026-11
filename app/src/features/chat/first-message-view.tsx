import type { FirstMessage } from "@/domain/contracts";
import { CHAT_TEXTS as T } from "./texts";

/**
 * AC-25..AC-28: the first agent message from structured fields, fixed order, no Markdown parsing
 * (ADR-001 section 3 "First message").
 */
export function FirstMessageView({
  firstMessage: fm,
}: {
  firstMessage: FirstMessage;
}) {
  return (
    <div data-testid="first-message" className="flex flex-col gap-3">
      <p>{fm.greeting}</p>
      <p>
        <strong>{fm.decisionLabel}</strong>
      </p>
      <p>{fm.justification}</p>
      <section className="flex flex-col gap-1">
        <h3 className="font-semibold">{T.firstMessageFindings}</h3>
        <p>{fm.photoFindings}</p>
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="font-semibold">{T.firstMessageNextSteps}</h3>
        <ol className="list-decimal space-y-1 pl-5">
          {fm.nextSteps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </section>
      <p className="text-xs text-text-secondary">{fm.notice}</p>
    </div>
  );
}

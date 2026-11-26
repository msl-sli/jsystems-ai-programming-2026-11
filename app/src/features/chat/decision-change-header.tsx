import {
  AUTOMATED_DECISION_NOTICE,
  type DecisionDataPart,
} from "@/domain/contracts";
import { CHAT_TEXTS as T } from "./texts";

export function DecisionNotice() {
  return (
    <p className="text-xs text-text-secondary">{AUTOMATED_DECISION_NOTICE}</p>
  );
}

/** AC-33: header of an answer that changes the decision. */
export function DecisionChangeHeader({
  part,
  withNotice = true,
}: {
  part: DecisionDataPart;
  withNotice?: boolean;
}) {
  return (
    <div data-testid="decision-change" className="flex flex-col gap-1">
      <p>
        <strong>{T.decisionChange(part.label)}</strong>
      </p>
      {withNotice ? <DecisionNotice /> : null}
    </div>
  );
}

import { AgentMarkdown } from "./agent-markdown";
import { DecisionChangeHeader, DecisionNotice } from "./decision-change-header";
import type { CaseUIMessage } from "./types";

/**
 * Renders assistant parts by switching on `part.type` (ADR-001 section 3): `data-decision` header
 * first, then the text, then the AC-26 notice when the decision changed; other parts render nothing.
 */
export function AssistantMessage({
  message,
  streaming = false,
}: {
  message: CaseUIMessage;
  streaming?: boolean;
}) {
  const headers: React.ReactNode[] = [];
  const body: React.ReactNode[] = [];
  message.parts.forEach((part, i) => {
    switch (part.type) {
      case "data-decision":
        headers.push(
          <DecisionChangeHeader key={i} part={part.data} withNotice={false} />,
        );
        break;
      case "text":
        body.push(
          <AgentMarkdown key={i} streaming={streaming}>
            {part.text}
          </AgentMarkdown>,
        );
        break;
      default:
        break;
    }
  });
  return (
    <div className="flex flex-col gap-2">
      {headers}
      {body}
      {headers.length > 0 ? <DecisionNotice /> : null}
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import type { DecisionCategory } from "@/domain/contracts";
import { cn } from "@/lib/utils";

export type DecisionTone = "accepted" | "rejected" | "manual";

export function decisionTone(category: DecisionCategory): DecisionTone {
  switch (category) {
    case "return_accepted":
    case "complaint_accepted_repair":
    case "complaint_accepted_replacement_or_refund":
      return "accepted";
    case "return_rejected":
    case "complaint_rejected":
      return "rejected";
    case "manual_review":
      return "manual";
  }
}

const TONE_CLASSES: Record<DecisionTone, string> = {
  accepted: "border-brand-success/30 bg-brand-success/10 text-decision-accepted-fg",
  rejected: "border-destructive/30 bg-destructive/10 text-decision-rejected-fg",
  manual: "border-border bg-accent text-accent-foreground",
};

/** Decision label badge: success / error / neutral token per outcome (AC-29). */
export function DecisionBadge({
  category,
  label,
  className,
}: {
  category: DecisionCategory;
  label: string;
  className?: string;
}) {
  const tone = decisionTone(category);
  return (
    <Badge
      variant="outline"
      data-tone={tone}
      className={cn(
        "h-auto max-w-full whitespace-normal py-1 text-center",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </Badge>
  );
}

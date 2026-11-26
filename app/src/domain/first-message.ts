import {
  AUTOMATED_DECISION_NOTICE,
  FirstMessageSchema,
  type FirstMessage,
} from "./contracts";
import { GREETING, PHOTO_TIPS, daysPl } from "./templates";

export { daysPl };

const MIN_PHOTO_TIPS = 2; // AC-23

export interface FirstMessageParts {
  greeting?: string;
  decisionLabel: string;
  justification: string;
  photoFindings: string;
  nextSteps: string[];
}

/** Assembles and validates the first message; the notice is always the fixed AC-26 text. */
export function buildFirstMessage(parts: FirstMessageParts): FirstMessage {
  return FirstMessageSchema.parse({
    greeting: parts.greeting ?? GREETING,
    decisionLabel: parts.decisionLabel,
    justification: parts.justification,
    photoFindings: parts.photoFindings,
    nextSteps: parts.nextSteps,
    notice: AUTOMATED_DECISION_NOTICE,
  });
}

/** Canonical Markdown of the first message, in AC-25 order. */
export function firstMessageToText(fm: FirstMessage): string {
  const steps = fm.nextSteps.map((step, i) => `${i + 1}. ${step}`).join("\n");
  return [
    fm.greeting,
    `**${fm.decisionLabel}**`,
    fm.justification,
    `### Co widzimy na zdjęciu\n\n${fm.photoFindings}`,
    `### Kolejne kroki\n\n${steps}`,
    fm.notice,
  ].join("\n\n");
}

/** Appends fixed photo tips until at least two are present (detected by exact match). */
export function ensurePhotoTips(nextSteps: string[]): string[] {
  const present = nextSteps.filter((step) => PHOTO_TIPS.includes(step)).length;
  const missing = PHOTO_TIPS.filter((tip) => !nextSteps.includes(tip));
  return [
    ...nextSteps,
    ...missing.slice(0, Math.max(0, MIN_PHOTO_TIPS - present)),
  ];
}

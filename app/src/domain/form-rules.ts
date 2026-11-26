import {
  DESCRIPTION_MAX,
  earliestPurchaseDate,
  type CaseType,
} from "./case-schema";

export const descriptionMaxLength = DESCRIPTION_MAX;

export const AI_NOTICE =
  "Zdjęcie i opis zostaną przeanalizowane automatycznie przez system AI. Nie umieszczaj na zdjęciu danych osobowych.";

export function purchaseDateBounds(today: string): {
  min: string;
  max: string;
} {
  return { min: earliestPurchaseDate(today), max: today };
}

const DESCRIPTION_BASE_LABEL = "Powód / opis problemu";

export function descriptionLabel(caseType: CaseType | undefined): string {
  if (caseType === "complaint") return `${DESCRIPTION_BASE_LABEL} (wymagane)`;
  if (caseType === "return") return `${DESCRIPTION_BASE_LABEL} (opcjonalne)`;
  return DESCRIPTION_BASE_LABEL;
}

export function photoHint(caseType: CaseType | undefined): string | null {
  if (caseType === "return") {
    return "Pokaż cały sprzęt, tak aby było widać, że nie nosi śladów użytkowania.";
  }
  if (caseType === "complaint")
    return "Pokaż wyraźnie uszkodzenie lub problem.";
  return null;
}

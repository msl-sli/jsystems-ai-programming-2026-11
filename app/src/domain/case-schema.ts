import { format, isValid, parseISO, subYears } from "date-fns";
import { z } from "zod";

/** Case types (AC-02). Values are code identifiers; Polish labels live in CASE_TYPE_LABELS. */
export const CASE_TYPES = ["complaint", "return"] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  complaint: "Reklamacja",
  return: "Zwrot",
};

/** Equipment categories in PRD order (AC-03, ADR-000 §5). */
export const CASE_CATEGORIES = [
  "laptop",
  "smartphone",
  "tablet",
  "monitor",
  "tv",
  "audio",
  "console",
  "other",
] as const;
export type CaseCategory = (typeof CASE_CATEGORIES)[number];

export const CASE_CATEGORY_LABELS: Record<CaseCategory, string> = {
  laptop: "Laptop",
  smartphone: "Smartfon",
  tablet: "Tablet",
  monitor: "Monitor",
  tv: "Telewizor",
  audio: "Słuchawki / audio",
  console: "Konsola do gier",
  other: "Inne",
};

export const PRODUCT_NAME_MIN = 2;
export const PRODUCT_NAME_MAX = 100;
export const COMPLAINT_DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 2000;
export const PURCHASE_DATE_MAX_YEARS = 10;

/** Polish validation messages. AC-04..AC-07 strings are verbatim from the PRD. */
export const CASE_INPUT_MESSAGES = {
  caseTypeRequired: "Wybierz rodzaj zgłoszenia.",
  categoryRequired: "Wybierz kategorię sprzętu.",
  productName: "Podaj nazwę lub model sprzętu (2–100 znaków).",
  purchaseDateRequired: "Podaj datę zakupu.",
  purchaseDateFuture: "Data zakupu nie może być z przyszłości.",
  purchaseDateTooOld: "Podaj datę zakupu z ostatnich 10 lat.",
  complaintDescription: "Opisz problem (20–2000 znaków).",
  returnDescriptionTooLong: "Opis może mieć maksymalnie 2000 znaków.",
} as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = parseISO(value);
  return isValid(parsed) && format(parsed, "yyyy-MM-dd") === value;
}

/** Earliest accepted purchase date: today minus 10 years (month-end clamped). */
export function earliestPurchaseDate(today: string): string {
  return format(subYears(parseISO(today), PURCHASE_DATE_MAX_YEARS), "yyyy-MM-dd");
}

const purchaseDateField = z
  .string({ error: CASE_INPUT_MESSAGES.purchaseDateRequired })
  .refine(isIsoCalendarDate, { error: CASE_INPUT_MESSAGES.purchaseDateRequired, abort: true });

function buildSchema(dateField: z.ZodType<string>) {
  return z
    .strictObject({
      caseType: z.enum(CASE_TYPES, { error: CASE_INPUT_MESSAGES.caseTypeRequired }),
      category: z.enum(CASE_CATEGORIES, { error: CASE_INPUT_MESSAGES.categoryRequired }),
      productName: z
        .string({ error: CASE_INPUT_MESSAGES.productName })
        .trim()
        .min(PRODUCT_NAME_MIN, { error: CASE_INPUT_MESSAGES.productName })
        .max(PRODUCT_NAME_MAX, { error: CASE_INPUT_MESSAGES.productName }),
      purchaseDate: dateField,
      description: z.string().trim().default(""),
    })
    .superRefine(
      (data, ctx) => {
        // Runs even when other fields failed, so all field errors show at once (AC-12).
        const raw = data as { caseType?: unknown; description?: unknown };
        const description = typeof raw.description === "string" ? raw.description.trim() : "";
        if (raw.caseType === "complaint") {
          if (
            description.length < COMPLAINT_DESCRIPTION_MIN ||
            description.length > DESCRIPTION_MAX
          ) {
            ctx.addIssue({
              code: "custom",
              path: ["description"],
              message: CASE_INPUT_MESSAGES.complaintDescription,
            });
          }
        } else if (description.length > DESCRIPTION_MAX) {
          ctx.addIssue({
            code: "custom",
            path: ["description"],
            message: CASE_INPUT_MESSAGES.returnDescriptionTooLong,
          });
        }
      },
      { when: () => true },
    );
}

/**
 * Server-side case schema: field rules without the "today"-relative date bounds.
 * The server recomputes date facts in APP_TIME_ZONE and is authoritative (ADR-001 §3).
 */
export const CaseInputSchema = buildSchema(purchaseDateField);
export type CaseInput = z.output<typeof CaseInputSchema>;

/** Form schema: field rules plus AC-05 bounds relative to `today` (YYYY-MM-DD). */
export function buildCaseInputSchema(today: string) {
  const earliest = earliestPurchaseDate(today);
  const boundedDate = purchaseDateField.superRefine((value, ctx) => {
    if (value > today) {
      ctx.addIssue({ code: "custom", message: CASE_INPUT_MESSAGES.purchaseDateFuture });
    } else if (value < earliest) {
      ctx.addIssue({ code: "custom", message: CASE_INPUT_MESSAGES.purchaseDateTooOld });
    }
  });
  return buildSchema(boundedDate);
}

import {
  addMonths,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";
import type { DeterministicFacts } from "./contracts";

const RETURN_WINDOW_DAYS = 14; // RET-1
const DEAD_ON_ARRIVAL_DAYS = 30; // CMP-4
const WARRANTY_MONTHS = 24; // CMP-1

/** YYYY-MM-DD of `now` in the given IANA time zone. */
export function todayInTimeZone(timeZone: string, now: Date): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Deterministic date facts from two plain calendar dates (YYYY-MM-DD, no time zone).
 * A purchase date after `today` gives negative days and all windows false; it never throws.
 */
export function computeFacts(
  purchaseDate: string,
  today: string,
): DeterministicFacts {
  const purchase = parseISO(purchaseDate);
  const days = differenceInCalendarDays(parseISO(today), purchase);
  const notInFuture = days >= 0;
  const warrantyEnd = format(
    addMonths(purchase, WARRANTY_MONTHS),
    "yyyy-MM-dd",
  );
  return {
    today,
    daysSincePurchase: days,
    withinReturnWindow: notInFuture && days <= RETURN_WINDOW_DAYS,
    withinWarranty: notInFuture && today <= warrantyEnd,
    withinDeadOnArrival: notInFuture && days <= DEAD_ON_ARRIVAL_DAYS,
  };
}

"use client";

import { format } from "date-fns";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => format(new Date(), "yyyy-MM-dd");
const getServerSnapshot = () => null;

/**
 * The browser's local date (YYYY-MM-DD) for the form's date rules (ADR-001 §3), or null while
 * prerendering on the server: with Cache Components a clock read during prerender is not allowed,
 * and the server's date is not the customer's "today" anyway.
 */
export function useBrowserToday(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

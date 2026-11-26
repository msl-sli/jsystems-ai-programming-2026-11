"use client";

import { useLayoutEffect } from "react";

/** AC-39: warn before reload/close while a case is in progress; nothing is registered otherwise. */
export function useLeavePageGuard(active: boolean) {
  // Layout effect: the guard is in place before the change that armed it is painted.
  useLayoutEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}

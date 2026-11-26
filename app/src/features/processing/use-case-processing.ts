"use client";

import { useEffect, useRef } from "react";
import { useCaseSession } from "@/features/case-session/provider";
import {
  runCaseProcessing,
  type RunCaseProcessingParams,
} from "./run-case-processing";

type Deps = Pick<RunCaseProcessingParams, "fetch" | "compress">;

/**
 * Runs the processing flow whenever the session enters `processing` (submit and retry).
 * One run per entry: StrictMode's simulated unmount/remount keeps the running attempt, because
 * the abort on cleanup is deferred to a microtask and skipped when the effect re-runs at once.
 */
export function useCaseProcessing(deps: Deps = {}) {
  const { state, dispatch } = useCaseSession();
  const processing = state.status === "processing";
  const { caseInput, photo } = state;
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });
  const run = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    if (!processing && run.current) {
      // Left `processing` (done or failed): end the attempt so a retry starts a new one.
      run.current.abort();
      run.current = null;
    }
    if (processing && caseInput && photo && !run.current) {
      const controller = new AbortController();
      run.current = controller;
      runCaseProcessing({
        caseInput,
        photo,
        signal: controller.signal,
        ...depsRef.current,
        onStage: (_stage, { image, screening }) => {
          if (!controller.signal.aborted) {
            dispatch({ type: "screened", screening, image });
          }
        },
      }).then(
        ({ response }) => {
          if (controller.signal.aborted) return;
          dispatch({ type: "decided", response });
        },
        () => {
          if (!controller.signal.aborted) dispatch({ type: "failed" });
        },
      );
    }
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (mounted.current) return;
        run.current?.abort();
        run.current = null;
      });
    };
  }, [processing, caseInput, photo, dispatch]);
}

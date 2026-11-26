"use client";

import { useCallback, useState } from "react";
import { CaseForm } from "@/features/case-form";
import { ChatScreen } from "@/features/chat";
import { ProcessingController, ProcessingScreen } from "@/features/processing";
import { useBrowserToday } from "@/lib/use-browser-today";
import { CaseSessionProvider, useCaseSession } from "./provider";
import { useLeavePageGuard } from "./use-leave-page-guard";

export const PROCESSING_ERROR_BANNER =
  "Nie udało się przeanalizować zgłoszenia. Spróbuj ponownie za chwilę.";

/** Screen switch for the case session state machine (ADR-001 section 3). */
export function CaseSessionView() {
  const { state, dispatch, submit } = useCaseSession();
  const today = useBrowserToday();
  // The form reports entered values through onDirtyChange. Keyed by resetCount so a new case
  // starts clean.
  const [dirtyAt, setDirtyAt] = useState<number | null>(null);
  const formDirty = dirtyAt === state.resetCount;
  const resetCount = state.resetCount;
  const onDirtyChange = useCallback(
    (dirty: boolean) => setDirtyAt(dirty ? resetCount : null),
    [resetCount],
  );

  useLeavePageGuard(
    state.status !== "form" ||
      state.caseInput !== null ||
      state.photo !== null ||
      formDirty,
  );

  if (state.status === "processing") {
    return (
      <ProcessingScreen
        photoUrl={state.photoUrl}
        stage={state.stage ?? "screening"}
      />
    );
  }
  if (state.status === "chat") {
    return <ChatScreen />;
  }

  if (today === null) {
    // Server prerender: the form needs the browser's date, so it renders after hydration.
    return <div aria-busy="true" className="min-h-[60vh]" />;
  }
  return (
    <div>
      <CaseForm
        initialValues={state.caseInput ?? undefined}
        initialPhoto={state.photo}
        bannerError={state.processingError ? PROCESSING_ERROR_BANNER : null}
        onRetry={() => dispatch({ type: "retry" })}
        onSubmit={submit}
        today={today}
        onDirtyChange={onDirtyChange}
      />
    </div>
  );
}

export function CaseSessionPage() {
  return (
    <CaseSessionProvider>
      {/* Stays mounted across screens: runs the submit flow whenever status is "processing". */}
      <ProcessingController />
      <CaseSessionView />
    </CaseSessionProvider>
  );
}

"use client";

import { useState } from "react";
import { CaseForm } from "@/features/case-form";
import { CaseSessionProvider, useCaseSession } from "./provider";
import { useLeavePageGuard } from "./use-leave-page-guard";

export const PROCESSING_ERROR_BANNER =
  "Nie udało się przeanalizować zgłoszenia. Spróbuj ponownie za chwilę.";

/** Screen switch for the case session state machine (ADR-001 section 3). */
export function CaseSessionView() {
  const { state, dispatch, submit } = useCaseSession();
  // The form owns its field values, so user input is detected from bubbling change/input events.
  // Keyed by resetCount so a new case starts clean.
  const [dirtyAt, setDirtyAt] = useState<number | null>(null);
  const formDirty = dirtyAt === state.resetCount;

  useLeavePageGuard(
    state.status !== "form" ||
      state.caseInput !== null ||
      state.photo !== null ||
      formDirty,
  );

  if (state.status === "processing") {
    return (
      <div data-testid="processing-screen" role="status">
        Analizujemy zgłoszenie…
      </div>
    );
  }
  if (state.status === "chat") {
    return <div data-testid="chat-screen">Rozmowa o zgłoszeniu</div>;
  }

  const markDirty = () => setDirtyAt(state.resetCount);
  return (
    <div onChangeCapture={markDirty} onInputCapture={markDirty}>
      <CaseForm
        initialValues={state.caseInput ?? undefined}
        initialPhoto={state.photo}
        bannerError={state.processingError ? PROCESSING_ERROR_BANNER : null}
        onRetry={() => dispatch({ type: "retry" })}
        onSubmit={submit}
      />
    </div>
  );
}

export function CaseSessionPage() {
  return (
    <CaseSessionProvider>
      <CaseSessionView />
    </CaseSessionProvider>
  );
}

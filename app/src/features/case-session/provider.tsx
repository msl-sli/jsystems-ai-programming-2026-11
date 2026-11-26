"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";
import type { CaseInput } from "@/domain/case-schema";
import {
  caseSessionReducer,
  initialCaseSessionState,
  type CaseSessionAction,
  type CaseSessionState,
} from "./reducer";

type CaseSessionContextValue = {
  state: CaseSessionState;
  dispatch: Dispatch<CaseSessionAction>;
  /** Creates the thumbnail object URL (reusing it for the same File) and dispatches `submit`. */
  submit: (values: CaseInput, photo: File) => void;
};

const CaseSessionContext = createContext<CaseSessionContextValue | null>(null);

export function CaseSessionProvider({
  children,
  initialState = initialCaseSessionState,
}: {
  children: ReactNode;
  initialState?: CaseSessionState;
}) {
  const [state, dispatch] = useReducer(caseSessionReducer, initialState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const submit = useCallback((values: CaseInput, photo: File) => {
    const current = stateRef.current;
    const photoUrl =
      current.photo === photo && current.photoUrl
        ? current.photoUrl
        : URL.createObjectURL(photo);
    dispatch({ type: "submit", values, photo, photoUrl });
  }, []);

  // Revoke an object URL once the state no longer references it (photo replaced or newCase).
  const previousUrl = useRef<string | null>(initialState.photoUrl);
  useEffect(() => {
    const previous = previousUrl.current;
    if (previous && previous !== state.photoUrl) URL.revokeObjectURL(previous);
    previousUrl.current = state.photoUrl;
  }, [state.photoUrl]);

  const value = useMemo(() => ({ state, dispatch, submit }), [state, submit]);
  return (
    <CaseSessionContext.Provider value={value}>
      {children}
    </CaseSessionContext.Provider>
  );
}

export function useCaseSession(): CaseSessionContextValue {
  const ctx = useContext(CaseSessionContext);
  if (!ctx) {
    throw new Error("useCaseSession must be used inside CaseSessionProvider");
  }
  return ctx;
}

import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";
import { buildCaseInputSchema, type CaseInput } from "@/domain/case-schema";
import type { CaseFormValues } from "./case-form";

/**
 * zod resolver for the case form. The domain schema reports every invalid field at once,
 * including the conditional description rule (AC-12), so no form-side probing is needed.
 */
export function createCaseResolver(today: string) {
  return zodResolver(buildCaseInputSchema(today)) as unknown as Resolver<
    CaseFormValues,
    unknown,
    CaseInput
  >;
}

/** Delimiters used for untrusted text in prompts (ADR-003 section 3.8). */
const DELIMITER_TAGS =
  /<\/?\s*(?:customer_data|customer_description|client_case_context)\s*>/gi;

/** Customer or client-supplied text may not close or reopen a delimiter. */
export function quoteCustomerText(text: string): string {
  return text.replace(DELIMITER_TAGS, "[removed]");
}

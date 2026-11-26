import { test, expect } from "@playwright/test";
import {
  COMPLAINT_LABELS,
  LIVE_TEST_TIMEOUT_MS,
  PHOTO,
  RETURN_LABELS,
  SCREEN_LINES_DESCRIPTION,
  attachEvidence,
  expectConsistentDecision,
  expectFirstMessageStructure,
  firstMessage,
  observeTraffic,
  submitToChat,
  warsawDotted,
  type CaseSpec,
} from "./helpers/live";

// Plan 7a L10/L11: the orchestrator starts the server per mode (DECISION_MODE in the environment
// of the whole playwright run). The env var only selects which file runs; assertions read `mode`
// from the real decision response.

test.setTimeout(LIVE_TEST_TIMEOUT_MS);

const returnNoDescription: CaseSpec = {
  caseType: "Zwrot",
  category: "Smartfon",
  name: "Smartfon testowy",
  purchaseDate: warsawDotted(3),
  photo: PHOTO.phone2,
};

const complaintScreenLines: CaseSpec = {
  caseType: "Reklamacja",
  category: "Laptop",
  name: "Laptop testowy",
  purchaseDate: warsawDotted(10),
  description: SCREEN_LINES_DESCRIPTION,
  photo: PHOTO.laptop1,
};

const returnOverWindow: CaseSpec = {
  caseType: "Zwrot",
  category: "Smartfon",
  name: "Smartfon testowy",
  purchaseDate: warsawDotted(20),
  photo: PHOTO.phone1,
};

test.describe("decisions-only", () => {
  test.skip(process.env.DECISION_MODE !== "decisions-only", "needs DECISION_MODE=decisions-only");

  test("@live L10a: return today-3 without description is decided by a template", async ({ page }, testInfo) => {
    const traffic = observeTraffic(page);
    await submitToChat(page, returnNoDescription);
    const body = await traffic.decisionResponse();
    expect(body.decision.mode).toBe("decisions-only");
    expect(body.decision.decisionPath).toBe("template");
    await expectConsistentDecision(page, body, RETURN_LABELS);
    await expectFirstMessageStructure(page);
    await attachEvidence(testInfo, "L10a", traffic);
  });

  test("@live L10b: complaint with a large photo is decided by a template (R10 or R3 manual review)", async ({ page }, testInfo) => {
    const traffic = observeTraffic(page);
    await submitToChat(page, complaintScreenLines);
    const body = await traffic.decisionResponse();
    expect(body.decision.mode).toBe("decisions-only");
    expect(body.decision.decisionPath).toBe("template");
    await expectConsistentDecision(page, body, COMPLAINT_LABELS);
    await attachEvidence(testInfo, "L10b", traffic);
  });
});

test.describe("llm-always", () => {
  test.skip(process.env.DECISION_MODE !== "llm-always", "needs DECISION_MODE=llm-always");

  test("@live L11a: return over the 14-day window keeps category Zwrot odrzucony, explained by the LLM", async ({ page }, testInfo) => {
    const traffic = observeTraffic(page);
    await submitToChat(page, returnOverWindow);
    const { decision } = await traffic.decisionResponse();
    expect(decision.mode).toBe("llm-always");
    expect(decision.decisionPath).toBe("llm");
    expect(decision.routeRule).toBe("R1");
    expect(decision.label).toBe("Zwrot odrzucony");
    expect(decision.citedRuleIds).toContain("RET-1");
    await expect(firstMessage(page).getByText("Zwrot odrzucony", { exact: true })).toBeVisible();
    await attachEvidence(testInfo, "L11a", traffic);
  });

  test("@live L11b: return today-3 without description goes to the LLM", async ({ page }, testInfo) => {
    const traffic = observeTraffic(page);
    await submitToChat(page, returnNoDescription);
    const body = await traffic.decisionResponse();
    expect(body.decision.mode).toBe("llm-always");
    expect(body.decision.decisionPath).toBe("llm");
    await expectConsistentDecision(page, body, RETURN_LABELS);
    await expectFirstMessageStructure(page);
    await attachEvidence(testInfo, "L11b", traffic);
  });
});

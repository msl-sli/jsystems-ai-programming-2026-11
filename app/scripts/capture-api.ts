/**
 * I4 (plan §5): calls OUR running app's endpoints with real OpenRouter calls behind them and stores
 * every response verbatim (status, headers, raw body; chat as raw SSE) in tests/fixtures/api-captures/
 * with metadata. Frontend tests replay these files; they are never edited by hand.
 *
 *   tsx --conditions=react-server scripts/capture-api.ts <run> [baseUrl]
 *   run = default | decisions-only | llm-always | invalid-key | limits
 *
 * The server must already run in the matching configuration (DECISION_MODE / invalid key).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { format, subDays, subYears } from "date-fns";
import type { CaseInput, CaseImage } from "@/domain/contracts";
import { todayInTimeZone } from "@/domain/dates";
import { SCREENING_PHOTOS, loadScreeningCaseImage } from "./capture-scenarios";

const OUT = path.resolve(import.meta.dirname, "../tests/fixtures/api-captures");
const run = process.argv[2] ?? "default";
const baseUrl = process.argv[3] ?? "http://localhost:3107";
const today = todayInTimeZone("Europe/Warsaw", new Date());
const daysAgo = (n: number) => format(subDays(new Date(`${today}T12:00:00`), n), "yyyy-MM-dd");
const yearsAgo = (n: number) => format(subYears(new Date(`${today}T12:00:00`), n), "yyyy-MM-dd");

function pkg(name: string): string {
  const file = path.resolve(import.meta.dirname, "../node_modules", name, "package.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version;
}

interface Saved {
  name: string;
  status: number;
  ms: number;
  json?: unknown;
  text: string;
}

async function post(name: string, endpoint: string, body: unknown, summary: string): Promise<Saved> {
  const started = Date.now();
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  const ms = Date.now() - started;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    path.join(OUT, `${name}.json`),
    JSON.stringify(
      {
        request: { method: "POST", path: endpoint },
        response: {
          status: res.status,
          statusText: res.statusText,
          headers: Object.fromEntries(res.headers.entries()),
          body: text,
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(OUT, `${name}.meta.json`),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        today,
        run,
        endpoint,
        requestSummary: summary,
        durationMs: ms,
        packages: { next: pkg("next"), ai: pkg("ai"), "@openrouter/ai-sdk-provider": pkg("@openrouter/ai-sdk-provider") },
      },
      null,
      2,
    ),
  );
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    /* SSE or non-JSON */
  }
  const d = (json as { decision?: { decisionPath?: string; routeRule?: string; mode?: string; category?: string } })?.decision;
  console.log(
    `${name}: ${res.status} in ${ms} ms${d ? ` path=${d.decisionPath} rule=${d.routeRule} mode=${d.mode} category=${d.category}` : ""}`,
  );
  return { name, status: res.status, ms, json, text };
}

const photo = (file: string) => {
  const p = SCREENING_PHOTOS.find((x) => x.file === file);
  if (!p) throw new Error(`unknown photo ${file}`);
  return p;
};

async function caseFlow(name: string, caseInput: CaseInput, file: string) {
  const caseImage: CaseImage = await loadScreeningCaseImage(photo(file));
  const summary = `${caseInput.caseType} ${caseInput.category} purchase ${caseInput.purchaseDate} photo ${file}`;
  const s = await post(`${name}-screening`, "/api/cases/screening", { caseInput, caseImage }, summary);
  if (s.status !== 200) return undefined;
  const screening = (s.json as { screening: unknown }).screening;
  const d = await post(`${name}-decision`, "/api/cases/decision", { caseInput, caseImage, screening }, summary);
  if (d.status !== 200) return undefined;
  return { caseInput, screening, decision: d.json as { decision: Record<string, unknown>; firstMessage: unknown; llmFindings?: unknown } };
}

function contextOf(flow: NonNullable<Awaited<ReturnType<typeof caseFlow>>>) {
  const dec = flow.decision.decision;
  return {
    caseInput: flow.caseInput,
    screening: flow.screening,
    decisionHistory: [
      {
        category: dec.category,
        label: dec.label,
        citedRuleIds: dec.citedRuleIds,
        source: "initial",
        manualReviewKind: dec.manualReviewKind,
      },
    ],
    firstMessage: flow.decision.firstMessage,
    ...(flow.decision.llmFindings ? { llmFindings: flow.decision.llmFindings } : {}),
  };
}

const userMsg = (id: string, text: string) => ({ id, role: "user", parts: [{ type: "text", text }] });

const complaintC: CaseInput = {
  caseType: "complaint",
  category: "laptop",
  productName: "Laptop testowy 14",
  purchaseDate: daysAgo(10),
  description: "Na ekranie pojawiają się pionowe linie, sprzęt nie upadł ani nie był zalany.",
};
const returnD: CaseInput = {
  caseType: "return",
  category: "smartphone",
  productName: "Telefon testowy",
  purchaseDate: daysAgo(3),
  description: "Zmiana decyzji zakupowej, sprzęt nieużywany.",
};
const returnE: CaseInput = { ...returnD, description: "" };

async function main() {
  if (run === "default") {
    await caseFlow("a-return-20d", { ...returnE, purchaseDate: daysAgo(20) }, "phone-1.jpg");
    await caseFlow("b-complaint-3y", { ...complaintC, purchaseDate: yearsAgo(3) }, "laptop-2.webp");
    const c = await caseFlow("c-complaint-10d", complaintC, "laptop-1.png");
    await caseFlow("d-return-desc", returnD, "phone-1.jpg");
    await caseFlow("e-return-nodesc", returnE, "phone-2.jpeg");
    if (c) {
      const ctx = contextOf(c);
      const q = userMsg("u1", "Jaką datę zakupu podałem?");
      await post("c-chat-question", "/api/chat", { caseContext: ctx, messages: [q] }, "chat question about purchase date");
      const fact = userMsg("u2", "Urządzenie spadło na podłogę i od tego czasu ma pęknięcie.");
      await post("c-chat-new-fact", "/api/chat", { caseContext: ctx, messages: [fact] }, "chat new fact (drop)");
    }
  } else if (run === "decisions-only" || run === "llm-always") {
    await caseFlow(`${run}-c-complaint-10d`, complaintC, "laptop-1.png");
  } else if (run === "invalid-key") {
    await caseFlow("invalid-key-return", returnE, "phone-2.jpeg");
  } else if (run === "limits") {
    const big = "A".repeat(3 * 1024 * 1024);
    await post("limits-oversize-screening", "/api/cases/screening", `{"pad":"${big}"}`, "3 MB body");
  } else {
    throw new Error(`unknown run ${run}`);
  }
}

void main();

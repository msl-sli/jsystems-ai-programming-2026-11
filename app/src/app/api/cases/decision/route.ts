import "server-only";
import { buildCaseInputSchema } from "@/domain/case-schema";
import {
  DecisionRequestSchema,
  DecisionResponseSchema,
  type DecisionResponse,
} from "@/domain/contracts";
import { computeFacts, todayInTimeZone } from "@/domain/dates";
import { routeCase } from "@/domain/routing";
import { decideWithTemplate } from "@/domain/templates";
import { decideWithLlm } from "@/server/ai/decision";
import { getChatModel } from "@/server/llm";
import { loadPolicies } from "@/server/policies";
import {
  defaultDeps,
  handle,
  purchaseDateBoundary,
  readValidatedBody,
  timeoutSignal,
  type ApiDeps,
} from "@/server/http/handler";

const ENDPOINT = "/api/cases/decision";
const BODY_LIMIT_BYTES = 2.6 * 1024 * 1024;
const TIMEOUT_MS = 50_000;

/** Timeout + 5 s (ADR-002 section 3). */
export const maxDuration = 55;

export function createDecisionHandler(deps: ApiDeps = defaultDeps) {
  return (request: Request): Promise<Response> =>
    handle(ENDPOINT, deps, async (env) => {
      const now = deps.now();
      const schema = DecisionRequestSchema.extend({
        caseInput: buildCaseInputSchema(purchaseDateBoundary(env, now)),
      });
      const { caseInput, caseImage, screening } = await readValidatedBody(
        request,
        BODY_LIMIT_BYTES,
        schema,
        { image: true },
      );
      const policies = loadPolicies(env.policiesDir);
      const today = todayInTimeZone(env.appTimeZone, now);
      const facts = computeFacts(caseInput.purchaseDate, today);
      const route = routeCase(
        caseInput,
        screening,
        facts,
        env.decisionMode,
        env.confidenceThreshold,
      );

      let result: DecisionResponse;
      let models: { chat: string } | undefined;
      if (route.kind === "template") {
        result = decideWithTemplate(
          route,
          caseInput,
          screening,
          facts,
          env.decisionMode,
          policies[caseInput.caseType].ruleIds,
        );
      } else {
        const provider = deps.createProvider(env);
        result = await decideWithLlm(route, caseInput, caseImage, screening, {
          model: getChatModel(provider, env.llmModel),
          policies,
          today,
          mode: env.decisionMode,
          signal: timeoutSignal(request, TIMEOUT_MS),
        });
        models = { chat: env.llmModel };
      }

      const body = DecisionResponseSchema.parse(result);
      return {
        response: Response.json(body),
        log: {
          decisionPath: body.decision.decisionPath,
          routeRule: body.decision.routeRule,
          mode: body.decision.mode,
          ...(models ? { models } : {}),
        },
      };
    });
}

export const POST = createDecisionHandler();

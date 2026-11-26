import "server-only";
import {
  ScreeningRequestSchema,
  ScreeningResponseSchema,
  type ScreeningResult,
} from "@/domain/contracts";
import { screenCase } from "@/server/ai/screening";
import { getDecisionModel } from "@/server/llm";
import {
  defaultDeps,
  handle,
  purchaseDateBoundary,
  readValidatedBody,
  timeoutSignal,
  type ApiDeps,
} from "@/server/http/handler";
import { buildCaseInputSchema } from "@/domain/case-schema";

const ENDPOINT = "/api/cases/screening";
const BODY_LIMIT_BYTES = 2.5 * 1024 * 1024;
const TIMEOUT_MS = 25_000;

/** Timeout + 5 s (ADR-002 section 3). */
export const maxDuration = 30;

function certaintiesOf(screening: ScreeningResult) {
  return Object.fromEntries(
    Object.entries(screening.answers).map(([id, answer]) => [
      id,
      answer.certainty,
    ]),
  );
}

export function createScreeningHandler(deps: ApiDeps = defaultDeps) {
  return (request: Request): Promise<Response> =>
    handle(ENDPOINT, deps, async (env) => {
      const schema = ScreeningRequestSchema.extend({
        caseInput: buildCaseInputSchema(purchaseDateBoundary(env, deps.now())),
      });
      const { caseInput, caseImage } = await readValidatedBody(
        request,
        BODY_LIMIT_BYTES,
        schema,
        { image: true },
      );
      const provider = deps.createProvider(env);
      const screening = await screenCase(caseInput, caseImage, {
        decisionModel: getDecisionModel(provider, env.decisionsModel),
        signal: timeoutSignal(request, deps.timeoutMs ?? TIMEOUT_MS),
        threshold: env.confidenceThreshold,
      });
      const body = ScreeningResponseSchema.parse({ screening });
      return {
        response: Response.json(body),
        log: {
          models: { decisions: screening.model },
          certainties: certaintiesOf(screening),
          costCredits: screening.costCredits,
        },
      };
    });
}

export const POST = createScreeningHandler();

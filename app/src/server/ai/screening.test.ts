import "server-only";
import { describe, expect, it } from "vitest";
import {
  CONDITION_LEVELS,
  OBSERVED_CATEGORY_VALUES,
  PHOTO_QUALITY_VALUES,
  SCREENING_QUESTION_IDS,
  type CaseImage,
} from "@/domain/contracts";
import type { CaseInput } from "@/domain/case-schema";
import {
  createLlmProvider,
  getDecisionModel,
  OPENROUTER_PRIVACY_OPTIONS,
} from "../llm";
import { LlmFailedError, LlmTimeoutError } from "./errors";
import {
  SCREENING_PROMPT_VERSION,
  buildScreeningCall,
  screenCase,
} from "./screening";

const IMAGE_BYTES = Buffer.from("synthetic-jpeg-bytes-for-request-shape-tests");
const caseImage: CaseImage = {
  mediaType: "image/jpeg",
  base64: IMAGE_BYTES.toString("base64"),
  width: 300,
  height: 300,
};
const DESCRIPTION =
  "ZZ-UNIQUE-DESCRIPTION-MARKER: ekran pęka po upadku, proszę o wymianę";
const caseInput: CaseInput = {
  caseType: "complaint",
  category: "laptop",
  productName: "Laptop testowy",
  purchaseDate: "2026-11-01",
  description: DESCRIPTION,
};

describe("buildScreeningCall (arguments of experimental_decide)", () => {
  const call = buildScreeningCall(caseInput, caseImage);

  it("builds the state as instruction text, form JSON and the image file, in that order", () => {
    expect(call.state).toHaveLength(3);
    const [text, json, file] = call.state;
    expect(text).toEqual({
      type: "text",
      text: "Customer-submitted photo of an electronic device for a return or warranty complaint",
    });
    expect(json).toEqual({
      type: "json",
      value: {
        caseType: "complaint",
        formCategory: "laptop",
        productName: "Laptop testowy",
      },
    });
    expect(file).toEqual({
      type: "file",
      mediaType: "image/jpeg",
      data: caseImage.base64,
    });
  });

  it("never carries the description, purchase date, user or session_id", () => {
    const serialized = JSON.stringify(call);
    expect(serialized).not.toContain(DESCRIPTION);
    expect(serialized).not.toContain("ZZ-UNIQUE");
    expect(serialized).not.toContain("purchaseDate");
    expect(serialized).not.toContain("2026-11-01");
    expect(call).not.toHaveProperty("user");
    expect(call).not.toHaveProperty("session_id");
    expect(call.providerOptions.openrouter).not.toHaveProperty("user");
    expect(call.providerOptions.openrouter).not.toHaveProperty("session_id");
  });

  it("routes with data_collection deny and retries at most once", () => {
    expect(call.providerOptions).toEqual(OPENROUTER_PRIVACY_OPTIONS);
    expect(call.providerOptions.openrouter.provider.data_collection).toBe(
      "deny",
    );
    expect(call.maxRetries).toBe(1);
  });

  it("asks exactly the four questions of ADR-003 section 3.2 with the contract values", () => {
    const { questions } = call;
    expect(Object.keys(questions)).toEqual([...SCREENING_QUESTION_IDS]);
    expect(questions.photo_quality.type).toBe("choice");
    expect(Object.keys(questions.photo_quality.criteria)).toEqual([
      ...PHOTO_QUALITY_VALUES,
    ]);
    expect(questions.observed_category.type).toBe("choice");
    expect(Object.keys(questions.observed_category.criteria)).toEqual([
      ...OBSERVED_CATEGORY_VALUES,
    ]);
    expect(questions.visible_damage_or_use.type).toBe("boolean");
    expect(questions.visible_damage_or_use.criteria.true).toMatch(
      /scratches.*cracks.*stains/,
    );
    expect(questions.condition.type).toBe("score");
    expect(questions.condition.criteria).toHaveLength(CONDITION_LEVELS.length);
    for (const question of Object.values(questions))
      expect(question.instructions.length).toBeGreaterThan(10);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const before = JSON.stringify([caseInput, caseImage]);
    expect(JSON.stringify(buildScreeningCall(caseInput, caseImage))).toBe(
      JSON.stringify(call),
    );
    expect(JSON.stringify([caseInput, caseImage])).toBe(before);
  });

  it("exposes the prompt version of the question file", () => {
    expect(SCREENING_PROMPT_VERSION).toBe("2026-11-26.1");
  });
});

interface SeenRequest {
  url: string;
  headers: Headers;
  bodyText: string;
  body: Record<string, unknown>;
}

/** A fetch that records the outgoing request and then rejects. It never returns a response. */
function rejectingFetch(error: unknown) {
  const seen: SeenRequest[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const bodyText = await request.text();
    seen.push({
      url: request.url,
      headers: request.headers,
      bodyText,
      body: JSON.parse(bodyText) as Record<string, unknown>,
    });
    throw error;
  }) as typeof fetch;
  return { fetchImpl, seen };
}

function modelWith(fetchImpl: typeof fetch) {
  return getDecisionModel(
    createLlmProvider({ apiKey: "test-key-not-real", fetch: fetchImpl }),
    "vendor/decisions-test",
  );
}

const abortError = () =>
  new DOMException("This operation was aborted", "AbortError");

describe("screening wire request (transport rejected, no response involved)", () => {
  async function capture() {
    const { fetchImpl, seen } = rejectingFetch(abortError());
    const controller = new AbortController();
    await expect(
      screenCase(caseInput, caseImage, {
        decisionModel: modelWith(fetchImpl),
        signal: controller.signal,
        threshold: 0.8,
      }),
    ).rejects.toBeInstanceOf(LlmTimeoutError);
    return seen;
  }

  it("posts once to the Decisions endpoint", async () => {
    const seen = await capture();
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0]!.url).pathname).toBe("/api/alpha/decisions");
  });

  it("sends the text, the form JSON and the image (wire items), in that order, with the image bytes exactly once", async () => {
    const { body, bodyText } = (await capture())[0]!;
    const state = body.state as unknown[];
    expect(
      state.map((item) =>
        typeof item === "string"
          ? "string"
          : ((item as { type?: string }).type ?? "object"),
      ),
    ).toEqual(["string", "object", "image_url"]);
    expect(state[1]).toEqual({
      caseType: "complaint",
      formCategory: "laptop",
      productName: "Laptop testowy",
    });
    expect(bodyText.split(caseImage.base64)).toHaveLength(2);
  });

  it("sends the documented Decisions wire request for typesafe/jev-1.14", async () => {
    const { fetchImpl, seen } = rejectingFetch(abortError());
    await expect(
      screenCase(caseInput, caseImage, {
        decisionModel: getDecisionModel(
          createLlmProvider({ apiKey: "test-key-not-real", fetch: fetchImpl }),
          "typesafe/jev-1.14",
        ),
        signal: new AbortController().signal,
        threshold: 0.8,
      }),
    ).rejects.toBeInstanceOf(LlmTimeoutError);
    const { body, bodyText } = seen[0]!;
    expect(body.model).toBe("typesafe/jev-1.14");
    expect(body.state).toEqual([
      "Customer-submitted photo of an electronic device for a return or warranty complaint",
      {
        caseType: "complaint",
        formCategory: "laptop",
        productName: "Laptop testowy",
      },
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${caseImage.base64}` },
      },
    ]);
    expect(bodyText.split(caseImage.base64)).toHaveLength(2);
    expect((body.provider as Record<string, unknown>).data_collection).toBe(
      "deny",
    );
    const questions = body.questions as Record<string, { type: string }>;
    expect(Object.values(questions).map((q) => q.type)).toEqual([
      "choice",
      "choice",
      "noul",
      "score",
    ]);
    expect(body).not.toHaveProperty("user");
    expect(body).not.toHaveProperty("session_id");
    expect(bodyText).not.toContain("ZZ-UNIQUE");
    expect(bodyText).not.toContain("2026-11-01");
  });

  it("never sends the description, user or session_id and denies data collection", async () => {
    const { body, bodyText } = (await capture())[0]!;
    expect(bodyText).not.toContain("ZZ-UNIQUE");
    expect(bodyText).not.toContain("2026-11-01");
    expect(body).not.toHaveProperty("user");
    expect(body).not.toHaveProperty("session_id");
    expect((body.provider as Record<string, unknown>).data_collection).toBe(
      "deny",
    );
    expect(body.model).toBe("vendor/decisions-test");
    expect(Object.keys(body.questions as object)).toEqual([
      ...SCREENING_QUESTION_IDS,
    ]);
  });

  it("does not leak the API key into the body", async () => {
    const [request] = await capture();
    expect(request!.bodyText).not.toContain("test-key-not-real");
    expect(request!.headers.get("authorization")).toBe(
      "Bearer test-key-not-real",
    );
  });
});

describe("screenCase error mapping (real transport rejections)", () => {
  it("maps an abort to LlmTimeoutError and does not retry it", async () => {
    const { fetchImpl, seen } = rejectingFetch(abortError());
    await expect(
      screenCase(caseInput, caseImage, {
        decisionModel: modelWith(fetchImpl),
        signal: AbortSignal.abort(),
        threshold: 0.8,
      }),
    ).rejects.toBeInstanceOf(LlmTimeoutError);
    expect(seen.length).toBeLessThanOrEqual(1);
  });

  it("maps a pre-aborted signal to LlmTimeoutError before any request", async () => {
    const { fetchImpl, seen } = rejectingFetch(new Error("unreachable"));
    const controller = new AbortController();
    controller.abort();
    await expect(
      screenCase(caseInput, caseImage, {
        decisionModel: modelWith(fetchImpl),
        signal: controller.signal,
        threshold: 0.8,
      }),
    ).rejects.toBeInstanceOf(LlmTimeoutError);
    expect(seen).toHaveLength(0);
  });

  it("maps any other transport failure to LlmFailedError with a short message", async () => {
    const { fetchImpl, seen } = rejectingFetch(
      new Error(`socket closed ${"x".repeat(500)}`),
    );
    const failure = await screenCase(caseInput, caseImage, {
      decisionModel: modelWith(fetchImpl),
      signal: new AbortController().signal,
      threshold: 0.8,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(LlmFailedError);
    expect((failure as LlmFailedError).message.length).toBeLessThanOrEqual(200);
    expect(seen.length).toBeLessThanOrEqual(2);
  });
});

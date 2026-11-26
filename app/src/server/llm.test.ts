import "server-only";
import { describe, expect, it, vi } from "vitest";
import {
  OPENROUTER_PRIVACY_OPTIONS,
  OPENROUTER_STRUCTURED_OPTIONS,
  createLlmProvider,
  getChatModel,
  getDecisionModel,
  toDecisionsWireBody,
  withDecisionsWireFormat,
} from "./llm";
import { ServerConfigError } from "./env";

describe("llm provider construction", () => {
  it("builds chat and decision models without any network call", () => {
    const fetchSpy = vi.fn();
    const provider = createLlmProvider({
      apiKey: "test-key",
      fetch: fetchSpy as unknown as typeof fetch,
    });
    const chat = getChatModel(provider, "vendor/chat");
    const decision = getDecisionModel(provider, "vendor/decisions");
    expect(chat.modelId).toBe("vendor/chat");
    expect(decision.modelId).toBe("vendor/decisions");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("builds a provider without an injected fetch", () => {
    expect(
      getChatModel(createLlmProvider({ apiKey: "k" }), "a/b").modelId,
    ).toBe("a/b");
  });

  it("exposes privacy and structured routing options", () => {
    expect(OPENROUTER_PRIVACY_OPTIONS).toEqual({
      openrouter: { provider: { data_collection: "deny" } },
    });
    expect(OPENROUTER_STRUCTURED_OPTIONS).toEqual({
      openrouter: {
        provider: { data_collection: "deny", require_parameters: true },
      },
    });
  });
});

const B64 = Buffer.from("synthetic-image-bytes").toString("base64");

describe("toDecisionsWireBody (pure)", () => {
  const base = {
    model: "typesafe/jev-1.14",
    questions: { q: { type: "noul" } },
  };

  it("rewrites text, json and jpeg/png file parts into the documented state items", () => {
    const wire = toDecisionsWireBody({
      ...base,
      state: [
        { type: "text", text: "instruction" },
        { type: "json", value: { a: 1 } },
        {
          type: "file",
          mediaType: "image/jpeg",
          data: { type: "data", data: B64 },
        },
        { type: "file", mediaType: "image/png", data: B64 },
      ],
    });
    expect(wire).toEqual({
      ...base,
      state: [
        "instruction",
        { a: 1 },
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${B64}` },
        },
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${B64}` },
        },
      ],
    });
  });

  it("base64-encodes byte arrays", () => {
    const bytes = new Uint8Array(Buffer.from("synthetic-image-bytes"));
    const wire = toDecisionsWireBody({
      state: [
        {
          type: "file",
          mediaType: "image/jpeg",
          data: { type: "data", data: bytes },
        },
      ],
    }) as { state: unknown[] };
    expect(wire.state).toEqual([
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${B64}` },
      },
    ]);
  });

  it("touches only the state array and leaves other keys intact", () => {
    const wire = toDecisionsWireBody({
      ...base,
      provider: { data_collection: "deny" },
      state: [],
    });
    expect(wire).toEqual({
      ...base,
      provider: { data_collection: "deny" },
      state: [],
    });
  });

  it("passes non-array state, non-objects and already-wire items through unchanged", () => {
    expect(toDecisionsWireBody({ state: "x" })).toEqual({ state: "x" });
    expect(toDecisionsWireBody(null)).toBeNull();
    expect(toDecisionsWireBody("text")).toBe("text");
    const item = {
      type: "image_url",
      image_url: { url: `data:image/png;base64,${B64}` },
    };
    expect(
      toDecisionsWireBody({ state: ["plain", item, { already: true }] }),
    ).toEqual({
      state: ["plain", item, { already: true }],
    });
  });

  it.each(["image/webp", "image/gif", "application/pdf"])(
    "rejects %s file parts",
    (mediaType) => {
      expect(() =>
        toDecisionsWireBody({
          state: [
            { type: "file", mediaType, data: { type: "data", data: B64 } },
          ],
        }),
      ).toThrow(ServerConfigError);
    },
  );

  it("rejects file parts that carry a remote URL or unknown part types", () => {
    expect(() =>
      toDecisionsWireBody({
        state: [
          {
            type: "file",
            mediaType: "image/jpeg",
            data: { type: "url", url: "https://x.test/a.jpg" },
          },
        ],
      }),
    ).toThrow(ServerConfigError);
    expect(() =>
      toDecisionsWireBody({ state: [{ type: "audio", data: "x" }] }),
    ).toThrow(ServerConfigError);
  });
});

describe("withDecisionsWireFormat (records what the inner fetch receives, never answers)", () => {
  function recorder() {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    const inner = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), init });
      throw new Error("recorded");
    }) as typeof fetch;
    return { inner, seen };
  }
  const state = [
    { type: "text", text: "t" },
    {
      type: "file",
      mediaType: "image/jpeg",
      data: { type: "data", data: B64 },
    },
  ];

  it("normalizes the body of /decisions requests and forwards method, headers and signal", async () => {
    const { inner, seen } = recorder();
    const signal = new AbortController().signal;
    await expect(
      withDecisionsWireFormat(inner)(
        "https://openrouter.ai/api/alpha/decisions",
        {
          method: "POST",
          headers: {
            authorization: "Bearer k",
            "content-type": "application/json",
          },
          body: JSON.stringify({ model: "m", state }),
          signal,
        },
      ),
    ).rejects.toThrow("recorded");
    expect(seen).toHaveLength(1);
    expect(JSON.parse(seen[0]!.init!.body as string)).toEqual({
      model: "m",
      state: [
        "t",
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${B64}` },
        },
      ],
    });
    expect(seen[0]!.init!.method).toBe("POST");
    expect(seen[0]!.init!.headers).toEqual({
      authorization: "Bearer k",
      "content-type": "application/json",
    });
    expect(seen[0]!.init!.signal).toBe(signal);
  });

  it("leaves other endpoints and non-JSON bodies untouched", async () => {
    const { inner, seen } = recorder();
    const wrapped = withDecisionsWireFormat(inner);
    const chatBody = JSON.stringify({ state });
    await wrapped("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      body: chatBody,
    }).catch(() => {});
    await wrapped("https://openrouter.ai/api/alpha/decisions", {
      method: "POST",
      body: "not json",
    }).catch(() => {});
    await wrapped("https://openrouter.ai/api/alpha/decisions").catch(() => {});
    expect(seen[0]!.init!.body).toBe(chatBody);
    expect(seen[1]!.init!.body).toBe("not json");
    expect(seen[2]!.init).toBeUndefined();
  });

  it("createLlmProvider always wraps the injected fetch", async () => {
    const { inner, seen } = recorder();
    const model = getDecisionModel(
      createLlmProvider({ apiKey: "k", fetch: inner }),
      "typesafe/jev-1.14",
    );
    await model
      .doEvaluate({
        state,
        questions: {
          q: {
            type: "boolean",
            instructions: "q?",
            criteria: { true: "y", false: "n" },
          },
        },
      } as never)
      .catch(() => {});
    expect(JSON.parse(seen[0]!.init!.body as string).state[1]).toEqual({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${B64}` },
    });
  });
});

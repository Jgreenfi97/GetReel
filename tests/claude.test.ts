import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

import type * as ClaudeModule from "@/lib/claude";
import type * as ErrorsModule from "@/lib/errors";

// The SDK client is reused across calls (and captures `fetch` when created),
// so every test loads fresh modules after stubbing fetch.
async function load(): Promise<typeof ClaudeModule & typeof ErrorsModule> {
  vi.resetModules();
  const claude = await import("@/lib/claude");
  const errors = await import("@/lib/errors");
  return { ...claude, ...errors };
}

/**
 * Exercises the real Anthropic SDK against a stubbed `fetch`, so we check the
 * exact request GetReel sends and how it handles each kind of response.
 */

type Captured = { url: string; headers: Headers; body: Record<string, unknown> };

function messageResponse(content: unknown[], stopReason = "end_turn", extra: Record<string, unknown> = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 },
    ...extra,
  };
}

const ANSWER = {
  interpretation: "A film about rival magicians.",
  candidates: [
    {
      title: "The Prestige",
      year: 2006,
      original_title: null,
      director: "Christopher Nolan",
      confidence: 93,
      why: "Rival magicians in Victorian London.",
      matched_clues: ["rival magicians"],
      unmatched_clues: [],
      scene: "The Transported Man",
      clip_search_query: "The Prestige 2006 Transported Man scene",
    },
  ],
  follow_up_question: null,
};

let captured: Captured[] = [];

function stubFetch(status: number, payload: unknown) {
  captured = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      captured.push({
        url: String(url),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body ?? "{}")),
      });
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json", "request-id": "req_test" },
      });
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  vi.stubEnv("ANTHROPIC_EFFORT", "");
  vi.stubEnv("ANTHROPIC_MODEL", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const input = { description: "two rival magicians", clues: ["victorian london"], excluded: ["The Illusionist (2006)"] };

describe("buildUserMessage", () => {
  it("includes the description, clues and ruled-out films", async () => {
    const { buildUserMessage } = await load();
    const message = buildUserMessage(input);
    expect(message).toContain("<description>\ntwo rival magicians\n</description>");
    expect(message).toContain("- victorian london");
    expect(message).toContain("- The Illusionist (2006)");
  });

  it("omits empty sections", async () => {
    const { buildUserMessage } = await load();
    const message = buildUserMessage({ description: "x y z", clues: [], excluded: [] });
    expect(message).not.toContain("additional_clues");
    expect(message).not.toContain("ruled_out");
  });
});

describe("identifyFilm", () => {
  it("sends a structured-output request with fallbacks and parses the answer", async () => {
    stubFetch(200, messageResponse([{ type: "text", text: JSON.stringify(ANSWER) }]));
    const { identifyFilm } = await load();
    const result = await identifyFilm(input);

    expect(result.candidates[0]).toMatchObject({ title: "The Prestige", year: 2006, confidence: 93 });

    const [request] = captured;
    expect(request.url).toContain("/v1/messages");
    expect(request.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(request.body.model).toBe("claude-opus-5-5");
    expect(request.body.fallbacks).toBe("default");
    expect(request.body).not.toHaveProperty("thinking");
    const outputConfig = request.body.output_config as { effort: string; format: { type: string } };
    expect(outputConfig.effort).toBe("medium");
    expect(outputConfig.format.type).toBe("json_schema");
    const system = request.body.system as { cache_control?: unknown }[];
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("respects model and effort overrides", async () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-5-5");
    vi.stubEnv("ANTHROPIC_EFFORT", "low");
    stubFetch(200, messageResponse([{ type: "text", text: JSON.stringify(ANSWER) }]));
    const { identifyFilm } = await load();
    await identifyFilm(input);
    expect(captured[0].body.model).toBe("claude-sonnet-5-5");
    expect((captured[0].body.output_config as { effort: string }).effort).toBe("low");
  });

  it("turns a refusal into a friendly error", async () => {
    stubFetch(200, messageResponse([], "refusal", { stop_details: { type: "refusal", category: "general_harms", explanation: null } }));
    const { identifyFilm } = await load();
    await expect(identifyFilm(input)).rejects.toMatchObject({ code: "refused" });
  });

  it("reports a rejected API key as a configuration problem", async () => {
    stubFetch(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
    const { identifyFilm, SearchError } = await load();
    const error = await identifyFilm(input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SearchError);
    expect(error).toMatchObject({ code: "auth" });
  });

  it("rejects answers that don't match the schema", async () => {
    stubFetch(200, messageResponse([{ type: "text", text: '{"candidates": "nope"}' }]));
    const { identifyFilm } = await load();
    await expect(identifyFilm(input)).rejects.toMatchObject({ code: "unknown" });
  });
});

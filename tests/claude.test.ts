import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

import type * as ClaudeModule from "@/lib/claude";
import type * as ErrorsModule from "@/lib/errors";

/**
 * Exercises the real Anthropic SDK against a stubbed `fetch`, so we check the
 * exact requests GetReel sends (including the backup-model setup) and how it
 * handles each kind of response.
 */

// The SDK client and the permitted-backups cache live at module level (and the
// client captures `fetch` when created), so every test loads fresh modules.
async function load(): Promise<typeof ClaudeModule & typeof ErrorsModule> {
  vi.resetModules();
  const claude = await import("@/lib/claude");
  const errors = await import("@/lib/errors");
  return { ...claude, ...errors };
}

type Captured = { method: string; url: string; headers: Headers; body: Record<string, unknown> };
type Reply = { status: number; body: unknown };

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
      kind: "movie",
      title: "The Prestige",
      year: 2006,
      original_title: null,
      made_by: "Christopher Nolan",
      confidence: 93,
      why: "Rival magicians in Victorian London.",
      matched_clues: ["rival magicians"],
      unmatched_clues: [],
      scene: "The Transported Man",
      season: null,
      episode: null,
      episode_title: null,
      clip_search_query: "The Prestige 2006 Transported Man scene",
    },
  ],
  follow_up_question: null,
};

const ok = (content: unknown[] = [{ type: "text", text: JSON.stringify(ANSWER) }]): Reply => ({
  status: 200,
  body: messageResponse(content),
});

const modelInfo = (allowed: string[] | null): Reply => ({
  status: 200,
  body: {
    type: "model",
    id: "claude-opus-5-5",
    display_name: "Claude Opus 5.5",
    created_at: "2026-09-01T00:00:00Z",
    allowed_fallback_models: allowed,
  },
});

let captured: Captured[] = [];

/** Route stubbed responses: Models API lookups vs. message requests (in order). */
function stubFetch(messages: Reply[], models: Reply = modelInfo(["claude-opus-5", "claude-opus-4-8"])) {
  captured = [];
  const queue = [...messages];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      captured.push({
        method: init?.method ?? "GET",
        url: u,
        headers: new Headers(init?.headers),
        body: init?.body ? JSON.parse(String(init.body)) : {},
      });
      const reply = u.includes("/v1/models/") ? models : (queue.shift() ?? { status: 500, body: {} });
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "content-type": "application/json", "request-id": "req_test" },
      });
    }),
  );
}

const messageCalls = () => captured.filter((c) => c.url.includes("/v1/messages"));

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  vi.stubEnv("ANTHROPIC_EFFORT", "");
  vi.stubEnv("ANTHROPIC_MODEL", "");
  vi.stubEnv("ANTHROPIC_FALLBACK_MODELS", "");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const input = { description: "two rival magicians", clues: ["victorian london"], excluded: ["The Illusionist (2006)"] };

describe("buildUserMessage", () => {
  it("includes the description, clues and ruled-out titles", async () => {
    const { buildUserMessage } = await load();
    const message = buildUserMessage(input);
    expect(message).toContain("<description>\ntwo rival magicians\n</description>");
    expect(message).toContain("- victorian london");
    expect(message).toContain("- The Illusionist (2006)");
    expect(message).toContain("film or TV show");
  });

  it("omits empty sections", async () => {
    const { buildUserMessage } = await load();
    const message = buildUserMessage({ description: "x y z", clues: [], excluded: [] });
    expect(message).not.toContain("additional_clues");
    expect(message).not.toContain("ruled_out");
  });
});

describe("identifyTitles", () => {
  it("sends a structured-output request and parses the answer", async () => {
    stubFetch([ok()]);
    const { identifyTitles } = await load();
    const result = await identifyTitles(input);

    expect(result.candidates[0]).toMatchObject({ kind: "movie", title: "The Prestige", year: 2006, confidence: 93 });
    expect(result.candidates[0].madeBy).toBe("Christopher Nolan");

    const [request] = messageCalls();
    expect(request.body.model).toBe("claude-opus-5-5");
    expect(request.body).not.toHaveProperty("thinking");
    const outputConfig = request.body.output_config as { effort: string; format: { type: string } };
    expect(outputConfig.effort).toBe("medium");
    expect(outputConfig.format.type).toBe("json_schema");
    const system = request.body.system as { cache_control?: unknown; text: string }[];
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[0].text).toContain("K-dramas");
  });

  it("uses Opus 5 then Opus 4.8 as backup models when Anthropic permits them", async () => {
    stubFetch([ok()]);
    const { identifyTitles } = await load();
    await identifyTitles(input);

    const lookup = captured.find((c) => c.url.includes("/v1/models/claude-opus-5-5"));
    expect(lookup?.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-06-01");

    const [request] = messageCalls();
    expect(request.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-06-01");
    expect(request.body.fallbacks).toEqual([{ model: "claude-opus-5" }, { model: "claude-opus-4-8" }]);
  });

  it("drops backups Anthropic doesn't permit", async () => {
    stubFetch([ok()], modelInfo(["claude-opus-4-8"]));
    const { identifyTitles } = await load();
    await identifyTitles(input);
    expect(messageCalls()[0].body.fallbacks).toEqual([{ model: "claude-opus-4-8" }]);
  });

  it("falls back to Anthropic's default routing when the permitted list can't be read", async () => {
    stubFetch([ok()], { status: 404, body: { type: "error", error: { type: "not_found_error", message: "nope" } } });
    const { identifyTitles } = await load();
    await identifyTitles(input);
    const [request] = messageCalls();
    expect(request.body.fallbacks).toBe("default");
    expect(request.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("falls back to default routing when no pinned backup is permitted", async () => {
    stubFetch([ok()], modelInfo([]));
    const { identifyTitles } = await load();
    await identifyTitles(input);
    expect(messageCalls()[0].body.fallbacks).toBe("default");
  });

  it("retries once with default routing if the pinned chain is rejected", async () => {
    stubFetch([
      { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "bad fallbacks" } } },
      ok(),
    ]);
    const { identifyTitles } = await load();
    const result = await identifyTitles(input);
    expect(result.candidates).toHaveLength(1);
    const calls = messageCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].body.fallbacks).toEqual([{ model: "claude-opus-5" }, { model: "claude-opus-4-8" }]);
    expect(calls[1].body.fallbacks).toBe("default");
  });

  it("honours ANTHROPIC_FALLBACK_MODELS=default and =none without a Models API lookup", async () => {
    vi.stubEnv("ANTHROPIC_FALLBACK_MODELS", "default");
    stubFetch([ok()]);
    let mod = await load();
    await mod.identifyTitles(input);
    expect(messageCalls()[0].body.fallbacks).toBe("default");
    expect(captured.some((c) => c.url.includes("/v1/models/"))).toBe(false);

    vi.stubEnv("ANTHROPIC_FALLBACK_MODELS", "none");
    stubFetch([ok()]);
    mod = await load();
    await mod.identifyTitles(input);
    expect(messageCalls()[0].body).not.toHaveProperty("fallbacks");
    expect(messageCalls()[0].headers.get("anthropic-beta") ?? "").not.toContain("server-side-fallback");
  });

  it("reads an answer that a backup model completed", async () => {
    stubFetch([
      {
        status: 200,
        body: messageResponse(
          [
            { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-5" } },
            { type: "text", text: JSON.stringify(ANSWER) },
          ],
          "end_turn",
          {
            model: "claude-opus-5",
            usage: {
              input_tokens: 900,
              output_tokens: 300,
              iterations: [{ type: "fallback_message", model: "claude-opus-5", input_tokens: 900, output_tokens: 300 }],
            },
          },
        ),
      },
    ]);
    const { identifyTitles } = await load();
    const result = await identifyTitles(input);
    expect(result.candidates[0].title).toBe("The Prestige");
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("(backup model)"));
  });

  it("respects model and effort overrides", async () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-5-5");
    vi.stubEnv("ANTHROPIC_EFFORT", "low");
    stubFetch([ok()], modelInfo([]));
    const { identifyTitles } = await load();
    await identifyTitles(input);
    expect(captured.some((c) => c.url.includes("/v1/models/claude-sonnet-5-5"))).toBe(true);
    expect(messageCalls()[0].body.model).toBe("claude-sonnet-5-5");
    expect((messageCalls()[0].body.output_config as { effort: string }).effort).toBe("low");
  });

  it("turns a refusal (after backups) into a friendly error", async () => {
    stubFetch([
      {
        status: 200,
        body: messageResponse([], "refusal", { stop_details: { type: "refusal", category: "general_harms", explanation: null } }),
      },
    ]);
    const { identifyTitles } = await load();
    await expect(identifyTitles(input)).rejects.toMatchObject({ code: "refused" });
  });

  it("reports a rejected API key as a configuration problem", async () => {
    stubFetch([{ status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } }]);
    const { identifyTitles, SearchError } = await load();
    const error = await identifyTitles(input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SearchError);
    expect(error).toMatchObject({ code: "auth" });
  });

  it("rejects answers that don't match the schema", async () => {
    stubFetch([ok([{ type: "text", text: '{"candidates": "nope"}' }])]);
    const { identifyTitles } = await load();
    await expect(identifyTitles(input)).rejects.toMatchObject({ code: "unknown" });
  });
});

import { describe, expect, it } from "vitest";

import {
  buildFallbackRequest,
  CHAIN_BETA,
  DEFAULT_FALLBACK_CHAIN,
  DEFAULT_ROUTING_BETA,
  describeFallbackSetting,
  parseFallbackSetting,
} from "@/lib/fallbacks";

describe("parseFallbackSetting", () => {
  it("defaults to Opus 5 then Opus 4.8", () => {
    expect(parseFallbackSetting(undefined)).toEqual({ mode: "chain", models: ["claude-opus-5", "claude-opus-4-8"] });
    expect(parseFallbackSetting("  ")).toEqual({ mode: "chain", models: [...DEFAULT_FALLBACK_CHAIN] });
  });

  it("understands default and none", () => {
    expect(parseFallbackSetting("default")).toEqual({ mode: "default" });
    expect(parseFallbackSetting("Auto")).toEqual({ mode: "default" });
    expect(parseFallbackSetting("none")).toEqual({ mode: "none" });
    expect(parseFallbackSetting("off")).toEqual({ mode: "none" });
  });

  it("parses a custom list, de-duplicated and capped at three", () => {
    expect(parseFallbackSetting(" claude-opus-5 , claude-opus-5,claude-opus-4-8, a, b ")).toEqual({
      mode: "chain",
      models: ["claude-opus-5", "claude-opus-4-8", "a"],
    });
    expect(parseFallbackSetting(",,")).toEqual({ mode: "chain", models: [...DEFAULT_FALLBACK_CHAIN] });
  });

  it("summarises the setting for the health check", () => {
    expect(describeFallbackSetting(parseFallbackSetting(undefined))).toEqual(["claude-opus-5", "claude-opus-4-8"]);
    expect(describeFallbackSetting({ mode: "none" })).toBe("none");
  });
});

describe("buildFallbackRequest", () => {
  const chain = parseFallbackSetting(undefined);

  it("sends the permitted chain with the array-form beta", () => {
    expect(buildFallbackRequest(chain, "claude-opus-5-5", ["claude-opus-4-8", "claude-opus-5"])).toEqual({
      betas: [CHAIN_BETA],
      fallbacks: [{ model: "claude-opus-5" }, { model: "claude-opus-4-8" }],
    });
  });

  it("never lists the main model as its own backup", () => {
    const request = buildFallbackRequest(chain, "claude-opus-5", ["claude-opus-5", "claude-opus-4-8"]);
    expect(request?.fallbacks).toEqual([{ model: "claude-opus-4-8" }]);
  });

  it("uses Anthropic's default routing when the chain can't be used", () => {
    const routing = { betas: [DEFAULT_ROUTING_BETA], fallbacks: "default" };
    expect(buildFallbackRequest(chain, "claude-opus-5-5", null)).toEqual(routing);
    expect(buildFallbackRequest(chain, "claude-opus-5-5", [])).toEqual(routing);
    expect(buildFallbackRequest({ mode: "default" }, "claude-opus-5-5", ["claude-opus-5"])).toEqual(routing);
  });

  it("sends nothing when backups are switched off", () => {
    expect(buildFallbackRequest({ mode: "none" }, "claude-opus-5-5", ["claude-opus-5"])).toBeNull();
  });
});

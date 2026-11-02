import type Anthropic from "@anthropic-ai/sdk";

/**
 * The "backup model": if Claude's safety filters wrongly decline a harmless
 * description (it happens with plots about viruses, hackers, drugs…), the API
 * re-runs the same request on a backup model inside the same call.
 *
 * GetReel's default chain stays as close to Claude Opus 5.5 as possible while
 * being a little more permissive:
 *
 *   1. Claude Opus 5   — the 5-series model just before 5.5, nearly as capable,
 *                        without the biology filter 5.5 added.
 *   2. Claude Opus 4.8 — last resort, with a lighter filter set again.
 *
 * Configure with ANTHROPIC_FALLBACK_MODELS:
 *   (unset)                        the chain above
 *   "claude-opus-5,claude-opus-4-8" any list of up to three models, in order
 *   "default"                      let Anthropic pick per refusal category
 *   "none"                         no backup; a declined search shows an error
 *
 * A pinned chain only works with models Anthropic permits as backups for the
 * main model, so the list is checked against the Models API and anything not
 * permitted is dropped. If nothing is left (or the check fails), GetReel uses
 * Anthropic's "default" routing, which is always accepted.
 */

export const DEFAULT_FALLBACK_CHAIN = ["claude-opus-5", "claude-opus-4-8"] as const;

/** Beta header for a pinned list of backup models (the array form). */
export const CHAIN_BETA = "server-side-fallback-2026-06-01";
/** Beta header for Anthropic's per-category routing (the "default" form). */
export const DEFAULT_ROUTING_BETA = "server-side-fallback-2026-07-01";

const MAX_CHAIN = 3;

export type FallbackSetting =
  | { mode: "chain"; models: string[] }
  | { mode: "default" }
  | { mode: "none" };

export type FallbackRequest = {
  betas: Anthropic.Beta.AnthropicBeta[];
  fallbacks: Anthropic.Beta.Messages.BetaFallbacksParam;
};

export function parseFallbackSetting(value: string | undefined): FallbackSetting {
  const raw = value?.trim().toLowerCase();
  if (!raw) return { mode: "chain", models: [...DEFAULT_FALLBACK_CHAIN] };
  if (raw === "default" || raw === "auto" || raw === "anthropic") return { mode: "default" };
  if (raw === "none" || raw === "off" || raw === "false" || raw === "0") return { mode: "none" };
  const models = Array.from(
    new Set(
      raw
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_CHAIN);
  return models.length > 0 ? { mode: "chain", models } : { mode: "chain", models: [...DEFAULT_FALLBACK_CHAIN] };
}

/** Anthropic's per-category routing: accepted for every model. */
export const DEFAULT_ROUTING: FallbackRequest = { betas: [DEFAULT_ROUTING_BETA], fallbacks: "default" };

/**
 * Turn the setting into request parameters.
 *
 * @param allowed the main model's permitted backups from the Models API, or
 *   null when that list couldn't be read.
 */
export function buildFallbackRequest(
  setting: FallbackSetting,
  primaryModel: string,
  allowed: readonly string[] | null,
): FallbackRequest | null {
  if (setting.mode === "none") return null;
  if (setting.mode === "default" || allowed === null) return DEFAULT_ROUTING;
  const permitted = setting.models.filter((m) => m !== primaryModel && allowed.includes(m));
  if (permitted.length === 0) return DEFAULT_ROUTING;
  return { betas: [CHAIN_BETA], fallbacks: permitted.map((model) => ({ model })) };
}

/** Human-readable summary for /api/health. */
export function describeFallbackSetting(setting: FallbackSetting): string | string[] {
  return setting.mode === "chain" ? setting.models : setting.mode;
}

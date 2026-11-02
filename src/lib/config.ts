import "server-only";

import { parseFallbackSetting } from "./fallbacks";
import type { Features } from "./types";

/**
 * Server-side configuration, read from environment variables (.env.local in
 * development, project settings on Vercel). Nothing here is sent to the browser
 * except the on/off feature flags.
 */

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_EFFORT: Effort = "medium";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function flag(name: string): boolean {
  const value = env(name)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function getConfig() {
  const forceDemo = flag("GETREEL_DEMO");
  const effort = env("ANTHROPIC_EFFORT") as Effort | undefined;
  const rate = Number.parseInt(env("SEARCH_RATE_LIMIT_PER_HOUR") ?? "", 10);
  const demoDelay = Number.parseInt(env("GETREEL_DEMO_DELAY_MS") ?? "", 10);

  return {
    forceDemo,
    anthropicApiKey: forceDemo ? undefined : env("ANTHROPIC_API_KEY"),
    anthropicModel: env("ANTHROPIC_MODEL") ?? DEFAULT_MODEL,
    anthropicEffort: effort && EFFORTS.includes(effort) ? effort : DEFAULT_EFFORT,
    /** Backup models for wrongly declined searches (see fallbacks.ts). */
    anthropicFallbacks: parseFallbackSetting(env("ANTHROPIC_FALLBACK_MODELS")),
    tmdbKey: forceDemo ? undefined : (env("TMDB_API_KEY") ?? env("TMDB_READ_ACCESS_TOKEN")),
    youtubeKey: forceDemo ? undefined : env("YOUTUBE_API_KEY"),
    watchRegion: (env("WATCH_REGION") ?? "US").toUpperCase().slice(0, 2),
    searchesPerHour: Number.isFinite(rate) && rate > 0 ? rate : 30,
    /** Demo answers are instant; a short pause lets the loading screen play as it would live. */
    demoDelayMs: Number.isFinite(demoDelay) && demoDelay >= 0 ? Math.min(demoDelay, 10_000) : 1400,
  };
}

export function getFeatures(): Features {
  const config = getConfig();
  return {
    claude: Boolean(config.anthropicApiKey),
    tmdb: Boolean(config.tmdbKey),
    youtube: Boolean(config.youtubeKey),
  };
}

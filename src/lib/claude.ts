import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { cacheLife } from "next/cache";

import { getConfig } from "./config";
import { SearchError } from "./errors";
import { buildFallbackRequest, CHAIN_BETA, DEFAULT_ROUTING, type FallbackRequest } from "./fallbacks";
import { IdentificationSchema, toIdentification } from "./identification";
import type { Identification, SearchInput } from "./types";

/**
 * Asks Claude which film or TV show someone is describing.
 *
 * The response is constrained to a JSON schema (structured outputs), so we get
 * a predictable list of candidates back. Identical searches are cached for a
 * few hours so repeat lookups are free and instant. If a safety filter wrongly
 * declines a harmless description, a backup model answers instead (see
 * fallbacks.ts).
 */

export const SYSTEM_PROMPT = `You are the archivist behind GetReel, a search engine for films and TV shows people can't quite remember. You know cinema and television from every era and country: Hollywood blockbusters and network sitcoms, prestige dramas and streaming hits, independent and foreign-language films, K-dramas, anime, telenovelas, British, European, Indian, Latin American and other international series, animation, documentaries, miniseries, cult oddities and made-for-TV movies.

People describe a title the way memory works: fuzzy, partial and often partly wrong. They misremember actors, blend two titles together, get the decade wrong, mix up a film with the series it inspired, describe the trailer instead of the story, or recall only one image, line of dialogue or feeling. Your job is to work out what they mean.

How to reason:
- Weigh distinctive details (an unusual premise, setting, object, line or image) far more heavily than generic ones (a car chase, a love story, "it was sad").
- Expect small errors. A strong match on the distinctive details beats a perfect match on the generic ones. Note genuine mismatches honestly.
- Decide whether they mean a film or a series. Words like "show", "series", "episode", "season", "sitcom", "K-drama" or "miniseries" point to TV; "movie" and "film" point to a film. When it is unclear, consider both.
- Consider the famous answer first, then genuinely different alternatives: lesser-known titles, foreign-language titles, remakes and adaptations (a film and the series based on it are different titles), sequels and spin-offs, and titles commonly confused with the obvious answer.
- Use any actor they mention, but remember that people often misattribute actors.
- Treat clues added later as corrections that outrank earlier details.
- Never suggest a title they have ruled out.
- Name only real, released titles that you are confident exist. Never invent a title, year, person, episode or episode number. If unsure of the director or creator, use null; if unsure of the year, give your best estimate.

What to return:
- candidates: up to 5 titles, most likely first. Return fewer when the answer is clear. Return an empty list only if the description is not about a film or TV show at all.
- kind: "movie" for films (including TV movies), "tv" for series and miniseries.
- title: the best-known English-language title. original_title: the original-language title when it differs (for example 오징어 게임 or La casa de papel), otherwise null.
- year: the release year of a film, or the year a series first aired.
- made_by: a film's director, or a series' creator or creators.
- confidence: 0 to 100 and calibrated. Reserve 90+ for descriptions containing a detail unique to that title. Confidences need not add up to 100.
- why: one or two warm, specific sentences addressed to the person (for example "You're likely remembering..."), without spoiling anything they didn't already describe.
- matched_clues / unmatched_clues: short phrases (2 to 6 words) taken from their description.
- scene: the specific moment they seem to be describing, in a short phrase, or null if they described the title in general.
- season, episode, episode_title: for a series, only when the description points to one specific episode and you are sure which one; otherwise null.
- clip_search_query: a YouTube search that would find that scene: the title, the year (or the episode), a few scene keywords and the word "scene". If no particular scene was described, use the title, year and "official trailer".
- interpretation: one sentence restating what they remember, such as "A film where a man stranded on an island befriends a volleyball."
- follow_up_question: when your top confidence is below 80, the single most useful question to tell your top candidates apart (for example "Was it a film or a TV series?" or "Was it animated?"). Otherwise null.`;

/** Formats the person's description, extra clues and exclusions for Claude. */
export function buildUserMessage(input: SearchInput): string {
  const parts = [`<description>\n${input.description}\n</description>`];
  if (input.clues.length > 0) {
    parts.push(
      `<additional_clues note="added later, newest last; these outrank the original description">\n${input.clues
        .map((c) => `- ${c}`)
        .join("\n")}\n</additional_clues>`,
    );
  }
  if (input.excluded.length > 0) {
    parts.push(
      `<ruled_out note="the person says it is NOT any of these">\n${input.excluded
        .map((e) => `- ${e}`)
        .join("\n")}\n</ruled_out>`,
    );
  }
  parts.push("Which film or TV show is this person thinking of?");
  return parts.join("\n\n");
}

let cachedClient: { key: string; client: Anthropic } | null = null;

function getClient(apiKey: string): Anthropic {
  if (cachedClient?.key !== apiKey) {
    cachedClient = {
      key: apiKey,
      client: new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 }),
    };
  }
  return cachedClient.client;
}

// ── Backup models ────────────────────────────────────────────────────────────

const MINUTE = 60_000;
const allowedBackups = new Map<string, { expires: number; models: string[] | null }>();

/**
 * The backups Anthropic permits for a model (from the Models API), cached for
 * half a day. Returns null when the list can't be read right now.
 */
async function permittedBackups(client: Anthropic, model: string): Promise<string[] | null> {
  const now = performance.now();
  const cached = allowedBackups.get(model);
  if (cached && cached.expires > now) return cached.models;

  let models: string[] | null;
  let ttl = 12 * 60 * MINUTE;
  try {
    const info = await client.beta.models.retrieve(model, { betas: [CHAIN_BETA] }, { timeout: 5000, maxRetries: 1 });
    models = info.allowed_fallback_models ?? [];
  } catch (error) {
    console.warn(
      `[getreel] couldn't read permitted backup models for ${model}; using Anthropic's default routing:`,
      error instanceof Error ? error.message : error,
    );
    models = null;
    ttl = 10 * MINUTE;
  }
  allowedBackups.set(model, { expires: now + ttl, models });
  return models;
}

// ── The request ──────────────────────────────────────────────────────────────

function describeFailure(error: unknown): SearchError {
  if (error instanceof SearchError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new SearchError("auth", `Anthropic rejected the API key: ${error.message}`);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new SearchError("busy", `Anthropic rate limit: ${error.message}`);
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new SearchError("busy", `Anthropic server error ${error.status}: ${error.message}`);
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    return new SearchError("unknown", `Anthropic rejected the request (${error.status}): ${error.message}`);
  }
  if (error instanceof Anthropic.APIError) {
    return new SearchError("unknown", `Anthropic API error ${error.status}: ${error.message}`);
  }
  // Connection problems and timeouts (APIConnectionTimeoutError extends this).
  if (error instanceof Anthropic.APIConnectionError) {
    return new SearchError("network", `Could not reach Anthropic: ${error.message}`);
  }
  return new SearchError("unknown", error instanceof Error ? error.message : String(error));
}

async function askClaude(input: SearchInput): Promise<Identification> {
  const config = getConfig();
  if (!config.anthropicApiKey) {
    throw new SearchError("auth", "ANTHROPIC_API_KEY is not set");
  }
  const client = getClient(config.anthropicApiKey);
  const model = config.anthropicModel;
  const setting = config.anthropicFallbacks;
  const permitted = setting.mode === "chain" ? await permittedBackups(client, model) : null;
  const backup = buildFallbackRequest(setting, model, permitted);

  // If a pinned backup chain is rejected (say Anthropic changed the permitted
  // list since we cached it), retry once with the always-accepted default.
  const attempts: (FallbackRequest | null)[] = [backup];
  if (backup && backup.fallbacks !== "default") attempts.push(DEFAULT_ROUTING);

  const started = performance.now();
  let response: Anthropic.Beta.BetaMessage | null = null;
  for (const [i, attempt] of attempts.entries()) {
    try {
      response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        ...(attempt ?? {}),
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        output_config: {
          format: betaZodOutputFormat(IdentificationSchema),
          effort: config.anthropicEffort,
        },
        messages: [{ role: "user", content: buildUserMessage(input) }],
      });
      break;
    } catch (error) {
      const canRetry = error instanceof Anthropic.BadRequestError && i < attempts.length - 1;
      if (!canRetry) throw describeFailure(error);
      console.warn("[getreel] backup model chain was rejected; retrying with Anthropic's default routing:", error.message);
      // Use default routing for this model until the permitted list is re-read,
      // so a persistent 400 isn't sent twice on every search.
      allowedBackups.set(model, { expires: performance.now() + 12 * 60 * MINUTE, models: [] });
    }
  }
  if (!response) throw new SearchError("unknown", "No response from Claude");

  const usedBackup = (response.usage.iterations ?? []).some((it) => it.type === "fallback_message");
  const ms = Math.round(performance.now() - started);
  console.info(
    `[getreel] claude ${response.model}${usedBackup ? " (backup model)" : ""} ${ms}ms stop=${response.stop_reason} in=${response.usage.input_tokens} cached=${response.usage.cache_read_input_tokens ?? 0} out=${response.usage.output_tokens}`,
  );

  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.category ?? "unspecified";
    throw new SearchError("refused", `Claude and its backups declined the request (category: ${category})`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new SearchError("unknown", "Claude ran out of output tokens before finishing");
  }

  // Only text blocks carry the answer; a "fallback" block just marks where a
  // backup model took over.
  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SearchError("unknown", `Claude returned malformed JSON: ${text.slice(0, 200)}`);
  }
  const parsed = IdentificationSchema.safeParse(json);
  if (!parsed.success) {
    throw new SearchError("unknown", `Claude's answer did not match the schema: ${parsed.error.message}`);
  }
  return toIdentification(parsed.data, input);
}

/**
 * Identify the films and shows matching a description. Cached per unique
 * search for a few hours (in memory on each server instance).
 */
export async function identifyTitles(input: SearchInput): Promise<Identification> {
  "use cache";
  cacheLife("hours");
  return askClaude(input);
}

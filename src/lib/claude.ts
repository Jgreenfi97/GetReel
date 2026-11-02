import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { cacheLife } from "next/cache";

import { getConfig } from "./config";
import { SearchError } from "./errors";
import { IdentificationSchema, toIdentification } from "./identification";
import type { Identification, SearchInput } from "./types";

/**
 * Asks Claude which film someone is describing.
 *
 * The response is constrained to a JSON schema (structured outputs), so we get
 * a predictable list of candidates back. Identical searches are cached for a
 * few hours so repeat lookups are free and instant.
 */

export const SYSTEM_PROMPT = `You are the film archivist behind GetReel, a search engine for movies people can't quite remember. You have encyclopedic knowledge of cinema from every era and country: studio blockbusters, independent and foreign-language films, animation, documentaries, cult oddities and made-for-TV movies.

People describe a film the way memory works: fuzzy, partial and often partly wrong. They misremember actors, blend two films together, get the decade wrong, describe the trailer rather than the film, or recall only one image, line of dialogue or feeling. Your job is to work out which film they mean.

How to reason:
- Weigh distinctive details (an unusual premise, setting, object, line or image) far more heavily than generic ones (a car chase, a love story, "it was sad").
- Expect small errors. A strong match on the distinctive details beats a perfect match on the generic ones. Note genuine mismatches honestly.
- Consider the famous answer first, then genuinely different alternatives: lesser-known films, foreign films, remakes, sequels, and films commonly confused with the obvious answer.
- Use any actor they mention, but remember that people often misattribute actors.
- Treat clues added later as corrections that outrank earlier details.
- Never suggest a film they have ruled out.
- Name only real, released films that you are confident exist. Never invent a title, year or director; if unsure of the director, use null, and if unsure of the year, give your best estimate.

What to return:
- candidates: up to 5 films, most likely first. Return fewer when the answer is clear. Return an empty list only if the description is not about a film at all.
- title: the best-known English-language release title. original_title: the original-language title when it differs, otherwise null.
- confidence: 0 to 100 and calibrated. Reserve 90+ for descriptions containing a detail unique to that film. Confidences need not add up to 100.
- why: one or two warm, specific sentences addressed to the person (for example "You're likely remembering..."), without spoiling anything they didn't already describe.
- matched_clues / unmatched_clues: short phrases (2 to 6 words) taken from their description.
- scene: the specific moment they seem to be describing, in a short phrase, or null if they described the film in general.
- clip_search_query: a YouTube search that would find that scene: title, year, a few scene keywords and the word "scene". If no particular scene was described, use the title, year and "official trailer".
- interpretation: one sentence restating what they remember, such as "A film where a man stranded on an island befriends a volleyball."
- follow_up_question: when your top confidence is below 80, the single most useful question to tell your top candidates apart (for example "Was it animated?"). Otherwise null.`;

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
  parts.push("Which film is this person thinking of?");
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
  const started = performance.now();

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: config.anthropicModel,
      max_tokens: 16000,
      // Server-side fallback: if a safety classifier wrongly declines a harmless
      // movie description, the API retries on Anthropic's recommended model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      output_config: {
        format: betaZodOutputFormat(IdentificationSchema),
        effort: config.anthropicEffort,
      },
      messages: [{ role: "user", content: buildUserMessage(input) }],
    });
  } catch (error) {
    throw describeFailure(error);
  }

  const ms = Math.round(performance.now() - started);
  console.info(
    `[getreel] claude ${response.model} ${ms}ms stop=${response.stop_reason} in=${response.usage.input_tokens} cached=${response.usage.cache_read_input_tokens ?? 0} out=${response.usage.output_tokens}`,
  );

  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.category ?? "unspecified";
    throw new SearchError("refused", `Claude declined the request (category: ${category})`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new SearchError("unknown", "Claude ran out of output tokens before finishing");
  }

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
 * Identify the film(s) matching a description. Cached per unique search for a
 * few hours (in memory on each server instance).
 */
export async function identifyFilm(input: SearchInput): Promise<Identification> {
  "use cache";
  cacheLife("hours");
  return askClaude(input);
}

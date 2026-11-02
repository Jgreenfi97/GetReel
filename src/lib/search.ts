import "server-only";

import { identifyFilm } from "./claude";
import { getConfig, getFeatures } from "./config";
import { demoExtras, demoIdentify } from "./demo";
import { SearchError } from "./errors";
import { RateLimiter } from "./rate-limit";
import { youtubeSearchUrl } from "./search-params";
import { pickVideo } from "./tmdb-core";
import { findMovieId, getMovieDetails } from "./tmdb";
import type { Candidate, Features, FilmDetails, FilmMatch, SearchInput, SearchResult, Video } from "./types";
import { findSceneClip } from "./youtube";

/**
 * The search pipeline:
 *
 *   1. Identify:  Claude (or demo data) turns the description into ranked guesses.
 *   2. Enrich:    each guess is matched to TMDB for poster, cast, trailers and
 *                 where-to-watch.
 *   3. Clip:      the top guess gets a YouTube search for the exact scene; the
 *                 rest fall back to TMDB's official clips and trailers.
 *
 * Every step after the first degrades gracefully: a missing key or a failed
 * lookup just means less detail, never a failed search.
 */

type Problems = Set<"tmdb" | "youtube">;

function joinNames(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

async function lookUpDetails(candidate: Candidate, problems: Problems): Promise<FilmDetails | null> {
  try {
    const id = await findMovieId(candidate.title, candidate.year, candidate.originalTitle);
    return id ? await getMovieDetails(id) : null;
  } catch (error) {
    console.warn(`[getreel] TMDB lookup failed for "${candidate.title}":`, error);
    problems.add("tmdb");
    return null;
  }
}

async function lookUpScene(query: string, title: string, problems: Problems): Promise<Video | null> {
  try {
    return await findSceneClip(query, title);
  } catch (error) {
    console.warn(`[getreel] YouTube scene search failed for "${query}":`, error);
    problems.add("youtube");
    return null;
  }
}

async function enrich(
  candidate: Candidate,
  rank: number,
  features: Features,
  demo: boolean,
  problems: Problems,
): Promise<FilmMatch> {
  const details = features.tmdb ? await lookUpDetails(candidate, problems) : null;
  const title = details?.title ?? candidate.title;
  const year = details?.year ?? candidate.year;

  let clip: Video | null = null;
  if (rank === 0 && features.youtube) {
    clip = await lookUpScene(candidate.clipQuery, title, problems);
  }
  const videos = details?.videos ?? [];
  clip ??= pickVideo(videos, candidate.scene, title);

  const extras = demo && !details ? demoExtras(candidate.title, candidate.year) : null;

  return {
    rank,
    tmdbId: details?.tmdbId ?? null,
    title,
    originalTitle: details?.originalTitle ?? candidate.originalTitle,
    year,
    overview: details?.overview ?? extras?.overview ?? null,
    tagline: details?.tagline ?? null,
    poster: details?.poster ?? null,
    backdrop: details?.backdrop ?? null,
    runtime: details?.runtime ?? extras?.runtime ?? null,
    genres: details?.genres.length ? details.genres : (extras?.genres ?? []),
    director: joinNames(details?.directors.map((d) => d.name) ?? []) ?? candidate.director,
    cast: details?.cast.length ? details.cast.slice(0, 4).map((c) => c.name) : (extras?.cast ?? []),
    confidence: candidate.confidence,
    why: candidate.why,
    matchedClues: candidate.matchedClues,
    unmatchedClues: candidate.unmatchedClues,
    scene: candidate.scene,
    clip,
    extraVideos: videos.filter((v) => v.youtubeId !== clip?.youtubeId).slice(0, 4),
    clipQuery: candidate.clipQuery,
    clipSearchUrl: youtubeSearchUrl(candidate.clipQuery),
    watch: details?.watch ?? null,
  };
}

/** Collapse guesses that turned out to be the same TMDB film. */
function dedupe(matches: FilmMatch[]): FilmMatch[] {
  const seen = new Set<number>();
  const out: FilmMatch[] = [];
  for (const match of matches) {
    if (match.tmdbId !== null) {
      if (seen.has(match.tmdbId)) continue;
      seen.add(match.tmdbId);
    }
    out.push({ ...match, rank: out.length });
  }
  return out;
}

export async function runSearch(input: SearchInput): Promise<SearchResult> {
  const features = getFeatures();
  const demo = !features.claude;
  const identification = demo ? demoIdentify(input) : await identifyFilm(input);
  if (demo) {
    const delay = getConfig().demoDelayMs ?? 0;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const problems: Problems = new Set();
  const matches = dedupe(
    await Promise.all(
      identification.candidates.map((candidate, rank) => enrich(candidate, rank, features, demo, problems)),
    ),
  );

  const notices: string[] = [];
  if (demo) {
    notices.push(
      matches.length > 0
        ? "Demo mode: these results are hand-picked examples. Add an Anthropic API key to search any film."
        : "Demo mode: GetReel can only recognise the example searches until an Anthropic API key is added.",
    );
  }
  if (!features.tmdb && matches.length > 0) {
    notices.push("Posters, cast and trailers appear once a TMDB key is added.");
  }
  if (problems.has("tmdb")) {
    notices.push("Some film details couldn't be loaded just now, so a few posters or trailers may be missing.");
  }
  if (problems.has("youtube")) {
    notices.push("The scene search is unavailable right now, so we're showing official trailers instead.");
  }

  return {
    input,
    mode: demo ? "demo" : "live",
    interpretation: identification.interpretation,
    followUpQuestion: identification.followUpQuestion,
    matches,
    notices,
  };
}

// One limiter per server process, sized from SEARCH_RATE_LIMIT_PER_HOUR.
let limiter: RateLimiter | null = null;

/** Throws a "rate_limited" SearchError when a visitor searches too often. */
export function enforceRateLimit(key: string): void {
  // Demo searches cost nothing, so they are never limited.
  if (!getFeatures().claude) return;
  limiter ??= new RateLimiter(getConfig().searchesPerHour, 60 * 60 * 1000);
  const result = limiter.check(key);
  if (!result.ok) {
    throw new SearchError("rate_limited", `Rate limit exceeded for ${key}`, result.retryAfterSeconds);
  }
}

import "server-only";

import { identifyTitles } from "./claude";
import { getConfig, getFeatures } from "./config";
import { demoExtras, demoIdentify, type DemoExtras } from "./demo";
import { SearchError } from "./errors";
import { joinNames } from "./format";
import { countryNames, foreignLanguageName, langAttribute } from "./locale";
import { RateLimiter } from "./rate-limit";
import { youtubeSearchUrl } from "./search-params";
import { matchEpisode, pickVideo, unverifiedEpisode } from "./tmdb-core";
import { findTitle, getSeason, getTitleDetails } from "./tmdb";
import type {
  Candidate,
  Episode,
  EpisodeGuess,
  Features,
  SearchInput,
  SearchResult,
  TitleDetails,
  TitleMatch,
  Video,
} from "./types";
import { findSceneClip } from "./youtube";

/**
 * The search pipeline:
 *
 *   1. Identify:  Claude (or demo data) turns the description into ranked
 *                 guesses: films and TV series, sometimes a specific episode.
 *   2. Enrich:    each guess is matched to TMDB for poster, cast, trailers and
 *                 where-to-watch; a guessed episode is checked against the
 *                 series' real episode list.
 *   3. Clip:      the top guess gets a YouTube search for the exact scene; the
 *                 rest fall back to TMDB's official clips and trailers.
 *
 * Every step after the first degrades gracefully: a missing key or a failed
 * lookup just means less detail, never a failed search.
 */

type Problems = Set<"tmdb" | "youtube">;

async function lookUpDetails(candidate: Candidate, problems: Problems): Promise<TitleDetails | null> {
  try {
    const found = await findTitle(candidate.kind, candidate.title, candidate.year, candidate.originalTitle);
    return found ? await getTitleDetails(found.kind, found.id) : null;
  } catch (error) {
    console.warn(`[getreel] TMDB lookup failed for "${candidate.title}":`, error);
    problems.add("tmdb");
    return null;
  }
}

/**
 * Confirm a guessed episode when TMDB knows the series; otherwise show the
 * guess as given. An episode that TMDB's list contradicts is dropped.
 */
async function lookUpEpisode(
  guess: EpisodeGuess | null,
  details: TitleDetails | null,
  tmdb: boolean,
  problems: Problems,
): Promise<Episode | null> {
  if (!guess || guess.season === null) return null;
  if (!tmdb || !details) return unverifiedEpisode(guess);
  if (details.kind !== "tv") return null;
  try {
    const season = await getSeason(details.tmdbId, guess.season);
    return season ? matchEpisode(season, guess) : null;
  } catch (error) {
    console.warn(`[getreel] TMDB season lookup failed for "${details.title}":`, error);
    problems.add("tmdb");
    return unverifiedEpisode(guess);
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

function withDemoEpisode(episode: Episode | null, extras: DemoExtras | null): Episode | null {
  if (!episode || !extras?.episode) return episode;
  return {
    ...episode,
    airDate: episode.airDate ?? extras.episode.airDate ?? null,
    overview: episode.overview ?? extras.episode.overview ?? null,
  };
}

async function enrich(
  candidate: Candidate,
  rank: number,
  features: Features,
  demo: boolean,
  problems: Problems,
): Promise<TitleMatch> {
  // The scene search only needs the title, so start it alongside the TMDB lookups.
  const sceneSearch: Promise<Video | null> =
    rank === 0 && features.youtube ? lookUpScene(candidate.clipQuery, candidate.title, problems) : Promise.resolve(null);
  const details = features.tmdb ? await lookUpDetails(candidate, problems) : null;
  // TMDB may have found the title in the other catalogue (a "film" that is a series).
  const kind = details?.kind ?? candidate.kind;
  const title = details?.title ?? candidate.title;
  const extras = demo && !details ? demoExtras(candidate.title, candidate.year) : null;

  const episode =
    kind === "tv"
      ? withDemoEpisode(await lookUpEpisode(candidate.episode, details, features.tmdb, problems), extras)
      : null;

  const videos = details?.videos ?? [];
  const clip = (await sceneSearch) ?? pickVideo(videos, candidate.scene ?? episode?.title ?? null, title);

  const makers = (kind === "tv" ? details?.creators : details?.directors) ?? [];

  return {
    rank,
    kind,
    tmdbId: details?.tmdbId ?? null,
    title,
    originalTitle: details ? details.originalTitle : candidate.originalTitle,
    year: details?.year ?? candidate.year,
    endYear: details ? details.endYear : (extras?.endYear ?? null),
    ongoing: details ? details.ongoing : (extras?.ongoing ?? false),
    overview: details?.overview ?? extras?.overview ?? null,
    tagline: details?.tagline ?? null,
    poster: details?.poster ?? null,
    backdrop: details?.backdrop ?? null,
    runtime: details?.runtime ?? extras?.runtime ?? null,
    genres: details?.genres.length ? details.genres : (extras?.genres ?? []),
    // Claude's director/creator only fits if TMDB didn't switch the title's kind.
    madeBy: joinNames(makers.map((p) => p.name)) ?? (kind === candidate.kind ? candidate.madeBy : null),
    cast: details?.cast.length ? details.cast.slice(0, 4).map((c) => c.name) : (extras?.cast ?? []),
    networks: details?.networks.length ? details.networks : (extras?.networks ?? []),
    seasonCount: details?.seasonCount ?? extras?.seasonCount ?? null,
    episodeCount: details?.episodeCount ?? extras?.episodeCount ?? null,
    language: foreignLanguageName(details?.originalLanguage ?? extras?.language),
    languageCode: langAttribute(details?.originalLanguage ?? extras?.language),
    countries: countryNames(details?.originCountries ?? extras?.countries ?? []),
    confidence: candidate.confidence,
    why: candidate.why,
    matchedClues: candidate.matchedClues,
    unmatchedClues: candidate.unmatchedClues,
    scene: candidate.scene,
    episode,
    clip,
    extraVideos: videos.filter((v) => v.youtubeId !== clip?.youtubeId).slice(0, 4),
    clipQuery: candidate.clipQuery,
    clipSearchUrl: youtubeSearchUrl(candidate.clipQuery),
    watch: details?.watch ?? null,
  };
}

/** Collapse guesses that turned out to be the same TMDB title. */
function dedupe(matches: TitleMatch[]): TitleMatch[] {
  const seen = new Set<string>();
  const out: TitleMatch[] = [];
  for (const match of matches) {
    if (match.tmdbId !== null) {
      // TMDB ids are only unique within the film or the series catalogue.
      const key = `${match.kind}:${match.tmdbId}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push({ ...match, rank: out.length });
  }
  return out;
}

export async function runSearch(input: SearchInput): Promise<SearchResult> {
  const features = getFeatures();
  const demo = !features.claude;
  const identification = demo ? demoIdentify(input) : await identifyTitles(input);
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
        ? "Demo mode: these results are hand-picked examples. Add an Anthropic API key to search any film or show."
        : "Demo mode: GetReel can only recognize the example searches until an Anthropic API key is added.",
    );
  }
  if (!features.tmdb && matches.length > 0) {
    notices.push("Posters, cast and trailers appear once a TMDB key is added.");
  }
  if (problems.has("tmdb")) {
    notices.push("Some details couldn't be loaded just now, so a few posters or trailers may be missing.");
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

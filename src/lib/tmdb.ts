import "server-only";

import { cacheLife } from "next/cache";

import { getConfig } from "./config";
import {
  mapMovieDetails,
  mapTvDetails,
  normalizeTvResults,
  pickBestMatch,
  type TmdbMovieDetails,
  type TmdbMovieSearchResponse,
  type TmdbSearchResult,
  type TmdbSeason,
  type TmdbTvDetails,
  type TmdbTvSearchResponse,
} from "./tmdb-core";
import type { MediaKind, TitleDetails } from "./types";

/**
 * The Movie Database (TMDB) client, for films and TV series. Accepts either a
 * v4 "API Read Access Token" (sent as a Bearer header) or a v3 "API Key"
 * (sent as a query param).
 *
 * This product uses the TMDB API but is not endorsed or certified by TMDB.
 */

const API = "https://api.themoviedb.org/3";

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

async function tmdbGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { tmdbKey } = getConfig();
  if (!tmdbKey) throw new TmdbError("TMDB_API_KEY is not set");

  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (tmdbKey.startsWith("eyJ")) headers.Authorization = `Bearer ${tmdbKey}`;
  else url.searchParams.set("api_key", tmdbKey);

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  } catch (error) {
    throw new TmdbError(`TMDB request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!res.ok) {
    throw new TmdbError(`TMDB ${path} responded ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

async function search(kind: MediaKind, query: string, year: number | null): Promise<TmdbSearchResult[]> {
  const params: Record<string, string> = { query, include_adult: "false", language: "en-US", page: "1" };
  if (kind === "tv") {
    if (year) params.first_air_date_year = String(year);
    return normalizeTvResults(await tmdbGet<TmdbTvSearchResponse>("/search/tv", params));
  }
  if (year) params.primary_release_year = String(year);
  return (await tmdbGet<TmdbMovieSearchResponse>("/search/movie", params)).results ?? [];
}

/**
 * Find TMDB's id for a guessed title. Searches the guessed catalogue first
 * (with and without the year, then by original title); if nothing matches,
 * tries the other catalogue in case the guess mixed up film and series, but
 * only accepts a result from the same year there. Cached for weeks.
 */
export async function findTitle(
  kind: MediaKind,
  title: string,
  year: number | null,
  originalTitle: string | null,
): Promise<{ kind: MediaKind; id: number } | null> {
  "use cache";
  cacheLife("weeks");

  const guess = { title, year, originalTitle };
  const attempts: [string, number | null][] = [[title, year]];
  if (year) attempts.push([title, null]);
  if (originalTitle) attempts.push([originalTitle, null]);

  for (const [query, y] of attempts) {
    const match = pickBestMatch(await search(kind, query, y), guess);
    if (match) return { kind, id: match.id };
  }

  if (year) {
    const other: MediaKind = kind === "movie" ? "tv" : "movie";
    const match = pickBestMatch(await search(other, title, null), guess, { requireYear: true });
    if (match) return { kind: other, id: match.id };
  }
  return null;
}

/** Full details (credits, videos, ratings, where to watch) for a film or series. */
export async function getTitleDetails(kind: MediaKind, id: number): Promise<TitleDetails | null> {
  "use cache";
  cacheLife("days");

  const { watchRegion } = getConfig();
  try {
    if (kind === "tv") {
      const raw = await tmdbGet<TmdbTvDetails>(`/tv/${id}`, {
        language: "en-US",
        append_to_response: "aggregate_credits,videos,content_ratings,watch/providers,external_ids",
        include_video_language: "en,null",
      });
      return mapTvDetails(raw, watchRegion);
    }
    const raw = await tmdbGet<TmdbMovieDetails>(`/movie/${id}`, {
      language: "en-US",
      append_to_response: "credits,videos,release_dates,watch/providers",
      include_video_language: "en,null",
    });
    return mapMovieDetails(raw, watchRegion);
  } catch (error) {
    if (error instanceof TmdbError && error.status === 404) return null;
    throw error;
  }
}

/** One season's episode list, used to confirm a guessed episode. */
export async function getSeason(tvId: number, seasonNumber: number): Promise<TmdbSeason | null> {
  "use cache";
  cacheLife("weeks");

  try {
    return await tmdbGet<TmdbSeason>(`/tv/${tvId}/season/${seasonNumber}`, { language: "en-US" });
  } catch (error) {
    if (error instanceof TmdbError && error.status === 404) return null;
    throw error;
  }
}

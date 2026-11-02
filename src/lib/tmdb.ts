import "server-only";

import { cacheLife } from "next/cache";

import { getConfig } from "./config";
import {
  mapDetails,
  pickBestMatch,
  type TmdbMovieDetails,
  type TmdbSearchMovie,
  type TmdbSearchResponse,
} from "./tmdb-core";
import type { FilmDetails } from "./types";

/**
 * The Movie Database (TMDB) client. Accepts either a v4 "API Read Access
 * Token" (sent as a Bearer header) or a v3 "API Key" (sent as a query param).
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

async function searchMovies(query: string, year?: number | null): Promise<TmdbSearchMovie[]> {
  const params: Record<string, string> = { query, include_adult: "false", language: "en-US", page: "1" };
  if (year) params.primary_release_year = String(year);
  const data = await tmdbGet<TmdbSearchResponse>("/search/movie", params);
  return data.results ?? [];
}

/** Find TMDB's id for a guessed film. Cached for weeks: titles don't move. */
export async function findMovieId(
  title: string,
  year: number | null,
  originalTitle: string | null,
): Promise<number | null> {
  "use cache";
  cacheLife("weeks");

  const guess = { title, year, originalTitle };
  const attempts: [string, number | null][] = [[title, year]];
  if (year) attempts.push([title, null]);
  if (originalTitle) attempts.push([originalTitle, null]);

  for (const [query, y] of attempts) {
    const match = pickBestMatch(await searchMovies(query, y), guess);
    if (match) return match.id;
  }
  return null;
}

/** Full details (credits, videos, ratings, where to watch) for a TMDB id. */
export async function getMovieDetails(id: number): Promise<FilmDetails | null> {
  "use cache";
  cacheLife("days");

  const { watchRegion } = getConfig();
  try {
    const raw = await tmdbGet<TmdbMovieDetails>(`/movie/${id}`, {
      language: "en-US",
      append_to_response: "credits,videos,release_dates,watch/providers",
      include_video_language: "en,null",
    });
    return mapDetails(raw, watchRegion);
  } catch (error) {
    if (error instanceof TmdbError && error.status === 404) return null;
    throw error;
  }
}

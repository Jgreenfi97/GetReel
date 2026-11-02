import "server-only";

import { cacheLife } from "next/cache";

import { getConfig } from "./config";
import { pickYouTubeResult, type YouTubeSearchResponse } from "./youtube-core";
import type { Video } from "./types";

/**
 * YouTube Data API v3 scene search.
 *
 * Each search costs 100 units of the default 10,000-unit daily quota, so we
 * only search for the top guess and cache results for weeks.
 */
export async function findSceneClip(query: string, filmTitle: string): Promise<Video | null> {
  "use cache";
  cacheLife("weeks");

  const { youtubeKey } = getConfig();
  if (!youtubeKey) return null;

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("maxResults", "6");
  url.searchParams.set("q", query);
  url.searchParams.set("key", youtubeKey);

  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) {
    // 403 usually means the daily quota is used up; fall back to TMDB trailers.
    throw new Error(`YouTube search responded ${res.status}`);
  }
  const data = (await res.json()) as YouTubeSearchResponse;
  return pickYouTubeResult(data.items ?? [], filmTitle);
}

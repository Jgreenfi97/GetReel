import { normalizeTitle } from "./identification";
import type { Video } from "./types";

/** Pure helpers for YouTube Data API search results (unit-tested). */

export type YouTubeSearchItem = {
  id?: { kind?: string; videoId?: string };
  snippet?: { title?: string; channelTitle?: string; liveBroadcastContent?: string };
};

export type YouTubeSearchResponse = { items?: YouTubeSearchItem[] };

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/** The API returns HTML-escaped titles ("Don&#39;t Look Back"). */
export function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

/** Channels that reliably post properly labelled official movie clips. */
const TRUSTED_CHANNELS = ["movieclips", "rotten tomatoes classic trailers", "warner bros", "universal pictures", "sony pictures", "paramount pictures", "20th century studios", "disney", "pixar", "a24", "lionsgate", "focus features", "netflix"];

/**
 * Pick the most plausible scene clip from search results: prefer videos whose
 * title names the film, then ones from channels that post official clips.
 */
export function pickYouTubeResult(items: YouTubeSearchItem[], filmTitle: string): Video | null {
  const want = normalizeTitle(filmTitle);
  let best: { video: Video; score: number } | null = null;

  for (const [index, item] of items.entries()) {
    const id = item.id?.videoId;
    const rawTitle = item.snippet?.title;
    if (!id || !rawTitle || item.snippet?.liveBroadcastContent === "live") continue;
    const title = decodeEntities(rawTitle);
    const normalized = normalizeTitle(title);
    const channel = (item.snippet?.channelTitle ?? "").toLowerCase();

    let score = 5 - index; // YouTube's own ranking still matters
    if (want && normalized.includes(want)) score += 6;
    if (TRUSTED_CHANNELS.some((c) => channel.includes(c))) score += 2;
    if (/\b(reaction|review|explained|ranking|top \d+|fan made|parody)\b/i.test(title)) score -= 6;

    if (!best || score > best.score) {
      best = { video: { youtubeId: id, title, kind: "scene", source: "youtube-search" }, score };
    }
  }

  return best && best.score > 0 ? best.video : null;
}

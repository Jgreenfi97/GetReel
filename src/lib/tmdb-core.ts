/**
 * Pure helpers for TMDB data: matching search results, mapping API payloads
 * into GetReel's types and choosing which video to play. No network access
 * here, so everything is unit-testable (see tests/tmdb-core.test.ts).
 */

import { normalizeTitle } from "./identification";
import { tmdbImageRef } from "./tmdb-images";
import type { FilmDetails, Person, Video, VideoKind, WatchOptions, WatchProvider } from "./types";

// ── Raw API shapes (only the fields we use) ─────────────────────────────────

export type TmdbSearchMovie = {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  popularity?: number;
  vote_count?: number;
  poster_path?: string | null;
};

export type TmdbSearchResponse = { results?: TmdbSearchMovie[] };

type TmdbVideo = {
  key: string;
  site: string;
  type: string;
  name: string;
  official?: boolean;
  size?: number;
  published_at?: string;
};

type TmdbProvider = { provider_id: number; provider_name: string; logo_path?: string | null; display_priority?: number };

export type TmdbMovieDetails = {
  id: number;
  imdb_id?: string | null;
  title: string;
  original_title?: string;
  release_date?: string;
  overview?: string;
  tagline?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  runtime?: number | null;
  genres?: { id: number; name: string }[];
  vote_average?: number;
  vote_count?: number;
  homepage?: string | null;
  credits?: {
    cast?: { id: number; name: string; character?: string; profile_path?: string | null; order?: number }[];
    crew?: { id: number; name: string; job?: string; department?: string; profile_path?: string | null }[];
  };
  videos?: { results?: TmdbVideo[] };
  release_dates?: {
    results?: { iso_3166_1: string; release_dates?: { certification?: string; type?: number }[] }[];
  };
  "watch/providers"?: {
    results?: Record<string, { link?: string; flatrate?: TmdbProvider[]; rent?: TmdbProvider[]; buy?: TmdbProvider[] }>;
  };
};

// ── Matching search results ─────────────────────────────────────────────────

export function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const y = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) && y > 1800 ? y : null;
}

function wordOverlap(a: string, b: string): number {
  const aw = new Set(a.split(" ").filter(Boolean));
  const bw = new Set(b.split(" ").filter(Boolean));
  if (aw.size === 0 || bw.size === 0) return 0;
  let shared = 0;
  for (const w of aw) if (bw.has(w)) shared++;
  return shared / Math.max(aw.size, bw.size);
}

function titleScore(result: TmdbSearchMovie, wanted: string[]): number {
  const names = [result.title, result.original_title]
    .filter((n): n is string => Boolean(n))
    .map(normalizeTitle);
  let best = 0;
  for (const want of wanted) {
    for (const name of names) {
      if (!want || !name) continue;
      if (name === want) best = Math.max(best, 3);
      else if (name.includes(want) || want.includes(name)) best = Math.max(best, 1.5);
      else best = Math.max(best, wordOverlap(name, want) * 1.4);
    }
  }
  return best;
}

function yearScore(result: TmdbSearchMovie, year: number | null): number {
  const resultYear = yearOf(result.release_date);
  if (year === null || resultYear === null) return 0;
  const diff = Math.abs(resultYear - year);
  if (diff === 0) return 2;
  if (diff === 1) return 1.2;
  if (diff === 2) return 0.3;
  return -1.5;
}

/**
 * Pick the search result that best matches a guessed title and year. Returns
 * null rather than a wrong film when nothing is convincing.
 */
export function pickBestMatch(
  results: TmdbSearchMovie[],
  guess: { title: string; year: number | null; originalTitle?: string | null },
): TmdbSearchMovie | null {
  const wanted = [guess.title, guess.originalTitle]
    .filter((t): t is string => Boolean(t))
    .map(normalizeTitle);

  let best: { result: TmdbSearchMovie; score: number } | null = null;
  for (const result of results) {
    const t = titleScore(result, wanted);
    if (t < 0.6) continue;
    const score = t + yearScore(result, guess.year) + Math.log10(1 + (result.vote_count ?? 0)) * 0.35;
    if (!best || score > best.score) best = { result, score };
  }
  return best && best.score >= 1.6 ? best.result : null;
}

// ── Videos ──────────────────────────────────────────────────────────────────

const KIND_BY_TYPE: Record<string, VideoKind> = {
  Trailer: "trailer",
  Teaser: "teaser",
  Clip: "clip",
  Featurette: "featurette",
};

const KIND_ORDER: VideoKind[] = ["trailer", "clip", "teaser", "featurette", "video", "scene"];

export function mapVideos(raw: TmdbVideo[] | undefined): Video[] {
  if (!raw) return [];
  return raw
    .filter((v) => v.site === "YouTube" && v.key)
    .map((v) => ({
      video: {
        youtubeId: v.key,
        title: v.name,
        kind: KIND_BY_TYPE[v.type] ?? "video",
        source: "tmdb" as const,
      },
      official: v.official !== false,
      size: v.size ?? 0,
      published: v.published_at ?? "",
    }))
    .sort((a, b) => {
      if (a.official !== b.official) return a.official ? -1 : 1;
      const k = KIND_ORDER.indexOf(a.video.kind) - KIND_ORDER.indexOf(b.video.kind);
      if (k !== 0) return k;
      if (a.size !== b.size) return b.size - a.size;
      return a.published.localeCompare(b.published);
    })
    .map((v) => v.video);
}

const STOPWORDS = new Set(
  "a an and the of in on at to for with from by is was were be it its this that he she they his her their them who where when then as into out up down over under scene clip official trailer movie film one".split(
    " ",
  ),
);

function keywords(text: string): Set<string> {
  return new Set(
    normalizeTitle(text)
      .split(" ")
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Choose a video for a film. When a scene was described, prefer an official
 * clip whose name mentions it; otherwise fall back to the main trailer.
 */
export function pickVideo(videos: Video[], scene: string | null, filmTitle: string): Video | null {
  if (videos.length === 0) return null;
  if (scene) {
    const titleWords = keywords(filmTitle);
    const sceneWords = [...keywords(scene)].filter((w) => !titleWords.has(w));
    let best: { video: Video; hits: number } | null = null;
    for (const video of videos) {
      if (video.kind !== "clip" && video.kind !== "featurette") continue;
      const words = keywords(video.title);
      const hits = sceneWords.filter((w) => words.has(w)).length;
      if (hits > 0 && (!best || hits > best.hits)) best = { video, hits };
    }
    if (best) return { ...best.video, kind: "scene" };
  }
  return (
    videos.find((v) => v.kind === "trailer") ??
    videos.find((v) => v.kind === "teaser") ??
    videos.find((v) => v.kind === "clip") ??
    videos[0]
  );
}

// ── Details ─────────────────────────────────────────────────────────────────

/**
 * TMDB fields such as `homepage` are community-edited, so only plain web links
 * are allowed through (never `javascript:` or other schemes).
 */
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function mapProviders(list: TmdbProvider[] | undefined): WatchProvider[] {
  return (list ?? [])
    .slice()
    .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
    .slice(0, 8)
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: tmdbImageRef("logo", p.logo_path) }));
}

export function mapWatchOptions(raw: TmdbMovieDetails, region: string): WatchOptions | null {
  const entry = raw["watch/providers"]?.results?.[region];
  if (!entry) return null;
  const options: WatchOptions = {
    region,
    link: safeUrl(entry.link),
    stream: mapProviders(entry.flatrate),
    rent: mapProviders(entry.rent),
    buy: mapProviders(entry.buy),
  };
  return options.stream.length + options.rent.length + options.buy.length > 0 ? options : null;
}

function certificationFor(raw: TmdbMovieDetails, region: string): string | null {
  const entry = raw.release_dates?.results?.find((r) => r.iso_3166_1 === region);
  const dates = entry?.release_dates ?? [];
  // Prefer the theatrical (type 3) rating, then any non-empty one.
  const theatrical = dates.find((d) => d.type === 3 && d.certification);
  const any = dates.find((d) => d.certification);
  return (theatrical ?? any)?.certification?.trim() || null;
}

function person(
  p: { id: number; name: string; profile_path?: string | null },
  role: string | null | undefined,
): Person {
  return { id: p.id, name: p.name, role: role?.trim() || null, photo: tmdbImageRef("profile", p.profile_path) };
}

export function mapDetails(raw: TmdbMovieDetails, region: string): FilmDetails {
  const crew = raw.credits?.crew ?? [];
  const directors = crew.filter((c) => c.job === "Director").map((c) => person(c, "Director"));
  const writerJobs = new Set(["Screenplay", "Writer", "Story", "Novel", "Author"]);
  const writersSeen = new Set<number>();
  const writers: Person[] = [];
  for (const c of crew) {
    if (c.job && writerJobs.has(c.job) && !writersSeen.has(c.id)) {
      writersSeen.add(c.id);
      writers.push(person(c, c.job));
    }
  }
  const cast = (raw.credits?.cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 12)
    .map((c) => person(c, c.character));

  const originalTitle =
    raw.original_title && normalizeTitle(raw.original_title) !== normalizeTitle(raw.title)
      ? raw.original_title
      : null;

  return {
    tmdbId: raw.id,
    imdbId: raw.imdb_id || null,
    title: raw.title,
    originalTitle,
    year: yearOf(raw.release_date),
    releaseDate: raw.release_date || null,
    overview: raw.overview?.trim() || null,
    tagline: raw.tagline?.trim() || null,
    poster: tmdbImageRef("poster", raw.poster_path),
    backdrop: tmdbImageRef("backdrop", raw.backdrop_path),
    runtime: raw.runtime && raw.runtime > 0 ? raw.runtime : null,
    genres: (raw.genres ?? []).map((g) => g.name),
    rating: raw.vote_count && raw.vote_count > 0 && raw.vote_average ? Math.round(raw.vote_average * 10) / 10 : null,
    voteCount: raw.vote_count ?? 0,
    certification: certificationFor(raw, region),
    directors,
    writers: writers.slice(0, 4),
    cast,
    videos: mapVideos(raw.videos?.results),
    watch: mapWatchOptions(raw, region),
    homepage: safeUrl(raw.homepage),
  };
}

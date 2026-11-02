/**
 * Pure helpers for TMDB data: matching search results, mapping API payloads
 * (films and series) into GetReel's types, checking episodes and choosing
 * which video to play. No network access here, so everything is unit-testable
 * (see tests/tmdb-core.test.ts).
 */

import { normalizeTitle } from "./identification";
import { tmdbImageRef } from "./tmdb-images";
import type {
  Episode,
  EpisodeGuess,
  Person,
  SeasonSummary,
  TitleDetails,
  Video,
  VideoKind,
  WatchOptions,
  WatchProvider,
} from "./types";

// ── Raw API shapes (only the fields we use) ─────────────────────────────────

/** A search result, normalised to the film field names (series are mapped). */
export type TmdbSearchResult = {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  popularity?: number;
  vote_count?: number;
  poster_path?: string | null;
};

export type TmdbMovieSearchResponse = { results?: TmdbSearchResult[] };

export type TmdbTvSearchResponse = {
  results?: {
    id: number;
    name: string;
    original_name?: string;
    first_air_date?: string;
    popularity?: number;
    vote_count?: number;
    poster_path?: string | null;
  }[];
};

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

type TmdbWatchProviders = {
  results?: Record<string, { link?: string; flatrate?: TmdbProvider[]; rent?: TmdbProvider[]; buy?: TmdbProvider[] }>;
};

type TmdbPersonRef = { id: number; name: string; profile_path?: string | null };

export type TmdbMovieDetails = {
  id: number;
  imdb_id?: string | null;
  title: string;
  original_title?: string;
  original_language?: string;
  origin_country?: string[];
  production_countries?: { iso_3166_1: string; name?: string }[];
  release_date?: string;
  status?: string;
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
    cast?: (TmdbPersonRef & { character?: string; order?: number })[];
    crew?: (TmdbPersonRef & { job?: string; department?: string })[];
  };
  videos?: { results?: TmdbVideo[] };
  release_dates?: {
    results?: { iso_3166_1: string; release_dates?: { certification?: string; type?: number }[] }[];
  };
  "watch/providers"?: TmdbWatchProviders;
};

export type TmdbTvDetails = {
  id: number;
  name: string;
  original_name?: string;
  original_language?: string;
  origin_country?: string[];
  first_air_date?: string;
  last_air_date?: string | null;
  status?: string;
  in_production?: boolean;
  overview?: string;
  tagline?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  episode_run_time?: number[];
  last_episode_to_air?: { runtime?: number | null } | null;
  number_of_seasons?: number;
  number_of_episodes?: number;
  genres?: { id: number; name: string }[];
  vote_average?: number;
  vote_count?: number;
  homepage?: string | null;
  created_by?: TmdbPersonRef[];
  networks?: { id: number; name: string }[];
  seasons?: {
    season_number: number;
    name: string;
    episode_count?: number;
    air_date?: string | null;
    poster_path?: string | null;
  }[];
  aggregate_credits?: {
    cast?: (TmdbPersonRef & { order?: number; roles?: { character?: string; episode_count?: number }[] })[];
  };
  videos?: { results?: TmdbVideo[] };
  content_ratings?: { results?: { iso_3166_1: string; rating?: string }[] };
  external_ids?: { imdb_id?: string | null };
  "watch/providers"?: TmdbWatchProviders;
};

export type TmdbSeason = {
  season_number: number;
  episodes?: {
    episode_number: number;
    name: string;
    overview?: string;
    air_date?: string | null;
    still_path?: string | null;
  }[];
};

// ── Matching search results ─────────────────────────────────────────────────

export function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const y = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) && y > 1800 ? y : null;
}

/** Series search results use different field names; map them to the film ones. */
export function normalizeTvResults(data: TmdbTvSearchResponse): TmdbSearchResult[] {
  return (data.results ?? []).map((r) => ({
    id: r.id,
    title: r.name,
    original_title: r.original_name,
    release_date: r.first_air_date,
    popularity: r.popularity,
    vote_count: r.vote_count,
    poster_path: r.poster_path,
  }));
}

function wordOverlap(a: string, b: string): number {
  const aw = new Set(a.split(" ").filter(Boolean));
  const bw = new Set(b.split(" ").filter(Boolean));
  if (aw.size === 0 || bw.size === 0) return 0;
  let shared = 0;
  for (const w of aw) if (bw.has(w)) shared++;
  return shared / Math.max(aw.size, bw.size);
}

function titleSimilarity(name: string, want: string): number {
  if (!want || !name) return 0;
  if (name === want) return 3;
  if (name.includes(want) || want.includes(name)) return 1.5;
  return wordOverlap(name, want) * 1.4;
}

function titleScore(result: TmdbSearchResult, wanted: string[]): number {
  const names = [result.title, result.original_title]
    .filter((n): n is string => Boolean(n))
    .map(normalizeTitle);
  let best = 0;
  for (const want of wanted) for (const name of names) best = Math.max(best, titleSimilarity(name, want));
  return best;
}

function yearScore(result: TmdbSearchResult, year: number | null): number {
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
 * null rather than a wrong title when nothing is convincing:
 *
 * - an exact title match is accepted (years within a couple of years score best);
 * - a partial match ("E.T." for "E.T. the Extra-Terrestrial") needs the exact
 *   year too, so "Sherlock" (2010) never becomes "Sherlock Holmes" (2009).
 *
 * With `requireYear`, only results within a year of the guess count (used
 * when looking in the other catalogue, where a same-named title is likely a
 * different work).
 */
export function pickBestMatch(
  results: TmdbSearchResult[],
  guess: { title: string; year: number | null; originalTitle?: string | null },
  options: { requireYear?: boolean } = {},
): TmdbSearchResult | null {
  const wanted = [guess.title, guess.originalTitle]
    .filter((t): t is string => Boolean(t))
    .map(normalizeTitle);

  let best: { result: TmdbSearchResult; score: number } | null = null;
  for (const result of results) {
    const t = titleScore(result, wanted);
    if (t < 0.6) continue;
    const y = yearScore(result, guess.year);
    if (options.requireYear && y < 1.2) continue;
    const exactTitle = t >= 3;
    if (!exactTitle && y < 2) continue;
    const score = t + y + Math.log10(1 + (result.vote_count ?? 0)) * 0.35;
    if (!best || score > best.score) best = { result, score };
  }
  return best && best.score >= 1.6 ? best.result : null;
}

// ── Episodes ────────────────────────────────────────────────────────────────

/**
 * Confirm a guessed episode against TMDB's episode list for that season.
 * A guessed title must match one of the season's episodes (numbers are easy to
 * misremember, titles less so); a number alone is accepted only when no title
 * was given. Returns null when the guess can't be confirmed.
 */
export function matchEpisode(season: TmdbSeason, guess: EpisodeGuess): Episode | null {
  const episodes = season.episodes ?? [];
  let chosen: (typeof episodes)[number] | undefined;

  if (guess.title) {
    const want = normalizeTitle(guess.title);
    let bestScore = 0;
    for (const ep of episodes) {
      const score = titleSimilarity(normalizeTitle(ep.name), want);
      // Ties go to the guessed episode number.
      const tieBreak = ep.episode_number === guess.episode ? 0.01 : 0;
      if (score >= 1.4 && score + tieBreak > bestScore) {
        bestScore = score + tieBreak;
        chosen = ep;
      }
    }
  } else if (guess.episode !== null) {
    chosen = episodes.find((ep) => ep.episode_number === guess.episode);
  }

  if (!chosen) return null;
  return {
    season: season.season_number,
    episode: chosen.episode_number,
    title: chosen.name?.trim() || guess.title,
    airDate: chosen.air_date || null,
    overview: chosen.overview?.trim() || null,
    still: tmdbImageRef("still", chosen.still_path),
    verified: true,
  };
}

/** An episode we couldn't check (no TMDB key): shown as the AI described it. */
export function unverifiedEpisode(guess: EpisodeGuess | null): Episode | null {
  if (!guess || guess.season === null) return null;
  return {
    season: guess.season,
    episode: guess.episode,
    title: guess.title,
    airDate: null,
    overview: null,
    still: null,
    verified: false,
  };
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
  // TMDB sometimes lists one YouTube video twice (say, as Trailer and Teaser).
  const seen = new Set<string>();
  return raw
    .filter((v) => {
      if (v.site !== "YouTube" || !v.key || seen.has(v.key)) return false;
      seen.add(v.key);
      return true;
    })
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
  "a an and the of in on at to for with from by is was were be it its this that he she they his her their them who where when then as into out up down over under scene clip official trailer movie film one episode season series show".split(
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
 * Choose a video for a title. When a scene was described, prefer an official
 * clip whose name mentions it; otherwise fall back to the main trailer.
 */
export function pickVideo(videos: Video[], scene: string | null, title: string): Video | null {
  if (videos.length === 0) return null;
  if (scene) {
    const titleWords = keywords(title);
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

export function mapWatchOptions(raw: { "watch/providers"?: TmdbWatchProviders }, region: string): WatchOptions | null {
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

function movieCertification(raw: TmdbMovieDetails, region: string): string | null {
  const entry = raw.release_dates?.results?.find((r) => r.iso_3166_1 === region);
  const dates = entry?.release_dates ?? [];
  // Prefer the theatrical (type 3) rating, then any non-empty one.
  const theatrical = dates.find((d) => d.type === 3 && d.certification);
  const any = dates.find((d) => d.certification);
  return (theatrical ?? any)?.certification?.trim() || null;
}

function tvCertification(raw: TmdbTvDetails, region: string): string | null {
  return raw.content_ratings?.results?.find((r) => r.iso_3166_1 === region)?.rating?.trim() || null;
}

function person(p: TmdbPersonRef, role: string | null | undefined): Person {
  return { id: p.id, name: p.name, role: role?.trim() || null, photo: tmdbImageRef("profile", p.profile_path) };
}

function differentTitle(original: string | undefined, title: string): string | null {
  return original && normalizeTitle(original) !== normalizeTitle(title) ? original : null;
}

/** IMDb ids look like tt0162222; TMDB's copy is community-edited, so check. */
function imdbId(value: string | null | undefined): string | null {
  return value && /^tt\d{5,10}$/.test(value) ? value : null;
}

function rating(raw: { vote_average?: number; vote_count?: number }): number | null {
  return raw.vote_count && raw.vote_count > 0 && raw.vote_average ? Math.round(raw.vote_average * 10) / 10 : null;
}

function cleanCountries(codes: (string | undefined)[]): string[] {
  return Array.from(new Set(codes.filter((c): c is string => typeof c === "string" && /^[A-Z]{2}$/.test(c))));
}

export function mapMovieDetails(raw: TmdbMovieDetails, region: string): TitleDetails {
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

  return {
    kind: "movie",
    tmdbId: raw.id,
    imdbId: imdbId(raw.imdb_id),
    title: raw.title,
    originalTitle: differentTitle(raw.original_title, raw.title),
    year: yearOf(raw.release_date),
    endYear: null,
    ongoing: false,
    status: raw.status || null,
    releaseDate: raw.release_date || null,
    overview: raw.overview?.trim() || null,
    tagline: raw.tagline?.trim() || null,
    poster: tmdbImageRef("poster", raw.poster_path),
    backdrop: tmdbImageRef("backdrop", raw.backdrop_path),
    runtime: raw.runtime && raw.runtime > 0 ? raw.runtime : null,
    genres: (raw.genres ?? []).map((g) => g.name),
    rating: rating(raw),
    voteCount: raw.vote_count ?? 0,
    certification: movieCertification(raw, region),
    directors,
    creators: [],
    writers: writers.slice(0, 4),
    cast,
    networks: [],
    seasonCount: null,
    episodeCount: null,
    seasons: [],
    originCountries: cleanCountries(
      raw.origin_country?.length ? raw.origin_country : (raw.production_countries ?? []).map((c) => c.iso_3166_1),
    ),
    originalLanguage: raw.original_language || null,
    videos: mapVideos(raw.videos?.results),
    watch: mapWatchOptions(raw, region),
    homepage: safeUrl(raw.homepage),
  };
}

const ONGOING_STATUSES = new Set(["Returning Series", "In Production", "Planned", "Pilot"]);

export function mapTvDetails(raw: TmdbTvDetails, region: string): TitleDetails {
  const ongoing = raw.in_production === true || ONGOING_STATUSES.has(raw.status ?? "");
  const cast = (raw.aggregate_credits?.cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 12)
    .map((c) => person(c, c.roles?.[0]?.character));
  const seasons: SeasonSummary[] = (raw.seasons ?? [])
    .filter((s) => s.season_number > 0)
    .sort((a, b) => a.season_number - b.season_number)
    .map((s) => ({
      number: s.season_number,
      name: s.name?.trim() || `Season ${s.season_number}`,
      episodeCount: s.episode_count ?? null,
      year: yearOf(s.air_date),
      poster: tmdbImageRef("poster", s.poster_path),
    }));
  const runtime = raw.episode_run_time?.find((m) => m > 0) ?? raw.last_episode_to_air?.runtime ?? null;

  return {
    kind: "tv",
    tmdbId: raw.id,
    imdbId: imdbId(raw.external_ids?.imdb_id),
    title: raw.name,
    originalTitle: differentTitle(raw.original_name, raw.name),
    year: yearOf(raw.first_air_date),
    endYear: ongoing ? null : yearOf(raw.last_air_date),
    ongoing,
    status: raw.status || null,
    releaseDate: raw.first_air_date || null,
    overview: raw.overview?.trim() || null,
    tagline: raw.tagline?.trim() || null,
    poster: tmdbImageRef("poster", raw.poster_path),
    backdrop: tmdbImageRef("backdrop", raw.backdrop_path),
    runtime: runtime && runtime > 0 ? runtime : null,
    genres: (raw.genres ?? []).map((g) => g.name),
    rating: rating(raw),
    voteCount: raw.vote_count ?? 0,
    certification: tvCertification(raw, region),
    directors: [],
    creators: (raw.created_by ?? []).map((c) => person(c, "Creator")),
    writers: [],
    cast,
    networks: Array.from(new Set((raw.networks ?? []).map((n) => n.name).filter(Boolean))),
    seasonCount: raw.number_of_seasons && raw.number_of_seasons > 0 ? raw.number_of_seasons : seasons.length || null,
    episodeCount: raw.number_of_episodes && raw.number_of_episodes > 0 ? raw.number_of_episodes : null,
    seasons,
    originCountries: cleanCountries(raw.origin_country ?? []),
    originalLanguage: raw.original_language || null,
    videos: mapVideos(raw.videos?.results),
    watch: mapWatchOptions(raw, region),
    homepage: safeUrl(raw.homepage),
  };
}

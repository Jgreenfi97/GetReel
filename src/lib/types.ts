/**
 * Shared data shapes for GetReel. These cross the server/client boundary, so
 * keep them plain, serializable objects.
 */

/** What someone typed, plus anything they added while narrowing it down. */
export type SearchInput = {
  /** The original description of the half-remembered film. */
  description: string;
  /** Extra details added while refining ("it was animated", "late 90s"). */
  clues: string[];
  /** Films they've ruled out, as "Title (Year)" labels. */
  excluded: string[];
};

/** One guess from the identification step, before enrichment. */
export type Candidate = {
  title: string;
  year: number | null;
  originalTitle: string | null;
  director: string | null;
  /** 0–100, calibrated confidence that this is the film. */
  confidence: number;
  /** Short explanation addressed to the person searching. */
  why: string;
  matchedClues: string[];
  unmatchedClues: string[];
  /** The scene they seem to remember, if they described one. */
  scene: string | null;
  /** A YouTube query likely to surface that scene or the trailer. */
  clipQuery: string;
};

export type Identification = {
  /** One-sentence restatement of what the person remembers. */
  interpretation: string;
  candidates: Candidate[];
  /** A question that would best separate the top guesses, if unsure. */
  followUpQuestion: string | null;
};

export type VideoKind = "scene" | "clip" | "trailer" | "teaser" | "featurette" | "video";

export type Video = {
  youtubeId: string;
  title: string;
  kind: VideoKind;
  source: "youtube-search" | "tmdb";
};

export type Person = {
  id: number;
  name: string;
  /** Character name for cast, job for crew. */
  role: string | null;
  /** TMDB image ref (see tmdb-images.ts), if any. */
  photo: string | null;
};

export type WatchProvider = {
  id: number;
  name: string;
  logo: string | null;
};

export type WatchOptions = {
  region: string;
  /** TMDB's "where to watch" page (powered by JustWatch). */
  link: string | null;
  stream: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
};

/** Everything we know about a film from TMDB. */
export type FilmDetails = {
  tmdbId: number;
  imdbId: string | null;
  title: string;
  originalTitle: string | null;
  year: number | null;
  releaseDate: string | null;
  overview: string | null;
  tagline: string | null;
  poster: string | null;
  backdrop: string | null;
  runtime: number | null;
  genres: string[];
  rating: number | null;
  voteCount: number;
  certification: string | null;
  directors: Person[];
  writers: Person[];
  cast: Person[];
  videos: Video[];
  watch: WatchOptions | null;
  homepage: string | null;
};

/** A guess combined with whatever details and clip we could find for it. */
export type FilmMatch = {
  rank: number;
  tmdbId: number | null;
  title: string;
  originalTitle: string | null;
  year: number | null;
  overview: string | null;
  tagline: string | null;
  poster: string | null;
  backdrop: string | null;
  runtime: number | null;
  genres: string[];
  director: string | null;
  cast: string[];
  confidence: number;
  why: string;
  matchedClues: string[];
  unmatchedClues: string[];
  scene: string | null;
  clip: Video | null;
  /** Other playable videos (trailers, official clips) for this film. */
  extraVideos: Video[];
  clipQuery: string;
  /** A YouTube search link, always available as a fallback. */
  clipSearchUrl: string;
  watch: WatchOptions | null;
};

export type SearchMode = "live" | "demo";

export type SearchResult = {
  input: SearchInput;
  mode: SearchMode;
  interpretation: string;
  followUpQuestion: string | null;
  matches: FilmMatch[];
  /** Plain-language notes about missing keys or partial results. */
  notices: string[];
};

export type Features = {
  claude: boolean;
  tmdb: boolean;
  youtube: boolean;
};

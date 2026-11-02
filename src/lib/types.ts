/**
 * Shared data shapes for GetReel. These cross the server/client boundary, so
 * keep them plain, serializable objects.
 *
 * A "title" is either a film ("movie") or a TV series ("tv"), matching TMDB's
 * two catalogues. TMDB ids are only unique within one catalogue, so always
 * pair an id with its kind.
 */

export type MediaKind = "movie" | "tv";

/** What someone typed, plus anything they added while narrowing it down. */
export type SearchInput = {
  /** The original description of the half-remembered film or show. */
  description: string;
  /** Extra details added while refining ("it was animated", "late 90s"). */
  clues: string[];
  /** Titles they've ruled out, as "Title (Year)" labels. */
  excluded: string[];
};

/** A specific episode the AI thinks was described. */
export type EpisodeGuess = {
  season: number | null;
  episode: number | null;
  title: string | null;
};

/** One guess from the identification step, before enrichment. */
export type Candidate = {
  kind: MediaKind;
  title: string;
  /** Release year (film) or first-air year (series). */
  year: number | null;
  originalTitle: string | null;
  /** Director (film) or creator(s) (series). */
  madeBy: string | null;
  /** 0–100, calibrated confidence that this is the title. */
  confidence: number;
  /** Short explanation addressed to the person searching. */
  why: string;
  matchedClues: string[];
  unmatchedClues: string[];
  /** The scene they seem to remember, if they described one. */
  scene: string | null;
  /** For series: the episode they seem to remember, if identifiable. */
  episode: EpisodeGuess | null;
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

export type SeasonSummary = {
  number: number;
  name: string;
  episodeCount: number | null;
  year: number | null;
  poster: string | null;
};

/** An episode of a series, confirmed against TMDB when possible. */
export type Episode = {
  season: number;
  episode: number | null;
  title: string | null;
  airDate: string | null;
  overview: string | null;
  still: string | null;
  /** True when checked against TMDB's episode list. */
  verified: boolean;
};

/** Everything we know about a film or series from TMDB. */
export type TitleDetails = {
  kind: MediaKind;
  tmdbId: number;
  imdbId: string | null;
  title: string;
  originalTitle: string | null;
  /** Release year (film) or first-air year (series). */
  year: number | null;
  /** Final year, for series that have ended. */
  endYear: number | null;
  /** Series still airing or in production. */
  ongoing: boolean;
  /** TMDB status, e.g. "Released", "Ended", "Returning Series". */
  status: string | null;
  /** Release date (film) or premiere date (series). */
  releaseDate: string | null;
  overview: string | null;
  tagline: string | null;
  poster: string | null;
  backdrop: string | null;
  /** Film length, or typical episode length for a series, in minutes. */
  runtime: number | null;
  genres: string[];
  rating: number | null;
  voteCount: number;
  certification: string | null;
  directors: Person[];
  /** Series creators. */
  creators: Person[];
  writers: Person[];
  cast: Person[];
  /** Broadcasters or streamers that air a series. */
  networks: string[];
  seasonCount: number | null;
  episodeCount: number | null;
  seasons: SeasonSummary[];
  /** ISO 3166-1 country codes. */
  originCountries: string[];
  /** ISO 639-1 language code. */
  originalLanguage: string | null;
  videos: Video[];
  watch: WatchOptions | null;
  homepage: string | null;
};

/** A guess combined with whatever details and clip we could find for it. */
export type TitleMatch = {
  rank: number;
  kind: MediaKind;
  tmdbId: number | null;
  title: string;
  originalTitle: string | null;
  year: number | null;
  endYear: number | null;
  ongoing: boolean;
  overview: string | null;
  tagline: string | null;
  poster: string | null;
  backdrop: string | null;
  runtime: number | null;
  genres: string[];
  /** Director (film) or creator(s) (series). */
  madeBy: string | null;
  cast: string[];
  networks: string[];
  seasonCount: number | null;
  episodeCount: number | null;
  /** Original language in English (e.g. "Korean"), only when it isn't English. */
  language: string | null;
  /** ISO 639-1 code of the original language (for `lang` attributes). */
  languageCode: string | null;
  /** Countries of origin in English (e.g. "South Korea"). */
  countries: string[];
  confidence: number;
  why: string;
  matchedClues: string[];
  unmatchedClues: string[];
  scene: string | null;
  episode: Episode | null;
  clip: Video | null;
  /** Other playable videos (trailers, official clips) for this title. */
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
  matches: TitleMatch[];
  /** Plain-language notes about missing keys or partial results. */
  notices: string[];
};

export type Features = {
  claude: boolean;
  tmdb: boolean;
  youtube: boolean;
};

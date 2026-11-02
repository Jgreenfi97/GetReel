import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Candidate, Features, Identification, MediaKind, TitleDetails } from "@/lib/types";

/**
 * The search pipeline with every external service replaced by a fake, so we
 * can check how results are assembled and how failures degrade.
 */

const state = vi.hoisted(() => ({
  features: { claude: true, tmdb: true, youtube: true } as Features,
  identification: null as Identification | null,
  /** Keyed by `${kind}:${title}` → details. */
  catalogue: new Map<string, TitleDetails>(),
  seasons: new Map<string, { season_number: number; episodes: { episode_number: number; name: string }[] }>(),
  tmdbFails: false,
  youtubeFails: false,
  youtubeCalls: [] as string[],
}));

vi.mock("@/lib/config", () => ({
  getFeatures: () => state.features,
  getConfig: () => ({ searchesPerHour: 2, demoDelayMs: 0 }),
}));
vi.mock("@/lib/claude", () => ({
  identifyTitles: async () => state.identification,
}));
vi.mock("@/lib/tmdb", () => ({
  findTitle: async (kind: MediaKind, title: string) => {
    if (state.tmdbFails) throw new Error("TMDB down");
    const hit = state.catalogue.get(`${kind}:${title}`);
    return hit ? { kind: hit.kind, id: hit.tmdbId } : null;
  },
  getTitleDetails: async (kind: MediaKind, id: number) =>
    [...state.catalogue.values()].find((d) => d.kind === kind && d.tmdbId === id) ?? null,
  getSeason: async (tvId: number, season: number) => state.seasons.get(`${tvId}:${season}`) ?? null,
}));
vi.mock("@/lib/youtube", () => ({
  findSceneClip: async (query: string, title: string) => {
    state.youtubeCalls.push(query);
    if (state.youtubeFails) throw new Error("quota");
    return { youtubeId: `scene-${title}`, title: `${title} scene`, kind: "scene", source: "youtube-search" };
  },
}));

import { enforceRateLimit, runSearch } from "@/lib/search";

function details(kind: MediaKind, tmdbId: number, title: string, year: number, extra: Partial<TitleDetails> = {}): TitleDetails {
  return {
    kind,
    tmdbId,
    imdbId: null,
    title,
    originalTitle: null,
    year,
    endYear: null,
    ongoing: false,
    status: null,
    releaseDate: `${year}-01-01`,
    overview: `${title} overview`,
    tagline: null,
    poster: `https://image.tmdb.org/t/p/poster/${tmdbId}.jpg`,
    backdrop: null,
    runtime: 120,
    genres: ["Drama"],
    rating: 7.5,
    voteCount: 100,
    certification: "PG",
    directors: kind === "movie" ? [{ id: 1, name: "Director One", role: "Director", photo: null }] : [],
    creators: kind === "tv" ? [{ id: 9, name: "Creator One", role: "Creator", photo: null }] : [],
    writers: [],
    cast: [{ id: 2, name: "Lead Actor", role: "Hero", photo: null }],
    networks: kind === "tv" ? ["Network"] : [],
    seasonCount: kind === "tv" ? 3 : null,
    episodeCount: kind === "tv" ? 30 : null,
    seasons: [],
    originCountries: ["US"],
    originalLanguage: "en",
    videos: [{ youtubeId: `trailer-${tmdbId}`, title: "Official Trailer", kind: "trailer", source: "tmdb" }],
    watch: null,
    homepage: null,
    ...extra,
  };
}

function guess(title: string, year: number, confidence: number, extra: Partial<Candidate> = {}): Candidate {
  return {
    kind: "movie",
    title,
    year,
    originalTitle: null,
    madeBy: null,
    confidence,
    why: `Why ${title}`,
    matchedClues: [],
    unmatchedClues: [],
    scene: null,
    episode: null,
    clipQuery: `${title} ${year} scene`,
    ...extra,
  };
}

function add(d: TitleDetails, name = d.title) {
  state.catalogue.set(`${d.kind}:${name}`, d);
}

const input = { description: "something i half remember", clues: [], excluded: [] };

beforeEach(() => {
  state.features = { claude: true, tmdb: true, youtube: true };
  state.tmdbFails = false;
  state.youtubeFails = false;
  state.youtubeCalls = [];
  state.catalogue = new Map();
  state.seasons = new Map();
  add(details("movie", 1124, "The Prestige", 2006));
  add(details("movie", 1491, "The Illusionist", 2006));
  add(details("movie", 1124, "The Prestige", 2006), "Prestige");
  state.identification = {
    interpretation: "A film about magicians.",
    followUpQuestion: "Was it set in London?",
    candidates: [guess("The Prestige", 2006, 88), guess("The Illusionist", 2006, 30), guess("Prestige", 2006, 10)],
  };
});

describe("runSearch", () => {
  it("combines guesses with TMDB details and finds a scene for the top match only", async () => {
    const result = await runSearch(input);
    expect(result.mode).toBe("live");
    expect(result.followUpQuestion).toBe("Was it set in London?");
    // The third guess resolved to the same TMDB film as the first and is dropped.
    expect(result.matches.map((m) => m.title)).toEqual(["The Prestige", "The Illusionist"]);
    expect(result.matches.map((m) => m.rank)).toEqual([0, 1]);

    const [top, second] = result.matches;
    expect(top.kind).toBe("movie");
    expect(top.madeBy).toBe("Director One");
    expect(top.cast).toEqual(["Lead Actor"]);
    expect(top.language).toBeNull();
    expect(top.countries).toEqual(["United States"]);
    expect(top.clip?.youtubeId).toBe("scene-The Prestige");
    expect(top.extraVideos.map((v) => v.youtubeId)).toEqual(["trailer-1124"]);
    expect(second.clip?.youtubeId).toBe("trailer-1491");
    expect(state.youtubeCalls).toEqual(["The Prestige 2006 scene"]);
    expect(result.notices).toEqual([]);
  });

  it("still returns guesses when TMDB and YouTube fail", async () => {
    state.tmdbFails = true;
    state.youtubeFails = true;
    const result = await runSearch(input);
    expect(result.matches).toHaveLength(3);
    expect(result.matches[0].poster).toBeNull();
    expect(result.matches[0].clip).toBeNull();
    expect(result.matches[0].clipSearchUrl).toContain("youtube.com/results");
    expect(result.notices.join(" ")).toMatch(/details couldn't be loaded/);
    expect(result.notices.join(" ")).toMatch(/scene search is unavailable/);
  });

  it("does not merge a film and a series that share a TMDB id", async () => {
    add(details("tv", 1124, "Some Series", 2010));
    state.identification = {
      interpretation: "x",
      followUpQuestion: null,
      candidates: [guess("The Prestige", 2006, 80), guess("Some Series", 2010, 20, { kind: "tv" })],
    };
    const result = await runSearch(input);
    expect(result.matches.map((m) => `${m.kind}:${m.tmdbId}`)).toEqual(["movie:1124", "tv:1124"]);
  });

  it("describes a foreign-language series with its creators, network and language", async () => {
    add(
      details("tv", 93405, "Squid Game", 2021, {
        originalTitle: "오징어 게임",
        originalLanguage: "ko",
        originCountries: ["KR"],
        endYear: 2025,
        networks: ["Netflix"],
        creators: [{ id: 1, name: "Hwang Dong-hyuk", role: "Creator", photo: null }],
      }),
    );
    state.identification = {
      interpretation: "x",
      followUpQuestion: null,
      candidates: [guess("Squid Game", 2021, 95, { kind: "tv", madeBy: "Someone Else" })],
    };
    const [top] = (await runSearch(input)).matches;
    expect(top).toMatchObject({
      kind: "tv",
      madeBy: "Hwang Dong-hyuk",
      networks: ["Netflix"],
      language: "Korean",
      languageCode: "ko",
      countries: ["South Korea"],
      endYear: 2025,
      seasonCount: 3,
    });
  });

  it("confirms a guessed episode against the season's episode list", async () => {
    add(details("tv", 1668, "Friends", 1994));
    state.seasons.set("1668:5", {
      season_number: 5,
      episodes: [
        { episode_number: 15, name: "The One with the Girl Who Hits Joey" },
        { episode_number: 16, name: "The One with the Cop" },
      ],
    });
    state.identification = {
      interpretation: "x",
      followUpQuestion: null,
      candidates: [
        guess("Friends", 1994, 98, { kind: "tv", episode: { season: 5, episode: 15, title: "The One with the Cop" } }),
      ],
    };
    const [top] = (await runSearch(input)).matches;
    expect(top.episode).toMatchObject({ season: 5, episode: 16, title: "The One with the Cop", verified: true });
  });

  it("drops an episode guess that the episode list contradicts", async () => {
    add(details("tv", 1668, "Friends", 1994));
    state.seasons.set("1668:5", { season_number: 5, episodes: [{ episode_number: 16, name: "The One with the Cop" }] });
    state.identification = {
      interpretation: "x",
      followUpQuestion: null,
      candidates: [guess("Friends", 1994, 98, { kind: "tv", episode: { season: 5, episode: 16, title: "The One That Never Was" } })],
    };
    const [top] = (await runSearch(input)).matches;
    expect(top.episode).toBeNull();
  });

  it("shows an unconfirmed episode guess when TMDB isn't configured", async () => {
    state.features = { claude: true, tmdb: false, youtube: false };
    state.identification = {
      interpretation: "x",
      followUpQuestion: null,
      candidates: [guess("Friends", 1994, 98, { kind: "tv", episode: { season: 5, episode: 16, title: "The One with the Cop" } })],
    };
    const [top] = (await runSearch(input)).matches;
    expect(top.episode).toMatchObject({ season: 5, episode: 16, verified: false });
  });

  it("uses TMDB's catalogue when a guessed film turns out to be a series", async () => {
    // findTitle reports the series catalogue for this "film".
    state.catalogue.set("movie:Sherlock", details("tv", 19885, "Sherlock", 2010));
    state.identification = {
      interpretation: "x",
      followUpQuestion: null,
      candidates: [guess("Sherlock", 2010, 70, { episode: null })],
    };
    const [top] = (await runSearch(input)).matches;
    expect(top.kind).toBe("tv");
    expect(top.madeBy).toBe("Creator One");
  });

  it("uses demo data when no Claude key is configured", async () => {
    state.features = { claude: false, tmdb: false, youtube: false };
    const result = await runSearch({
      description: "Two rival magicians in Victorian London try to outdo each other's teleportation trick",
      clues: [],
      excluded: [],
    });
    expect(result.mode).toBe("demo");
    expect(result.matches[0].title).toBe("The Prestige");
    expect(result.matches[0].overview).toMatch(/1890s London/);
    expect(result.matches[0].cast).toContain("Christian Bale");
    expect(result.notices[0]).toMatch(/Demo mode/);
  });

  it("serves the demo TV answers with their episode and origin", async () => {
    state.features = { claude: false, tmdb: false, youtube: false };
    const squid = await runSearch({
      description: "A Korean show where contestants in green tracksuits play deadly children's games for a huge cash prize",
      clues: [],
      excluded: [],
    });
    expect(squid.matches[0]).toMatchObject({
      kind: "tv",
      title: "Squid Game",
      originalTitle: "오징어 게임",
      language: "Korean",
      countries: ["South Korea"],
      networks: ["Netflix"],
      endYear: 2025,
    });
    expect(squid.matches[0].episode).toMatchObject({ season: 1, episode: 1, title: "Red Light, Green Light", airDate: "2021-09-17" });
    // Mixed results: a film among the series contenders.
    expect(squid.matches.map((m) => m.kind)).toContain("movie");
  });
});

describe("enforceRateLimit", () => {
  it("blocks a visitor after the hourly allowance", () => {
    expect(() => enforceRateLimit("visitor-1")).not.toThrow();
    expect(() => enforceRateLimit("visitor-1")).not.toThrow();
    expect(() => enforceRateLimit("visitor-1")).toThrow(expect.objectContaining({ code: "rate_limited" }));
  });

  it("never limits demo searches", () => {
    state.features = { claude: false, tmdb: false, youtube: false };
    for (let i = 0; i < 5; i++) expect(() => enforceRateLimit("visitor-2")).not.toThrow();
  });
});

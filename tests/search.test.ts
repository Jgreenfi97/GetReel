import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Features, FilmDetails, Identification } from "@/lib/types";

/**
 * The search pipeline with every external service replaced by a fake, so we
 * can check how results are assembled and how failures degrade.
 */

const state = vi.hoisted(() => ({
  features: { claude: true, tmdb: true, youtube: true } as Features,
  identification: null as Identification | null,
  details: new Map<string, FilmDetails>(),
  tmdbFails: false,
  youtubeFails: false,
  youtubeCalls: [] as string[],
}));

vi.mock("@/lib/config", () => ({
  getFeatures: () => state.features,
  getConfig: () => ({ searchesPerHour: 2 }),
}));
vi.mock("@/lib/claude", () => ({
  identifyFilm: async () => state.identification,
}));
vi.mock("@/lib/tmdb", () => ({
  findMovieId: async (title: string) => {
    if (state.tmdbFails) throw new Error("TMDB down");
    return state.details.get(title)?.tmdbId ?? null;
  },
  getMovieDetails: async (id: number) => [...state.details.values()].find((d) => d.tmdbId === id) ?? null,
}));
vi.mock("@/lib/youtube", () => ({
  findSceneClip: async (query: string, title: string) => {
    state.youtubeCalls.push(query);
    if (state.youtubeFails) throw new Error("quota");
    return { youtubeId: `scene-${title}`, title: `${title} scene`, kind: "scene", source: "youtube-search" };
  },
}));

import { enforceRateLimit, runSearch } from "@/lib/search";

function details(tmdbId: number, title: string, year: number): FilmDetails {
  return {
    tmdbId,
    imdbId: null,
    title,
    originalTitle: null,
    year,
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
    directors: [{ id: 1, name: "Director One", role: "Director", photo: null }],
    writers: [],
    cast: [{ id: 2, name: "Lead Actor", role: "Hero", photo: null }],
    videos: [{ youtubeId: `trailer-${tmdbId}`, title: "Official Trailer", kind: "trailer", source: "tmdb" }],
    watch: null,
    homepage: null,
  };
}

function guess(title: string, year: number, confidence: number) {
  return {
    title,
    year,
    originalTitle: null,
    director: null,
    confidence,
    why: `Why ${title}`,
    matchedClues: [],
    unmatchedClues: [],
    scene: null,
    clipQuery: `${title} ${year} scene`,
  };
}

const input = { description: "a film i half remember", clues: [], excluded: [] };

beforeEach(() => {
  state.features = { claude: true, tmdb: true, youtube: true };
  state.tmdbFails = false;
  state.youtubeFails = false;
  state.youtubeCalls = [];
  state.details = new Map([
    ["The Prestige", details(1124, "The Prestige", 2006)],
    ["The Illusionist", details(1491, "The Illusionist", 2006)],
    ["Prestige", details(1124, "The Prestige", 2006)],
  ]);
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
    expect(top.director).toBe("Director One");
    expect(top.cast).toEqual(["Lead Actor"]);
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

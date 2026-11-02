import { describe, expect, it } from "vitest";

import {
  mapMovieDetails,
  mapTvDetails,
  mapVideos,
  matchEpisode,
  normalizeTvResults,
  pickBestMatch,
  pickVideo,
  safeUrl,
  unverifiedEpisode,
  type TmdbMovieDetails,
  type TmdbSeason,
  type TmdbTvDetails,
} from "@/lib/tmdb-core";
import { resolveTmdbImage, tmdbImageRef, tmdbImageUrl } from "@/lib/tmdb-images";

describe("pickBestMatch", () => {
  const results = [
    { id: 1, title: "Gaslight", release_date: "1940-06-25", vote_count: 120 },
    { id: 2, title: "Gaslight", release_date: "1944-05-04", vote_count: 900 },
    { id: 3, title: "Gaslight Anthem Live", release_date: "2015-01-01", vote_count: 2 },
  ];

  it("prefers the matching year over the more popular film", () => {
    expect(pickBestMatch(results, { title: "Gaslight", year: 1940 })?.id).toBe(1);
    expect(pickBestMatch(results, { title: "Gaslight", year: 1944 })?.id).toBe(2);
  });

  it("matches on the original-language title", () => {
    const foreign = [{ id: 9, title: "Spirited Away", original_title: "千と千尋の神隠し", release_date: "2001-07-20", vote_count: 15000 }];
    expect(pickBestMatch(foreign, { title: "Sen to Chihiro", year: 2001, originalTitle: "千と千尋の神隠し" })?.id).toBe(9);
  });

  it("returns null instead of a wrong film", () => {
    expect(pickBestMatch(results, { title: "Casablanca", year: 1942 })).toBeNull();
    expect(pickBestMatch([], { title: "Anything", year: null })).toBeNull();
  });
});

describe("videos", () => {
  const raw = [
    { key: "teaser1", site: "YouTube", type: "Teaser", name: "Teaser", official: true },
    { key: "vimeo", site: "Vimeo", type: "Trailer", name: "Vimeo trailer", official: true },
    { key: "clip1", site: "YouTube", type: "Clip", name: "'Wilson' Clip", official: true },
    { key: "fan", site: "YouTube", type: "Trailer", name: "Fan trailer", official: false },
    { key: "trailer1", site: "YouTube", type: "Trailer", name: "Official Trailer", official: true },
  ];

  it("keeps YouTube videos only, official trailers first", () => {
    expect(mapVideos(raw).map((v) => v.youtubeId)).toEqual(["trailer1", "clip1", "teaser1", "fan"]);
  });

  it("picks a clip that mentions the described scene", () => {
    const pick = pickVideo(mapVideos(raw), "Chuck loses Wilson at sea", "Cast Away");
    expect(pick?.youtubeId).toBe("clip1");
    expect(pick?.kind).toBe("scene");
  });

  it("falls back to the trailer", () => {
    expect(pickVideo(mapVideos(raw), null, "Cast Away")?.youtubeId).toBe("trailer1");
    expect(pickVideo(mapVideos(raw), "the plane crash", "Cast Away")?.youtubeId).toBe("trailer1");
    expect(pickVideo([], null, "x")).toBeNull();
  });
});

describe("mapMovieDetails", () => {
  const raw: TmdbMovieDetails = {
    id: 8358,
    imdb_id: "tt0162222",
    title: "Cast Away",
    original_title: "Cast Away",
    release_date: "2000-12-22",
    overview: " A FedEx engineer is stranded. ",
    tagline: "",
    poster_path: "/poster.jpg",
    backdrop_path: null,
    runtime: 143,
    genres: [{ id: 12, name: "Adventure" }],
    vote_average: 7.666,
    vote_count: 11000,
    credits: {
      cast: [
        { id: 2, name: "Helen Hunt", character: "Kelly Frears", order: 1 },
        { id: 1, name: "Tom Hanks", character: "Chuck Noland", order: 0, profile_path: "/hanks.jpg" },
      ],
      crew: [
        { id: 10, name: "Robert Zemeckis", job: "Director" },
        { id: 11, name: "William Broyles Jr.", job: "Screenplay" },
        { id: 11, name: "William Broyles Jr.", job: "Writer" },
      ],
    },
    release_dates: {
      results: [{ iso_3166_1: "US", release_dates: [{ certification: "", type: 1 }, { certification: "PG-13", type: 3 }] }],
    },
    "watch/providers": {
      results: {
        US: {
          link: "https://www.themoviedb.org/movie/8358/watch?locale=US",
          rent: [{ provider_id: 2, provider_name: "Apple TV", logo_path: "/apple.jpg", display_priority: 2 }],
        },
      },
    },
  };

  it("maps the fields GetReel uses", () => {
    const details = mapMovieDetails(raw, "US");
    expect(details.year).toBe(2000);
    expect(details.overview).toBe("A FedEx engineer is stranded.");
    expect(details.tagline).toBeNull();
    expect(details.originalTitle).toBeNull();
    expect(details.rating).toBe(7.7);
    expect(details.certification).toBe("PG-13");
    expect(details.directors.map((d) => d.name)).toEqual(["Robert Zemeckis"]);
    expect(details.writers).toHaveLength(1);
    expect(details.cast[0]).toMatchObject({ name: "Tom Hanks", role: "Chuck Noland" });
    expect(details.cast[0].photo).toBe("https://image.tmdb.org/t/p/profile/hanks.jpg");
    expect(details.poster).toBe("https://image.tmdb.org/t/p/poster/poster.jpg");
    expect(details.watch?.rent[0].name).toBe("Apple TV");
    expect(details.kind).toBe("movie");
    expect(details.creators).toEqual([]);
  });

  it("reads the original language and countries", () => {
    const details = mapMovieDetails({ ...raw, original_language: "ja", origin_country: ["JP"] }, "US");
    expect(details.originalLanguage).toBe("ja");
    expect(details.originCountries).toEqual(["JP"]);
    const fromProduction = mapMovieDetails({ ...raw, production_countries: [{ iso_3166_1: "FR" }, { iso_3166_1: "xx" }] }, "US");
    expect(fromProduction.originCountries).toEqual(["FR"]);
  });

  it("returns no watch options for a region without providers", () => {
    expect(mapMovieDetails(raw, "FR").watch).toBeNull();
  });

  it("drops community-edited links that aren't plain web URLs", () => {
    expect(mapMovieDetails({ ...raw, homepage: "javascript:alert(1)" }, "US").homepage).toBeNull();
    expect(safeUrl("https://www.castaway.com/")).toBe("https://www.castaway.com/");
    expect(safeUrl("data:text/html,hi")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
  });
});

describe("TMDB image URLs", () => {
  it("resolves placeholder refs to the nearest real size", () => {
    const ref = tmdbImageRef("poster", "abc.jpg")!;
    expect(resolveTmdbImage(ref, 300)).toBe("https://image.tmdb.org/t/p/w342/abc.jpg");
    expect(resolveTmdbImage(ref, 2000)).toBe("https://image.tmdb.org/t/p/original/abc.jpg");
    expect(resolveTmdbImage(tmdbImageRef("backdrop", "/b.jpg")!, 1000)).toBe("https://image.tmdb.org/t/p/w1280/b.jpg");
  });

  it("leaves concrete and non-TMDB URLs alone", () => {
    expect(resolveTmdbImage("https://image.tmdb.org/t/p/w500/x.jpg", 92)).toBe("https://image.tmdb.org/t/p/w500/x.jpg");
    expect(resolveTmdbImage("/textures/marble.webp", 100)).toBeNull();
    expect(tmdbImageUrl("poster", null, 300)).toBeNull();
  });
});

describe("TV search results", () => {
  it("maps series fields onto the film names used for matching", () => {
    const results = normalizeTvResults({
      results: [{ id: 1396, name: "Breaking Bad", original_name: "Breaking Bad", first_air_date: "2008-01-20", vote_count: 15000 }],
    });
    expect(results[0]).toMatchObject({ id: 1396, title: "Breaking Bad", release_date: "2008-01-20" });
    expect(pickBestMatch(results, { title: "Breaking Bad", year: 2008 })?.id).toBe(1396);
  });

  it("only accepts a same-year match when told to", () => {
    const fargo = [{ id: 60622, title: "Fargo", release_date: "2014-04-15", vote_count: 3000 }];
    expect(pickBestMatch(fargo, { title: "Fargo", year: 1996 })?.id).toBe(60622);
    expect(pickBestMatch(fargo, { title: "Fargo", year: 1996 }, { requireYear: true })).toBeNull();
    expect(pickBestMatch(fargo, { title: "Fargo", year: 2014 }, { requireYear: true })?.id).toBe(60622);
  });
});

describe("mapTvDetails", () => {
  const raw: TmdbTvDetails = {
    id: 93405,
    name: "Squid Game",
    original_name: "오징어 게임",
    original_language: "ko",
    origin_country: ["KR"],
    first_air_date: "2021-09-17",
    last_air_date: "2025-06-27",
    status: "Ended",
    in_production: false,
    overview: "Hundreds of players compete.",
    episode_run_time: [],
    last_episode_to_air: { runtime: 61 },
    number_of_seasons: 3,
    number_of_episodes: 22,
    genres: [{ id: 18, name: "Drama" }],
    vote_average: 7.8,
    vote_count: 15000,
    created_by: [{ id: 1, name: "Hwang Dong-hyuk", profile_path: null }],
    networks: [{ id: 213, name: "Netflix" }],
    seasons: [
      { season_number: 0, name: "Specials", episode_count: 3 },
      { season_number: 2, name: "Season 2", episode_count: 7, air_date: "2024-12-26", poster_path: "/s2.jpg" },
      { season_number: 1, name: "Season 1", episode_count: 9, air_date: "2021-09-17", poster_path: "/s1.jpg" },
    ],
    aggregate_credits: {
      cast: [
        { id: 2, name: "Park Hae-soo", order: 1, roles: [{ character: "Cho Sang-woo" }] },
        { id: 3, name: "Lee Jung-jae", order: 0, roles: [{ character: "Seong Gi-hun" }] },
      ],
    },
    content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-MA" }] },
    external_ids: { imdb_id: "tt10919420" },
  };

  it("maps a series", () => {
    const t = mapTvDetails(raw, "US");
    expect(t).toMatchObject({
      kind: "tv",
      title: "Squid Game",
      originalTitle: "오징어 게임",
      year: 2021,
      endYear: 2025,
      ongoing: false,
      runtime: 61,
      seasonCount: 3,
      episodeCount: 22,
      certification: "TV-MA",
      networks: ["Netflix"],
      originCountries: ["KR"],
      originalLanguage: "ko",
      imdbId: "tt10919420",
    });
    expect(t.creators.map((c) => c.name)).toEqual(["Hwang Dong-hyuk"]);
    expect(t.cast[0]).toMatchObject({ name: "Lee Jung-jae", role: "Seong Gi-hun" });
    // Specials are left out and seasons are in order.
    expect(t.seasons.map((s) => s.number)).toEqual([1, 2]);
    expect(t.seasons[0]).toMatchObject({ name: "Season 1", episodeCount: 9, year: 2021 });
  });

  it("treats a returning series as ongoing, with no end year", () => {
    const t = mapTvDetails({ ...raw, status: "Returning Series", in_production: true }, "US");
    expect(t.ongoing).toBe(true);
    expect(t.endYear).toBeNull();
  });
});

describe("matchEpisode", () => {
  const season: TmdbSeason = {
    season_number: 5,
    episodes: [
      { episode_number: 15, name: "The One with the Girl Who Hits Joey", air_date: "1999-02-18" },
      { episode_number: 16, name: "The One with the Cop", air_date: "1999-02-25", still_path: "/cop.jpg", overview: "Pivot!" },
      { episode_number: 17, name: "The One with Rachel's Inadvertent Kiss" },
    ],
  };

  it("confirms an episode by title, correcting a wrong number", () => {
    const ep = matchEpisode(season, { season: 5, episode: 15, title: "The One With The Cop" });
    expect(ep).toMatchObject({ season: 5, episode: 16, title: "The One with the Cop", verified: true, airDate: "1999-02-25" });
    expect(ep?.still).toBe("https://image.tmdb.org/t/p/still/cop.jpg");
  });

  it("accepts a number alone only when no title was given", () => {
    expect(matchEpisode(season, { season: 5, episode: 17, title: null })?.title).toBe("The One with Rachel's Inadvertent Kiss");
  });

  it("drops a guess the episode list contradicts", () => {
    expect(matchEpisode(season, { season: 5, episode: 16, title: "The One Where Ross Got High" })).toBeNull();
    expect(matchEpisode(season, { season: 5, episode: 40, title: null })).toBeNull();
  });

  it("keeps an unconfirmed guess as-is when there's nothing to check against", () => {
    expect(unverifiedEpisode({ season: 1, episode: 1, title: "Pilot" })).toMatchObject({ season: 1, episode: 1, verified: false });
    expect(unverifiedEpisode(null)).toBeNull();
  });
});

describe("review fixes", () => {
  it("needs the exact year for a partial title match", () => {
    const results = [
      { id: 10528, title: "Sherlock Holmes", release_date: "2009-12-23", vote_count: 14000 },
      { id: 601, title: "E.T. the Extra-Terrestrial", release_date: "1982-06-11", vote_count: 11000 },
    ];
    expect(pickBestMatch(results, { title: "Sherlock", year: 2010 })).toBeNull();
    expect(pickBestMatch(results, { title: "Sherlock", year: null })).toBeNull();
    expect(pickBestMatch(results, { title: "E.T.", year: 1982 })?.id).toBe(601);
  });

  it("lists each YouTube video once", () => {
    const videos = mapVideos([
      { key: "dup", site: "YouTube", type: "Trailer", name: "Trailer", official: true },
      { key: "dup", site: "YouTube", type: "Teaser", name: "Teaser", official: true },
    ]);
    expect(videos.map((v) => v.youtubeId)).toEqual(["dup"]);
  });

  it("only keeps well-formed IMDb ids", () => {
    const base = { id: 1, title: "X" };
    expect(mapMovieDetails({ ...base, imdb_id: "tt0162222" }, "US").imdbId).toBe("tt0162222");
    expect(mapMovieDetails({ ...base, imdb_id: "../find?q=spam" }, "US").imdbId).toBeNull();
  });
});

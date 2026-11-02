import { describe, expect, it } from "vitest";

import { mapDetails, mapVideos, pickBestMatch, pickVideo, safeUrl, type TmdbMovieDetails } from "@/lib/tmdb-core";
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

describe("mapDetails", () => {
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
    const details = mapDetails(raw, "US");
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
  });

  it("returns no watch options for a region without providers", () => {
    expect(mapDetails(raw, "FR").watch).toBeNull();
  });

  it("drops community-edited links that aren't plain web URLs", () => {
    expect(mapDetails({ ...raw, homepage: "javascript:alert(1)" }, "US").homepage).toBeNull();
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

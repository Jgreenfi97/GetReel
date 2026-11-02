import { describe, expect, it } from "vitest";

import {
  isRuledOut,
  normalizeTitle,
  parseTitleLabel,
  toIdentification,
  type RawCandidate,
} from "@/lib/identification";
import type { SearchInput } from "@/lib/types";

function raw(title: string, year: number | null, extra: Partial<RawCandidate> = {}): RawCandidate {
  return {
    kind: "movie",
    title,
    year,
    original_title: null,
    made_by: null,
    confidence: 50,
    why: "Because.",
    matched_clues: [],
    unmatched_clues: [],
    scene: null,
    season: null,
    episode: null,
    episode_title: null,
    clip_search_query: "",
    ...extra,
  };
}

const input = (excluded: string[] = []): SearchInput => ({ description: "a film", clues: [], excluded });

describe("normalizeTitle", () => {
  it("ignores case, punctuation, accents and leading articles", () => {
    expect(normalizeTitle("The Grand Budapest Hotel")).toBe("grand budapest hotel");
    expect(normalizeTitle("Amélie")).toBe("amelie");
    expect(normalizeTitle("E.T. the Extra-Terrestrial")).toBe("e t the extra terrestrial");
    expect(normalizeTitle("Mr. & Mrs. Smith")).toBe("mr and mrs smith");
  });

  it("keeps letters from any script", () => {
    expect(normalizeTitle("오징어 게임")).toBe("오징어 게임");
    expect(normalizeTitle("La casa de papel")).toBe("la casa de papel");
    expect(normalizeTitle("千と千尋の神隠し")).toBe("千と千尋の神隠し");
    // Voiced kana keep their marks, so ぢ and ち stay different.
    expect(normalizeTitle("はなぢ")).not.toBe(normalizeTitle("はなち"));
  });
});

describe("parseTitleLabel / isRuledOut", () => {
  it("parses title and year", () => {
    expect(parseTitleLabel("The Prestige (2006)")).toEqual({ title: "prestige", year: 2006 });
    expect(parseTitleLabel("Heat")).toEqual({ title: "heat", year: null });
  });

  it("rules out the same film, tolerating a one-year difference", () => {
    const ruledOut = [parseTitleLabel("Gaslight (1944)")];
    expect(isRuledOut({ title: "Gaslight", year: 1944 }, ruledOut)).toBe(true);
    expect(isRuledOut({ title: "gaslight", year: 1945 }, ruledOut)).toBe(true);
    // The 1940 British original is a different film.
    expect(isRuledOut({ title: "Gaslight", year: 1940 }, ruledOut)).toBe(false);
  });

  it("a label without a year rules out every film with that title", () => {
    const ruledOut = [parseTitleLabel("Gaslight")];
    expect(isRuledOut({ title: "Gaslight", year: 1940 }, ruledOut)).toBe(true);
  });
});

describe("toIdentification", () => {
  it("clamps confidence, accepts 0–1 probabilities and validates years", () => {
    const result = toIdentification(
      {
        interpretation: " A film. ",
        candidates: [raw("A", 1999, { confidence: 140 }), raw("B", 3000, { confidence: 0.42 }), raw("C", null, { confidence: -5 })],
        follow_up_question: "  ",
      },
      input(),
    );
    expect(result.interpretation).toBe("A film.");
    expect(result.followUpQuestion).toBeNull();
    expect(result.candidates.map((c) => c.confidence)).toEqual([100, 42, 0]);
    expect(result.candidates[1].year).toBeNull();
  });

  it("drops ruled-out films and duplicates, and caps the list at five", () => {
    const result = toIdentification(
      {
        interpretation: "x",
        candidates: [
          raw("The Prestige", 2006),
          raw("The Illusionist", 2006),
          raw("the prestige", 2006),
          raw("One", 2001),
          raw("Two", 2002),
          raw("Three", 2003),
          raw("Four", 2004),
          raw("Five", 2005),
        ],
        follow_up_question: null,
      },
      input(["The Illusionist (2006)"]),
    );
    expect(result.candidates.map((c) => c.title)).toEqual(["The Prestige", "One", "Two", "Three", "Four"]);
  });

  it("fills in a trailer query when the model leaves it blank and drops identical original titles", () => {
    const [candidate] = toIdentification(
      { interpretation: "x", candidates: [raw("Heat", 1995, { original_title: "Heat" })], follow_up_question: null },
      input(),
    ).candidates;
    expect(candidate.clipQuery).toBe("Heat 1995 official trailer");
    expect(candidate.originalTitle).toBeNull();
  });
});

describe("series and episodes", () => {
  it("keeps a film and a series that share a name and year", () => {
    const result = toIdentification(
      {
        interpretation: "x",
        candidates: [raw("Fargo", 1996), raw("Fargo", 1996, { kind: "tv" })],
        follow_up_question: null,
      },
      input(),
    );
    expect(result.candidates.map((c) => c.kind)).toEqual(["movie", "tv"]);
  });

  it("keeps an episode guess for a series when it has a season plus a number or title", () => {
    const [friends, partial, noSeason, film] = toIdentification(
      {
        interpretation: "x",
        candidates: [
          raw("Friends", 1994, { kind: "tv", season: 5, episode: 16, episode_title: " The One with the Cop " }),
          raw("Seinfeld", 1989, { kind: "tv", season: 3, episode: null, episode_title: "The Parking Garage" }),
          raw("Lost", 2004, { kind: "tv", season: null, episode: 1, episode_title: "Pilot" }),
          raw("Heat", 1995, { season: 1, episode: 1 }),
        ],
        follow_up_question: null,
      },
      input(),
    ).candidates;
    expect(friends.episode).toEqual({ season: 5, episode: 16, title: "The One with the Cop" });
    expect(partial.episode).toEqual({ season: 3, episode: null, title: "The Parking Garage" });
    expect(noSeason.episode).toBeNull();
    // Films never carry an episode.
    expect(film.episode).toBeNull();
  });

  it("rejects impossible season and episode numbers", () => {
    const [candidate] = toIdentification(
      {
        interpretation: "x",
        candidates: [raw("Show", 2010, { kind: "tv", season: -1, episode: 0, episode_title: null })],
        follow_up_question: null,
      },
      input(),
    ).candidates;
    expect(candidate.episode).toBeNull();
  });

  it("maps made_by to madeBy", () => {
    const [candidate] = toIdentification(
      { interpretation: "x", candidates: [raw("Squid Game", 2021, { kind: "tv", made_by: " Hwang Dong-hyuk " })], follow_up_question: null },
      input(),
    ).candidates;
    expect(candidate.madeBy).toBe("Hwang Dong-hyuk");
  });
});

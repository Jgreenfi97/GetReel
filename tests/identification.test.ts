import { describe, expect, it } from "vitest";

import {
  isRuledOut,
  normalizeTitle,
  parseFilmLabel,
  toIdentification,
  type RawCandidate,
} from "@/lib/identification";
import type { SearchInput } from "@/lib/types";

function raw(title: string, year: number | null, extra: Partial<RawCandidate> = {}): RawCandidate {
  return {
    title,
    year,
    original_title: null,
    director: null,
    confidence: 50,
    why: "Because.",
    matched_clues: [],
    unmatched_clues: [],
    scene: null,
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
});

describe("parseFilmLabel / isRuledOut", () => {
  it("parses title and year", () => {
    expect(parseFilmLabel("The Prestige (2006)")).toEqual({ title: "prestige", year: 2006 });
    expect(parseFilmLabel("Heat")).toEqual({ title: "heat", year: null });
  });

  it("rules out the same film, tolerating a one-year difference", () => {
    const ruledOut = [parseFilmLabel("Gaslight (1944)")];
    expect(isRuledOut({ title: "Gaslight", year: 1944 }, ruledOut)).toBe(true);
    expect(isRuledOut({ title: "gaslight", year: 1945 }, ruledOut)).toBe(true);
    // The 1940 British original is a different film.
    expect(isRuledOut({ title: "Gaslight", year: 1940 }, ruledOut)).toBe(false);
  });

  it("a label without a year rules out every film with that title", () => {
    const ruledOut = [parseFilmLabel("Gaslight")];
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

import { describe, expect, it } from "vitest";

import {
  titleLabel,
  LIMITS,
  normalizeInput,
  parseSearchParams,
  searchHref,
  withExcluded,
} from "@/lib/search-params";

describe("search URLs", () => {
  it("round-trips a search through the URL", () => {
    const input = {
      description: "two magicians & a teleporting trick",
      clues: ["Victorian London", "Hugh Jackman?"],
      excluded: ["The Illusionist (2006)"],
    };
    const href = searchHref(input);
    expect(href.startsWith("/search?q=")).toBe(true);
    const params = Object.fromEntries(
      [...new URL(href, "http://x").searchParams.keys()].map((k) => [
        k,
        new URL(href, "http://x").searchParams.getAll(k),
      ]),
    );
    expect(parseSearchParams(params)).toEqual(input);
  });

  it("returns null for missing or too-short descriptions", () => {
    expect(parseSearchParams({})).toBeNull();
    expect(parseSearchParams({ q: "  a " })).toBeNull();
  });

  it("tidies whitespace, trims long text and de-duplicates", () => {
    const input = normalizeInput({
      description: `  a   film\nabout ${"x".repeat(5000)}`,
      clues: ["it was red", "IT WAS RED", "", 42],
      excluded: ["Heat (1995)", "heat (1995)"],
    });
    expect(input?.description.startsWith("a film about")).toBe(true);
    expect(input?.description.length).toBe(LIMITS.description);
    expect(input?.clues).toEqual(["it was red"]);
    expect(input?.excluded).toEqual(["Heat (1995)"]);
  });

  it("keeps only the newest clues", () => {
    const clues = Array.from({ length: 10 }, (_, i) => `clue ${i}`);
    expect(normalizeInput({ description: "a film", clues })?.clues).toEqual(clues.slice(-LIMITS.clues));
  });
});

describe("refinement helpers", () => {
  const base = { description: "a film", clues: [], excluded: [] };

  it("adds exclusions without duplicates", () => {
    expect(withExcluded(base, ["Heat (1995)", "heat (1995)"]).excluded).toEqual(["Heat (1995)"]);
    expect(withExcluded(base, [titleLabel("Heat", 1995), titleLabel("Ronin", null)]).excluded).toEqual([
      "Heat (1995)",
      "Ronin",
    ]);
  });
});

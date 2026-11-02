import { describe, expect, it } from "vitest";

import { DEMO_PROMPTS, findDemoCase } from "@/lib/demo";
import { episodeLabel, formatDate, formatRuntime, kindLabel, nestQuotes, plural, yearsLabel } from "@/lib/format";
import { countryNames, foreignLanguageName, languageName } from "@/lib/locale";

describe("format", () => {
  it("labels years for films and series", () => {
    expect(yearsLabel({ kind: "movie", year: 2006, endYear: null, ongoing: false })).toBe("2006");
    expect(yearsLabel({ kind: "tv", year: 2008, endYear: 2013, ongoing: false })).toBe("2008–2013");
    expect(yearsLabel({ kind: "tv", year: 2021, endYear: null, ongoing: true })).toBe("2021–");
    expect(yearsLabel({ kind: "tv", year: 2016, endYear: 2016, ongoing: false })).toBe("2016");
    expect(yearsLabel({ kind: "tv", year: null, endYear: null, ongoing: true })).toBeNull();
  });

  it("formats counts, episodes, dates and runtimes", () => {
    expect(plural(1, "season")).toBe("1 season");
    expect(plural(1236, "episode")).toBe("1,236 episodes");
    expect(episodeLabel({ season: 5, episode: 16 })).toBe("Season 5 · Episode 16");
    expect(episodeLabel({ season: 0, episode: 2 })).toBe("Specials · Episode 2");
    expect(episodeLabel({ season: 3, episode: null })).toBe("Season 3");
    expect(formatDate("2021-09-17")).toBe("September 17, 2021");
    expect(formatDate("not a date")).toBeNull();
    expect(formatDate(null)).toBeNull();
    expect(formatRuntime(143)).toBe("2h 23m");
    expect(formatRuntime(45)).toBe("45m");
    expect(kindLabel("tv")).toBe("TV series");
  });

  it("nests quotation marks", () => {
    expect(nestQuotes("a guy yelling “pivot!” on the stairs")).toBe("a guy yelling ‘pivot!’ on the stairs");
    expect(nestQuotes('he said "go" twice')).toBe("he said ‘go’ twice");
    expect(nestQuotes("no quotes here")).toBe("no quotes here");
  });
});

describe("locale", () => {
  it("names languages, skipping English for the 'foreign' label", () => {
    expect(languageName("ko")).toBe("Korean");
    expect(languageName("cn")).toBe("Cantonese");
    expect(languageName("xx")).toBeNull();
    expect(languageName(null)).toBeNull();
    expect(foreignLanguageName("es")).toBe("Spanish");
    expect(foreignLanguageName("en")).toBeNull();
  });

  it("names countries and ignores bad codes", () => {
    expect(countryNames(["KR", "es", "ZZZ", "KR"])).toEqual(["South Korea", "Spain"]);
  });
});

describe("demo catalogue", () => {
  it("offers both films and series", () => {
    const kinds = new Set(DEMO_PROMPTS.map((p) => p.kind));
    expect(kinds).toEqual(new Set(["movie", "tv"]));
  });

  it("recognises paraphrased TV descriptions", () => {
    const find = (description: string) => findDemoCase({ description, clues: [], excluded: [] })?.label;
    expect(find("that show about the chemistry teacher who makes meth")).toBe("The chemistry teacher");
    expect(find("the netflix one with the dali masks and the mint")).toBe("The Dalí masks");
    expect(find("friends episode where ross yells pivot")).toBe("“Pivot!”");
  });
});

describe("review fixes", () => {
  it("makes TMDB language codes safe for lang attributes", async () => {
    const { langAttribute } = await import("@/lib/locale");
    expect(langAttribute("ko")).toBe("ko");
    expect(langAttribute("cn")).toBe("yue");
    expect(langAttribute("xx")).toBeNull();
    expect(langAttribute("constructor")).toBeNull();
    expect(languageName("constructor")).toBeNull();
  });

  it("joins names", async () => {
    const { joinNames } = await import("@/lib/format");
    expect(joinNames(["David Crane", "Marta Kauffman"])).toBe("David Crane & Marta Kauffman");
    expect(joinNames(["A", "B", "C"])).toBe("A, B & C");
    expect(joinNames([])).toBeNull();
  });
});

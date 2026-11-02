import type { SearchInput } from "./types";

/**
 * GetReel keeps every search in the URL so results can be bookmarked, shared
 * and refined with the back button:
 *
 *   /search?q=<description>&more=<extra clue>&more=…&not=<Title (Year)>&not=…
 *
 * These helpers are shared by the server (parsing) and client (building links).
 */

export const LIMITS = {
  description: 1200,
  clue: 400,
  clues: 6,
  excludedLabel: 160,
  excluded: 20,
  minDescription: 3,
} as const;

type RawParams = Record<string, string | string[] | undefined>;

function tidy(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

/** Normalise a SearchInput from any source (URL, JSON body). */
export function normalizeInput(raw: {
  description?: unknown;
  clues?: unknown;
  excluded?: unknown;
}): SearchInput | null {
  const description =
    typeof raw.description === "string" ? tidy(raw.description, LIMITS.description) : "";
  if (description.length < LIMITS.minDescription) return null;

  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const clues = uniqueCaseInsensitive(
    strings(raw.clues)
      .map((c) => tidy(c, LIMITS.clue))
      .filter(Boolean),
  ).slice(-LIMITS.clues); // keep the newest clues

  const excluded = uniqueCaseInsensitive(
    strings(raw.excluded)
      .map((e) => tidy(e, LIMITS.excludedLabel))
      .filter(Boolean),
  ).slice(-LIMITS.excluded);

  return { description, clues, excluded };
}

/** Parse Next.js `searchParams` into a SearchInput (null when there's no query). */
export function parseSearchParams(params: RawParams): SearchInput | null {
  const q = asList(params.q)[0];
  return normalizeInput({
    description: q,
    clues: asList(params.more),
    excluded: asList(params.not),
  });
}

/** Build the /search URL for an input. */
export function searchHref(input: SearchInput): string {
  const qs = new URLSearchParams();
  qs.set("q", input.description);
  for (const clue of input.clues) qs.append("more", clue);
  for (const label of input.excluded) qs.append("not", label);
  return `/search?${qs.toString()}`;
}

/** "Title (Year)" label used to rule a film out. */
export function filmLabel(title: string, year: number | null): string {
  return year ? `${title} (${year})` : title;
}

export function withClue(input: SearchInput, clue: string): SearchInput {
  return normalizeInput({ ...input, clues: [...input.clues, clue] }) ?? input;
}

export function withExcluded(input: SearchInput, labels: string[]): SearchInput {
  return normalizeInput({ ...input, excluded: [...input.excluded, ...labels] }) ?? input;
}

/** A stable cache key for an input (order of clues/exclusions matters little). */
export function inputKey(input: SearchInput): string {
  return JSON.stringify([
    input.description.toLowerCase(),
    input.clues.map((c) => c.toLowerCase()),
    [...input.excluded].map((e) => e.toLowerCase()).sort(),
  ]);
}

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

import { z } from "zod";

import type { Candidate, Identification, SearchInput } from "./types";

/**
 * The JSON shape Claude must answer with, plus the clean-up we apply to it.
 * Kept free of server-only imports so it can be unit tested and reused by the
 * demo data.
 *
 * Numeric ranges are described rather than enforced in the schema: a model
 * answering "confidence: 101" should be clamped, not fail the whole search.
 */

export const MAX_CANDIDATES = 5;

export const CandidateSchema = z.object({
  title: z.string().describe("Best-known English-language release title"),
  year: z.number().nullable().describe("Original release year, e.g. 1999"),
  original_title: z
    .string()
    .nullable()
    .describe("Original-language title if different from title, else null"),
  director: z.string().nullable().describe("Director's name, or null if unsure"),
  confidence: z.number().describe("Integer from 0 to 100"),
  why: z.string().describe("One or two sentences addressed to the person"),
  matched_clues: z.array(z.string()).describe("Short phrases from their description this film matches"),
  unmatched_clues: z.array(z.string()).describe("Details from their description this film does not match"),
  scene: z.string().nullable().describe("The scene they seem to remember, or null"),
  clip_search_query: z.string().describe("YouTube search query for the scene or trailer"),
});

export const IdentificationSchema = z.object({
  interpretation: z.string().describe("One sentence restating what they remember"),
  candidates: z.array(CandidateSchema).describe(`Up to ${MAX_CANDIDATES} films, most likely first`),
  follow_up_question: z.string().nullable().describe("Question to separate the top guesses, or null"),
});

export type RawIdentification = z.infer<typeof IdentificationSchema>;
export type RawCandidate = z.infer<typeof CandidateSchema>;

/**
 * A comparable form of a title: lower case, accents and punctuation removed,
 * leading English article dropped. Letters from any script are kept, so
 * original-language titles (千と千尋の神隠し, Amélie) still compare.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Accept 0–1 probabilities as well as 0–100 percentages.
  const scaled = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function cleanYear(year: number | null): number | null {
  if (year === null || !Number.isFinite(year)) return null;
  const y = Math.round(year);
  return y >= 1870 && y <= 2100 ? y : null;
}

function cleanList(values: string[], max = 6): string[] {
  return values
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);
}

function nonEmpty(value: string | null): string | null {
  const v = value?.trim();
  return v ? v : null;
}

type RuledOut = { title: string; year: number | null };

/** Parse "Title (Year)" labels back into comparable parts. */
export function parseFilmLabel(label: string): RuledOut {
  const match = label.match(/^(.*?)\s*\((\d{4})\)\s*$/);
  return match
    ? { title: normalizeTitle(match[1]), year: Number(match[2]) }
    : { title: normalizeTitle(label), year: null };
}

/**
 * A film is ruled out when its title matches a label and the years agree
 * (within a year, since festival and wide releases often differ). A label
 * without a year rules out every film with that title.
 */
export function isRuledOut(candidate: { title: string; year: number | null }, ruledOut: RuledOut[]): boolean {
  const title = normalizeTitle(candidate.title);
  return ruledOut.some(
    (r) =>
      r.title === title &&
      (r.year === null || candidate.year === null || Math.abs(r.year - candidate.year) <= 1),
  );
}

export function toCandidate(raw: RawCandidate): Candidate {
  const title = raw.title.trim();
  const year = cleanYear(raw.year);
  const clipQuery =
    raw.clip_search_query.trim() || [title, year, "official trailer"].filter(Boolean).join(" ");
  const originalTitle = nonEmpty(raw.original_title);
  return {
    title,
    year,
    originalTitle: originalTitle && normalizeTitle(originalTitle) !== normalizeTitle(title) ? originalTitle : null,
    director: nonEmpty(raw.director),
    confidence: clampConfidence(raw.confidence),
    why: raw.why.trim(),
    matchedClues: cleanList(raw.matched_clues),
    unmatchedClues: cleanList(raw.unmatched_clues, 4),
    scene: nonEmpty(raw.scene),
    clipQuery,
  };
}

/** Clean up Claude's answer: clamp numbers, drop ruled-out or duplicate films. */
export function toIdentification(raw: RawIdentification, input: SearchInput): Identification {
  const ruledOut = input.excluded.map(parseFilmLabel);
  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  for (const rawCandidate of raw.candidates) {
    if (!rawCandidate.title?.trim()) continue;
    const candidate = toCandidate(rawCandidate);
    if (isRuledOut(candidate, ruledOut)) continue;
    const key = `${normalizeTitle(candidate.title)}|${candidate.year ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  return {
    interpretation: raw.interpretation.trim(),
    candidates,
    followUpQuestion: nonEmpty(raw.follow_up_question),
  };
}

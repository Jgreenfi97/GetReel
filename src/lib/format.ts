import type { Episode, MediaKind } from "./types";

/** Small, deterministic formatters shared by server and client components. */

/** Swap double quotes inside a quotation for single ones: “a ‘b’ c”. */
export function nestQuotes(text: string): string {
  return text.replace(/[“”"]/g, (q, offset: number) => {
    if (q === "“") return "‘";
    if (q === "”") return "’";
    // Straight quotes: opening when at the start or after a space or bracket.
    return offset === 0 || /[\s(\[]/.test(text[offset - 1]) ? "‘" : "’";
  });
}

/** "A", "A & B", "A, B & C" */
export function joinNames(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function kindLabel(kind: MediaKind): string {
  return kind === "tv" ? "TV series" : "Film";
}

/** "2006" for films; "2008–2013", "2021–" or "2021" for series. */
export function yearsLabel(t: { kind: MediaKind; year: number | null; endYear: number | null; ongoing: boolean }): string | null {
  if (t.year === null) return null;
  if (t.kind !== "tv") return String(t.year);
  if (t.ongoing) return `${t.year}–`;
  if (t.endYear !== null && t.endYear !== t.year) return `${t.year}–${t.endYear}`;
  return String(t.year);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** "Season 5 · Episode 16" (or just the season when the number is unknown). */
export function episodeLabel(episode: Pick<Episode, "season" | "episode">): string {
  const season = episode.season === 0 ? "Specials" : `Season ${episode.season}`;
  return episode.episode !== null ? `${season} · Episode ${episode.episode}` : season;
}

/** "December 22, 2000" from an ISO date, independent of the server's time zone. */
export function formatDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** "2h 23m" */
export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

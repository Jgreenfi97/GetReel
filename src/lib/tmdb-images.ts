/**
 * Helpers for TMDB image URLs.
 *
 * TMDB hosts each image type in a fixed set of widths. We store image URLs with
 * a placeholder "kind" segment (e.g. `https://image.tmdb.org/t/p/poster/abc.jpg`)
 * and let the image loader swap in the smallest real width that covers what the
 * browser asked for. `tmdbImageUrl` builds a concrete URL directly.
 */

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/";

export type TmdbImageKind = "poster" | "backdrop" | "profile" | "logo" | "still";

const SIZES: Record<TmdbImageKind, readonly number[]> = {
  poster: [92, 154, 185, 342, 500, 780],
  backdrop: [300, 780, 1280],
  profile: [45, 185],
  logo: [45, 92, 154, 185, 300, 500],
  /** Frames from individual episodes. */
  still: [92, 185, 300],
};

const KINDS = Object.keys(SIZES) as TmdbImageKind[];

/** The smallest TMDB size segment (e.g. "w342") that is at least `width` wide. */
export function tmdbSizeFor(kind: TmdbImageKind, width: number): string {
  const match = SIZES[kind].find((w) => w >= width);
  return match ? `w${match}` : "original";
}

/** A responsive placeholder URL, resolved to a real size by the image loader. */
export function tmdbImageRef(
  kind: TmdbImageKind,
  filePath: string | null | undefined,
): string | null {
  if (!filePath) return null;
  const clean = filePath.startsWith("/") ? filePath : `/${filePath}`;
  return `${TMDB_IMAGE_BASE}${kind}${clean}`;
}

/** A concrete TMDB URL at a fixed width (for CSS backgrounds, OG images, etc.). */
export function tmdbImageUrl(
  kind: TmdbImageKind,
  filePath: string | null | undefined,
  width: number,
): string | null {
  if (!filePath) return null;
  const clean = filePath.startsWith("/") ? filePath : `/${filePath}`;
  return `${TMDB_IMAGE_BASE}${tmdbSizeFor(kind, width)}${clean}`;
}

/**
 * Resolve any TMDB URL (placeholder or concrete) to the best width.
 * Returns null when the URL is not a TMDB image.
 */
export function resolveTmdbImage(src: string, width: number): string | null {
  if (!src.startsWith(TMDB_IMAGE_BASE)) return null;
  const rest = src.slice(TMDB_IMAGE_BASE.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return src;
  const segment = rest.slice(0, slash);
  const file = rest.slice(slash);
  const kind = KINDS.find((k) => k === segment);
  if (kind) return `${TMDB_IMAGE_BASE}${tmdbSizeFor(kind, width)}${file}`;
  // Already a concrete size such as "w500" or "original": leave it alone.
  return src;
}

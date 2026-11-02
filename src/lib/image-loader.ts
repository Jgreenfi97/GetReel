"use client";

import { resolveTmdbImage } from "./tmdb-images";

/**
 * Custom next/image loader (wired up in next.config.ts).
 *
 * TMDB already serves every image in several fixed widths, so rather than
 * re-encoding posters on our own server we point the browser at the TMDB size
 * that best fits. Local files and YouTube thumbnails are served as-is.
 */
export default function imageLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const tmdb = resolveTmdbImage(src, width);
  if (tmdb) return tmdb;
  if (src.startsWith("/")) {
    // Local assets are pre-sized; the query just keeps next/image's width check happy.
    return `${src}${src.includes("?") ? "&" : "?"}w=${width}`;
  }
  return src;
}

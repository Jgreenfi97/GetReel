"use client";

import { useState } from "react";

import type { Video } from "@/lib/types";

import { ClipPlayer } from "./ClipPlayer";
import styles from "./VideoGallery.module.css";

/** A screen plus a row of reels to switch between a film's clips and trailers. */
export function VideoGallery({ videos, filmTitle, searchUrl }: { videos: Video[]; filmTitle: string; searchUrl: string }) {
  const [active, setActive] = useState(0);
  const clip = videos[active] ?? null;
  return (
    <div className={styles.gallery}>
      <ClipPlayer key={clip?.youtubeId ?? "none"} clip={clip} filmTitle={filmTitle} searchUrl={searchUrl} />
      {videos.length > 1 && (
        <ul className={styles.list} aria-label="Clips and trailers">
          {videos.map((v, i) => (
            <li key={v.youtubeId}>
              <button
                type="button"
                className={`${styles.item} ${i === active ? styles.active : ""}`}
                aria-pressed={i === active}
                onClick={() => setActive(i)}
              >
                <span className={styles.kind}>{v.kind}</span>
                <span className={styles.name}>{v.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

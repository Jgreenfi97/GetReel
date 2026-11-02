"use client";

import Image from "next/image";
import { useState } from "react";

import type { Video } from "@/lib/types";

import { ReelStar } from "./ornaments";
import styles from "./ClipPlayer.module.css";

const KIND_LABEL: Record<Video["kind"], string> = {
  scene: "The scene",
  clip: "Official clip",
  trailer: "Official trailer",
  teaser: "Teaser",
  featurette: "Featurette",
  video: "Video",
};

type ClipPlayerProps = {
  clip: Video | null;
  filmTitle: string;
  /** YouTube search for the scene, used when we have no clip. */
  searchUrl: string;
};

/**
 * The screening room. Shows a still with a gold play button and only loads
 * YouTube's player when someone presses play (faster pages, and no YouTube
 * tracking until then). Parents should key this by video id.
 */
export function ClipPlayer({ clip, filmTitle, searchUrl }: ClipPlayerProps) {
  const [playing, setPlaying] = useState(false);

  if (!clip) {
    return (
      <div className={styles.screen}>
        <a href={searchUrl} target="_blank" rel="noopener noreferrer" className={styles.empty}>
          <ReelStar className={styles.emptyMark} bright />
          <span className={styles.emptyTitle}>The projector awaits</span>
          <span className={styles.emptyText}>
            No clip on file for <em>{filmTitle}</em> yet.
          </span>
          <span className={`btn btn--gold btn--small ${styles.emptyAction}`}>Find the scene on YouTube ↗</span>
        </a>
      </div>
    );
  }

  return (
    <figure className={styles.figure}>
      <div className={styles.screen}>
        {playing ? (
          <iframe
            className={styles.iframe}
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(clip.youtubeId)}?autoplay=1&rel=0&playsinline=1`}
            title={`${KIND_LABEL[clip.kind]}: ${clip.title}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button type="button" className={styles.facade} onClick={() => setPlaying(true)}>
            <Image
              src={`https://i.ytimg.com/vi/${encodeURIComponent(clip.youtubeId)}/hqdefault.jpg`}
              alt=""
              fill
              sizes="(min-width: 960px) 620px, 100vw"
              className={styles.still}
            />
            <span className={styles.vignette} aria-hidden="true" />
            <span className={styles.play} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" focusable="false">
                <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
              </svg>
            </span>
            <span className={styles.rollLabel}>Roll the clip</span>
            <span className="visually-hidden">
              Play {KIND_LABEL[clip.kind].toLowerCase()} for {filmTitle}: {clip.title}
            </span>
          </button>
        )}
      </div>
      <figcaption className={styles.caption}>
        <span className={styles.kind}>{KIND_LABEL[clip.kind]}</span>
        <span className={styles.clipTitle}>{clip.title}</span>
      </figcaption>
    </figure>
  );
}

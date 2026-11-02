"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { ReelStar } from "./ornaments";
import styles from "./ReelLoader.module.css";

const MESSAGES = [
  "Consulting the archive…",
  "Threading the projector…",
  "Checking the credits…",
  "Asking the usher who saw it last…",
  "Dusting off the reels…",
  "Cueing up the scene…",
];

function SearchingFor() {
  const q = useSearchParams().get("q");
  if (!q) return null;
  return <p className={styles.query}>“{q.length > 160 ? `${q.slice(0, 157)}…` : q}”</p>;
}

/** Shown while Claude, TMDB and YouTube do their work. */
export function ReelLoader() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % MESSAGES.length), 2600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={styles.loader} role="status" aria-live="polite">
      <div className={styles.reel} aria-hidden="true">
        <ReelStar className={styles.mark} />
      </div>
      <p className={`eyebrow ${styles.eyebrow}`}>Searching the archive</p>
      <Suspense fallback={null}>
        <SearchingFor />
      </Suspense>
      <p key={index} className={styles.message}>
        {MESSAGES[index]}
      </p>
      <div className={styles.skeleton} aria-hidden="true">
        <div className={styles.skeletonScreen} />
        <div className={styles.skeletonLines}>
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

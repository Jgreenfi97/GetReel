import Link from "next/link";

import styles from "./DemoBanner.module.css";

/** A discreet ribbon explaining demo mode (shown only when no Claude key is set). */
export function DemoBanner() {
  return (
    <aside className={styles.banner} aria-label="Demo mode">
      <span className={styles.badge}>Demo</span>
      <span>
        GetReel is showing hand-picked examples. Add your API keys to search every film and show.{" "}
        <Link href="/about#setup" className={styles.link}>
          How to switch it on
        </Link>
      </span>
    </aside>
  );
}

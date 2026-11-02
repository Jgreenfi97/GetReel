import Link from "next/link";

import { Logo } from "./Logo";
import { TileBand } from "./ornaments";
import styles from "./SiteFooter.module.css";

/** Black marble footer with the credits, like the end of a reel. */
export function SiteFooter() {
  return (
    <footer className={`onyx ${styles.footer}`}>
      <TileBand />
      <div className={`container ${styles.inner}`}>
        <div className={styles.brand}>
          <Logo size="md" onDark />
          <p className={styles.tagline}>The archive of half-remembered films and shows.</p>
        </div>

        <nav aria-label="Footer" className={styles.links}>
          <p className={styles.heading}>Explore</p>
          <Link href="/">Search</Link>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/about">About GetReel</Link>
        </nav>

        <div className={styles.credits}>
          <p className={styles.heading}>Credits</p>
          <p>
            Film data and images from{" "}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">
              TMDB
            </a>
            . This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
          <p>
            Where-to-watch listings by{" "}
            <a href="https://www.justwatch.com" target="_blank" rel="noopener noreferrer">
              JustWatch
            </a>
            . Clips play from YouTube. Films and shows identified by Claude, from Anthropic.
          </p>
        </div>
      </div>
      <div className={`container ${styles.base}`}>
        <span>GetReel · Est. MMXXVI</span>
        <span className={styles.fin}>Fin.</span>
      </div>
    </footer>
  );
}

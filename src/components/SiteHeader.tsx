import Link from "next/link";

import { Logo } from "./Logo";
import styles from "./SiteHeader.module.css";

/**
 * The slim top bar. On the home page the hero carries the big logo, so the bar
 * shows navigation only.
 */
export function SiteHeader({ home = false }: { home?: boolean }) {
  return (
    <header className={`${styles.header} ${home ? styles.home : ""}`}>
      <div className={`container ${styles.inner}`}>
        {home ? <span className={styles.est}>Est. MMXXVI</span> : <Logo size="sm" />}
        <nav aria-label="Main" className={styles.nav}>
          <Link href="/#how-it-works" className={styles.navLink}>
            How it works
          </Link>
          <Link href="/about" className={styles.navLink}>
            About
          </Link>
          {!home && (
            <Link href="/" className={`btn btn--small ${styles.cta}`}>
              New search
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

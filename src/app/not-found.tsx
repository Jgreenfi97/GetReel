import Link from "next/link";

import { ReelStar } from "@/components/ornaments";
import { SearchBox } from "@/components/SearchBox";
import { SiteHeader } from "@/components/SiteHeader";

import styles from "./status.module.css";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className={`page container ${styles.status}`}>
        <ReelStar className={styles.mark} />
        <p className="eyebrow">Error 404</p>
        <h1 className={styles.title}>This reel is missing from the archive</h1>
        <p className={styles.text}>
          The page you were looking for has been misfiled. Perhaps describe the film or show instead?
        </p>
        <div className={styles.search}>
          <SearchBox />
        </div>
        <Link href="/" className="link">
          Back to the lobby
        </Link>
      </main>
    </>
  );
}

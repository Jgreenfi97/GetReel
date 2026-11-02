"use client";

import Link from "next/link";
import { useEffect } from "react";

import { ReelStar } from "@/components/ornaments";

import styles from "./status.module.css";

/** Route-level error boundary: something unexpected broke while rendering. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className={`page container ${styles.status}`}>
      <ReelStar className={styles.mark} />
      <p className="eyebrow">Technical difficulties</p>
      <h1 className={styles.title}>The film snapped in the projector</h1>
      <p className={styles.text}>Something went wrong on our side. Splice it back together and try again.</p>
      <div className={styles.actions}>
        <button type="button" className="btn" onClick={() => retry()}>
          Try again
        </button>
        <Link href="/" className="btn btn--ghost">
          Back to the lobby
        </Link>
      </div>
    </main>
  );
}

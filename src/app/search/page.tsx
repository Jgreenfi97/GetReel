import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import { ReelLoader } from "@/components/ReelLoader";
import { ReelStar } from "@/components/ornaments";
import { ResultsView } from "@/components/ResultsView";
import { SearchBox } from "@/components/SearchBox";
import { SiteHeader } from "@/components/SiteHeader";
import { DEMO_PROMPTS } from "@/lib/demo";
import { isSearchError, publicMessageFor, type SearchErrorCode } from "@/lib/errors";
import { nestQuotes } from "@/lib/format";
import { clientKey } from "@/lib/rate-limit";
import { enforceRateLimit, runSearch } from "@/lib/search";
import { parseSearchParams, searchHref } from "@/lib/search-params";
import type { SearchResult } from "@/lib/types";

import styles from "./search.module.css";

type Props = PageProps<"/search">;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const input = parseSearchParams(await searchParams);
  const q = input?.description;
  return {
    title: q ? `“${nestQuotes(q.length > 60 ? `${q.slice(0, 57)}…` : q)}”` : "Search",
    // Every search costs an AI call: keep result pages out of search engines.
    robots: { index: false, follow: true },
  };
}

/**
 * /search?q=… — the static shell (header, search bar, loader) is sent at once;
 * the results stream in when the search finishes.
 */
export default function SearchPage({ searchParams }: Props) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="page">
        <div className={`container ${styles.bar}`}>
          <Suspense fallback={<SearchBox variant="compact" />}>
            <SearchBar searchParams={searchParams} />
          </Suspense>
        </div>
        <Suspense fallback={<ReelLoader />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function SearchBar({ searchParams }: Pick<Props, "searchParams">) {
  const input = parseSearchParams(await searchParams);
  return <SearchBox key={input?.description ?? ""} variant="compact" defaultValue={input?.description ?? ""} />;
}

async function Results({ searchParams }: Pick<Props, "searchParams">) {
  const input = parseSearchParams(await searchParams);
  if (!input) return <NoQuery />;

  const requestHeaders = await headers();
  let outcome: { result: SearchResult } | { failed: SearchErrorCode };
  try {
    enforceRateLimit(clientKey(requestHeaders));
    outcome = { result: await runSearch(input) };
  } catch (error) {
    unstable_rethrow(error);
    const code: SearchErrorCode = isSearchError(error) ? error.code : "unknown";
    if (!isSearchError(error) || code === "unknown" || code === "auth") {
      console.error("[getreel] search failed:", error);
    }
    outcome = { failed: code };
  }

  if ("failed" in outcome) return <SearchFailed code={outcome.failed} retryHref={searchHref(input)} />;
  const { result } = outcome;
  // Keyed by the search so a new search starts with fresh page state
  // (nothing ruled out, top match featured).
  return (
    <ResultsView
      key={searchHref(result.input)}
      result={result}
      examples={result.mode === "demo" ? DEMO_PROMPTS : []}
    />
  );
}

function NoQuery() {
  return (
    <section className={`container ${styles.message}`}>
      <ReelStar className={styles.mark} />
      <h1 className={styles.title}>What film or show is on the tip of your tongue?</h1>
      <p className={styles.text}>Describe anything you remember, and we’ll take it from there.</p>
      <div className={styles.searchWide}>
        <SearchBox />
      </div>
    </section>
  );
}

function SearchFailed({ code, retryHref }: { code: SearchErrorCode; retryHref: string }) {
  return (
    <section className={`container ${styles.message}`} role="alert">
      <ReelStar className={styles.mark} />
      <h1 className={styles.title}>{code === "rate_limited" ? "Intermission" : "The film snapped"}</h1>
      <p className={styles.text}>{publicMessageFor(code)}</p>
      <div className={styles.actions}>
        {code !== "auth" && code !== "rate_limited" && (
          <Link href={retryHref} className="btn" prefetch={false}>
            Try again
          </Link>
        )}
        <Link href="/" className="btn btn--ghost">
          New search
        </Link>
      </div>
    </section>
  );
}

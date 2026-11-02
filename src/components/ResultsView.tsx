"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type Ref } from "react";

import { filmLabel, searchHref, withExcluded } from "@/lib/search-params";
import type { FilmMatch, SearchResult, Video } from "@/lib/types";

import { ClipPlayer } from "./ClipPlayer";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { Divider, ReelStar } from "./ornaments";
import { Poster } from "./Poster";
import { RefineBox } from "./RefineBox";
import styles from "./ResultsView.module.css";
import { WatchProviders } from "./WatchProviders";

/**
 * The results page: the most likely film as the "feature presentation", the
 * other guesses as contenders, and ways to narrow things down.
 *
 * Ruling a film out ("Not it") happens instantly on the page; asking for new
 * guesses ("Keep looking", "Refine") runs a fresh search that remembers what
 * was ruled out.
 */
type Example = { label: string; prompt: string };

export function ResultsView({ result, examples = [] }: { result: SearchResult; examples?: Example[] }) {
  const { input, matches } = result;
  const [rejected, setRejected] = useState<number[]>([]);
  const [selected, setSelected] = useState(0);
  const [lastRejected, setLastRejected] = useState<FilmMatch | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const featureRef = useRef<HTMLElement>(null);

  const visible = matches.filter((m) => !rejected.includes(m.rank));
  const featured = visible.find((m) => m.rank === selected) ?? visible[0] ?? null;
  const contenders = visible.filter((m) => m !== featured);
  const ruledOutLabels = matches.filter((m) => rejected.includes(m.rank)).map((m) => filmLabel(m.title, m.year));
  const noneOfTheseHref = searchHref(withExcluded(input, matches.map((m) => filmLabel(m.title, m.year))));

  // The undo toast fades after a few seconds.
  useEffect(() => {
    if (!lastRejected) return;
    const timer = window.setTimeout(() => setLastRejected(null), 7000);
    return () => window.clearTimeout(timer);
  }, [lastRejected]);

  function screen(match: FilmMatch) {
    setSelected(match.rank);
    setAnnouncement(`Now screening ${match.title}.`);
    requestAnimationFrame(() => featureRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function reject(match: FilmMatch) {
    setRejected((r) => [...r, match.rank]);
    setLastRejected(match);
    const next = visible.find((m) => m.rank !== match.rank);
    setAnnouncement(
      next && match === featured
        ? `Ruled out ${match.title}. Now screening ${next.title}.`
        : `Ruled out ${match.title}.`,
    );
  }

  function undo() {
    if (!lastRejected) return;
    setRejected((r) => r.filter((rank) => rank !== lastRejected.rank));
    setAnnouncement(`${lastRejected.title} is back in the running.`);
    setLastRejected(null);
  }

  return (
    <div className={styles.results}>
      <Summary result={result} />

      {result.notices.length > 0 && (
        <ul className={`container ${styles.notices}`}>
          {result.notices.map((n) => (
            <li key={n} className="notice">
              {n}
            </li>
          ))}
        </ul>
      )}

      {matches.length === 0 ? (
        <Stumped result={result} examples={examples} />
      ) : featured === null ? (
        <OutOfGuesses result={result} ruledOut={ruledOutLabels} keepLookingHref={noneOfTheseHref} />
      ) : (
        <>
          <Feature
            key={featured.rank}
            ref={featureRef}
            match={featured}
            input={result.input}
            isTop={featured.rank === 0}
            onReject={() => reject(featured)}
          />

          {result.followUpQuestion && (
            <div className={`container ${styles.followUp}`}>
              <RefineBox input={input} ruledOut={ruledOutLabels} question={result.followUpQuestion} />
            </div>
          )}

          {contenders.length > 0 && (
            <section className={`container ${styles.contenders}`} aria-labelledby="contenders-title">
              <div className={styles.sectionHead}>
                <p className="eyebrow">Also in the running</p>
                <h2 id="contenders-title" className={styles.sectionTitle}>
                  Other contenders
                </h2>
                <Divider />
              </div>
              <ul className={styles.grid}>
                {contenders.map((m) => (
                  <ContenderCard key={m.rank} match={m} onScreen={() => screen(m)} onReject={() => reject(m)} />
                ))}
              </ul>
            </section>
          )}

          <section className={`container ${styles.refine}`} aria-labelledby="refine-title">
            <div className={styles.sectionHead}>
              <p className="eyebrow">Still searching?</p>
              <h2 id="refine-title" className={styles.sectionTitle}>
                Not quite right?
              </h2>
              <p className={styles.sectionLede}>
                Tell us one more thing you remember, or rule them all out and we’ll dig deeper into the archive.
              </p>
            </div>
            <div className={styles.refineRow}>
              <RefineBox input={input} ruledOut={ruledOutLabels} />
              <div className={styles.keepLooking}>
                <p className={styles.keepLookingText}>None of these?</p>
                <Link href={noneOfTheseHref} className="btn btn--ghost">
                  Keep looking
                </Link>
              </div>
            </div>
          </section>
        </>
      )}

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      {lastRejected && (
        <div className={styles.toast} role="status">
          <span>
            Ruled out <em>{lastRejected.title}</em>
          </span>
          <button type="button" onClick={undo} className={styles.toastButton}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────

function Summary({ result }: { result: SearchResult }) {
  const { input } = result;
  const showHeard =
    result.interpretation && result.interpretation.toLowerCase() !== input.description.toLowerCase();

  return (
    <section className={`container ${styles.summary}`} aria-labelledby="summary-title">
      <p id="summary-title" className="eyebrow">
        You remembered
      </p>
      <blockquote className={styles.quote}>
        <p>“{input.description}”</p>
      </blockquote>
      {(input.clues.length > 0 || input.excluded.length > 0) && (
        <ul className={styles.refinements} aria-label="Details added">
          {input.clues.map((clue) => (
            <li key={`c-${clue}`}>
              <Link
                href={searchHref({ ...input, clues: input.clues.filter((c) => c !== clue) })}
                className="chip"
                title="Remove this detail"
              >
                <span aria-hidden="true">+</span> {clue} <span className={styles.remove}>✕</span>
                <span className="visually-hidden">(remove)</span>
              </Link>
            </li>
          ))}
          {input.excluded.map((label) => (
            <li key={`x-${label}`}>
              <Link
                href={searchHref({ ...input, excluded: input.excluded.filter((e) => e !== label) })}
                className={`chip ${styles.excludedChip}`}
                title="Bring this film back"
              >
                Not <s>{label}</s> <span className={styles.remove}>✕</span>
                <span className="visually-hidden">(bring back)</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {showHeard && (
        <p className={styles.heard}>
          <span className={styles.heardLabel}>We heard</span> {result.interpretation}
        </p>
      )}
    </section>
  );
}

// ── Feature presentation ─────────────────────────────────────────────────────

type FeatureProps = {
  match: FilmMatch;
  input: SearchResult["input"];
  isTop: boolean;
  onReject: () => void;
  ref: Ref<HTMLElement>;
};

function Feature({ match, isTop, onReject, ref }: FeatureProps) {
  const videos: Video[] = [match.clip, ...match.extraVideos].filter((v): v is Video => v !== null);
  const [active, setActive] = useState(0);
  const [found, setFound] = useState(false);
  const clip = videos[active] ?? null;
  const facts = [
    match.year ? String(match.year) : null,
    match.runtime ? `${match.runtime} min` : null,
    match.genres.slice(0, 3).join(", ") || null,
  ].filter((f): f is string => Boolean(f));

  return (
    <section ref={ref} className={`container ${styles.feature}`} aria-labelledby="feature-title">
      <div className={styles.featureFrame}>
        <div className={styles.media}>
          <ClipPlayer key={clip?.youtubeId ?? "none"} clip={clip} filmTitle={match.title} searchUrl={match.clipSearchUrl} />
          {videos.length > 1 && (
            <div className={styles.reels} role="group" aria-label="Other clips">
              {videos.map((v, i) => (
                <button
                  key={v.youtubeId}
                  type="button"
                  className={`chip ${i === active ? styles.reelActive : ""}`}
                  aria-pressed={i === active}
                  onClick={() => setActive(i)}
                >
                  {v.kind === "scene" ? "The scene" : v.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.info}>
          <p className="eyebrow">{isTop ? "The feature presentation" : "Now screening"}</p>
          <h2 id="feature-title" className={styles.title}>
            {match.title}
          </h2>
          {match.originalTitle && <p className={styles.originalTitle}>{match.originalTitle}</p>}
          {facts.length > 0 && (
            <p className={`meta ${styles.facts}`}>
              {facts.map((f, i) => (
                <span key={f} className={i > 0 ? "meta-sep" : undefined}>
                  {f}
                </span>
              ))}
            </p>
          )}

          <ConfidenceMeter value={match.confidence} />

          <p className={styles.why}>{match.why}</p>

          {match.scene && (
            <p className={styles.scene}>
              <span className={styles.sceneLabel}>The scene</span>
              {match.scene}
            </p>
          )}

          {(match.matchedClues.length > 0 || match.unmatchedClues.length > 0) && (
            <ul className={styles.clues} aria-label="How your description lines up">
              {match.matchedClues.map((c) => (
                <li key={`m-${c}`} className="chip chip--match">
                  <span className="visually-hidden">Matches:</span>
                  {c}
                </li>
              ))}
              {match.unmatchedClues.map((c) => (
                <li key={`u-${c}`} className="chip chip--miss">
                  <span className="visually-hidden">Doesn’t match:</span>
                  {c}
                </li>
              ))}
            </ul>
          )}

          {(match.director || match.cast.length > 0) && (
            <dl className={styles.credits}>
              {match.director && (
                <div>
                  <dt>Directed by</dt>
                  <dd>{match.director}</dd>
                </div>
              )}
              {match.cast.length > 0 && (
                <div>
                  <dt>Starring</dt>
                  <dd>{match.cast.join(", ")}</dd>
                </div>
              )}
            </dl>
          )}

          {match.overview && <p className={styles.overview}>{match.overview}</p>}

          {match.watch && <WatchProviders watch={match.watch} compact />}

          {found ? (
            <div className={styles.found} role="status">
              <ReelStar className={styles.foundMark} />
              <div>
                <p className={styles.foundTitle}>Found it. Enjoy the show.</p>
                <p className={styles.foundLinks}>
                  {match.tmdbId && (
                    <Link href={`/movie/${match.tmdbId}`} className="link">
                      Full credits &amp; trailers
                    </Link>
                  )}
                  <a
                    href={
                      match.watch?.link ??
                      `https://www.justwatch.com/us/search?q=${encodeURIComponent(match.title)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link"
                  >
                    Where to watch ↗
                  </a>
                  <a href={match.clipSearchUrl} target="_blank" rel="noopener noreferrer" className="link">
                    More clips ↗
                  </a>
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.actions}>
              <button type="button" className="btn" onClick={() => setFound(true)}>
                That’s the one
              </button>
              <button type="button" className="btn btn--ghost" onClick={onReject}>
                Not it
              </button>
              {match.tmdbId && (
                <Link href={`/movie/${match.tmdbId}`} className={`link ${styles.detailsLink}`}>
                  Full details →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Contender card ───────────────────────────────────────────────────────────

function ContenderCard({ match, onScreen, onReject }: { match: FilmMatch; onScreen: () => void; onReject: () => void }) {
  return (
    <li className={`slab ${styles.card}`}>
      <button type="button" className={styles.cardPoster} onClick={onScreen} tabIndex={-1} aria-hidden="true">
        <Poster
          src={match.poster}
          title={match.title}
          year={match.year}
          sizes="(min-width: 1100px) 170px, (min-width: 700px) 22vw, 36vw"
        />
      </button>
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{match.title}</h3>
        <p className="meta">
          {match.year ?? "Year unknown"}
          {match.director && <span className="meta-sep">{match.director}</span>}
        </p>
        <ConfidenceMeter value={match.confidence} size="sm" />
        <p className={styles.cardWhy}>{match.why}</p>
        <div className={styles.cardActions}>
          <button type="button" className="btn btn--small" onClick={onScreen}>
            Screen this
            <span className="visually-hidden"> ({match.title})</span>
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={onReject}>
            Not it
            <span className="visually-hidden"> ({match.title})</span>
          </button>
        </div>
      </div>
    </li>
  );
}

// ── Empty states ─────────────────────────────────────────────────────────────

function Stumped({ result, examples }: { result: SearchResult; examples: Example[] }) {
  return (
    <section className={`container ${styles.stumped}`} aria-labelledby="stumped-title">
      <ReelStar className={styles.stumpedMark} />
      <h2 id="stumped-title" className={styles.sectionTitle}>
        {result.mode === "demo" ? "That one isn’t in the demo reel" : "Even our archivists are stumped"}
      </h2>
      <p className={styles.sectionLede}>
        {result.mode === "demo"
          ? "Demo mode only knows a handful of films. Try one of these, or add an Anthropic API key to search them all."
          : "We couldn’t place that one yet. Add another detail you remember: an actor, a decade, a setting, a line of dialogue."}
      </p>
      {result.mode === "demo" ? (
        <ul className={styles.examples}>
          {examples.map((p) => (
            <li key={p.label}>
              <Link href={searchHref({ description: p.prompt, clues: [], excluded: [] })} className="chip">
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.stumpedRefine}>
          <RefineBox input={result.input} />
        </div>
      )}
    </section>
  );
}

function OutOfGuesses({
  result,
  ruledOut,
  keepLookingHref,
}: {
  result: SearchResult;
  ruledOut: string[];
  keepLookingHref: string;
}) {
  return (
    <section className={`container ${styles.stumped}`} aria-labelledby="out-title">
      <ReelStar className={styles.stumpedMark} />
      <h2 id="out-title" className={styles.sectionTitle}>
        You’ve ruled out every guess
      </h2>
      <p className={styles.sectionLede}>
        We’ll search again without them. Adding one more detail you remember will help even more.
      </p>
      <div className={styles.stumpedRefine}>
        <RefineBox input={result.input} ruledOut={ruledOut} />
      </div>
      <Link href={keepLookingHref} className="btn">
        Keep looking
      </Link>
    </section>
  );
}

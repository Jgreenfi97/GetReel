import "server-only";

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { cache, Suspense } from "react";

import { getFeatures } from "@/lib/config";
import { episodeLabel, formatDate, formatRuntime, joinNames, kindLabel, plural, yearsLabel } from "@/lib/format";
import { countryNames, foreignLanguageName, langAttribute } from "@/lib/locale";
import { youtubeSearchUrl } from "@/lib/search-params";
import { getTitleDetails } from "@/lib/tmdb";
import { resolveTmdbImage } from "@/lib/tmdb-images";
import type { MediaKind, TitleDetails } from "@/lib/types";

import { Divider, ReelStar } from "./ornaments";
import { Poster } from "./Poster";
import { SiteHeader } from "./SiteHeader";
import styles from "./TitlePage.module.css";
import { VideoGallery } from "./VideoGallery";
import { WatchProviders } from "./WatchProviders";

/**
 * The detail page shared by /movie/[id] and /tv/[id]: backdrop, gilt poster,
 * credits, clips and trailers, cast in arch frames, seasons (for series) and
 * where to watch.
 */

type Loaded = { status: "ok"; details: TitleDetails } | { status: "missing" } | { status: "error" };

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 && n < 1e9 ? n : null;
}

/**
 * Load a title once per request: metadata and the page share the result, so a
 * failing TMDB call isn't made (and logged) twice.
 */
const load = cache(async (kind: MediaKind, id: string): Promise<Loaded> => {
  const tmdbId = parseId(id);
  if (tmdbId === null) return { status: "missing" };
  try {
    const details = await getTitleDetails(kind, tmdbId);
    return details ? { status: "ok", details } : { status: "missing" };
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[getreel] could not load ${kind} ${tmdbId}:`, error);
    return { status: "error" };
  }
});

export async function titleMetadata(kind: MediaKind, params: Promise<{ id: string }>): Promise<Metadata> {
  const { id } = await params;
  const fallback = { title: kind === "tv" ? "TV series" : "Film" };
  if (!getFeatures().tmdb) return fallback;
  const loaded = await load(kind, id);
  if (loaded.status !== "ok") return fallback;
  const t = loaded.details;
  const years = yearsLabel(t);
  const title = years ? `${t.title} (${years})` : t.title;
  const image = t.backdrop ? resolveTmdbImage(t.backdrop, 1280) : null;
  return {
    title,
    description: t.overview ?? undefined,
    openGraph: { title, description: t.overview ?? undefined, images: image ? [{ url: image }] : undefined },
  };
}

/** The route body: static header now, details streamed in. */
export function TitleRoute({ kind, params }: { kind: MediaKind; params: Promise<{ id: string }> }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="page">
        <Suspense fallback={<TitleSkeleton />}>
          <TitleContent kind={kind} params={params} />
        </Suspense>
      </main>
    </>
  );
}

async function TitleContent({ kind, params }: { kind: MediaKind; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (parseId(id) === null) notFound();
  if (!getFeatures().tmdb) return <NeedsTmdb />;
  const loaded = await load(kind, id);
  if (loaded.status === "missing") notFound();
  if (loaded.status === "error") return <Unavailable />;
  return <TitleDetailsView t={loaded.details} />;
}

function TitleDetailsView({ t }: { t: TitleDetails }) {
  const tv = t.kind === "tv";
  const facts = [
    yearsLabel(t),
    t.certification,
    tv
      ? [t.seasonCount ? plural(t.seasonCount, "season") : null, t.episodeCount ? plural(t.episodeCount, "episode") : null]
          .filter(Boolean)
          .join(", ") || null
      : t.runtime
        ? formatRuntime(t.runtime)
        : null,
    t.rating ? `★ ${t.rating.toFixed(1)}` : null,
  ].filter((f): f is string => Boolean(f));
  const makers = tv ? t.creators : t.directors;
  const premiered = formatDate(t.releaseDate);
  const language = foreignLanguageName(t.originalLanguage);
  const countries = countryNames(t.originCountries);
  const searchUrl = youtubeSearchUrl(`${t.title} ${t.year ?? ""} official trailer`);
  const statusNote =
    tv && t.status && t.status !== "Returning Series" ? t.status : tv && t.ongoing ? "Still airing" : null;

  return (
    <article className={styles.film}>
      <header className={styles.hero}>
        {t.backdrop && (
          <div className={styles.backdrop} aria-hidden="true">
            <Image src={t.backdrop} alt="" fill sizes="100vw" preload className={styles.backdropImage} />
          </div>
        )}
        <div className={`container ${styles.heroInner}`}>
          <div className={styles.poster}>
            <Poster src={t.poster} title={t.title} year={t.year} sizes="(min-width: 900px) 300px, 50vw" preload />
          </div>
          <div className={styles.heading}>
            <p className="eyebrow">From the archive · {kindLabel(t.kind)}</p>
            <h1 className={styles.title}>{t.title}</h1>
            {t.originalTitle && (
              <p className={styles.originalTitle} lang={langAttribute(t.originalLanguage) ?? undefined}>
                {t.originalTitle}
              </p>
            )}
            {t.tagline && <p className={styles.tagline}>“{t.tagline}”</p>}
            {facts.length > 0 && (
              <p className={`meta ${styles.facts}`}>
                {facts.map((f, i) => (
                  <span key={`${i}-${f}`} className={i > 0 ? "meta-sep" : undefined}>
                    {f}
                  </span>
                ))}
              </p>
            )}
            {t.genres.length > 0 && (
              <ul className={styles.genres}>
                {t.genres.map((g) => (
                  <li key={g} className="chip">
                    {g}
                  </li>
                ))}
              </ul>
            )}
            <dl className={styles.crew}>
              {makers.length > 0 && (
                <div>
                  <dt>{tv ? "Created by" : "Directed by"}</dt>
                  <dd>{joinNames(makers.map((m) => m.name))}</dd>
                </div>
              )}
              {t.writers.length > 0 && (
                <div>
                  <dt>Written by</dt>
                  <dd>{t.writers.map((w) => w.name).join(", ")}</dd>
                </div>
              )}
              {tv && t.networks.length > 0 && (
                <div>
                  <dt>Network</dt>
                  <dd>{t.networks.join(", ")}</dd>
                </div>
              )}
              {premiered && (
                <div>
                  <dt>{tv ? "First aired" : "Released"}</dt>
                  <dd>{premiered}</dd>
                </div>
              )}
              {statusNote && (
                <div>
                  <dt>Status</dt>
                  <dd>{statusNote}</dd>
                </div>
              )}
              {(language || countries.length > 0) && (
                <div>
                  <dt>Origin</dt>
                  <dd>{[language, countries.join(", ")].filter(Boolean).join(" · ")}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </header>

      <div className={`container ${styles.body}`}>
        {t.overview && (
          <section className={styles.overview} aria-label="Synopsis">
            <p>{t.overview}</p>
          </section>
        )}

        <section className={styles.section} aria-labelledby="screen-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">The screening room</p>
            <h2 id="screen-title" className={styles.sectionTitle}>
              Clips &amp; trailers
            </h2>
            <Divider />
          </div>
          <div className={styles.screen}>
            <VideoGallery videos={t.videos.slice(0, 8)} filmTitle={t.title} searchUrl={searchUrl} />
          </div>
        </section>

        {tv && t.seasons.length > 0 && (
          <section className={styles.section} aria-labelledby="seasons-title">
            <div className={styles.sectionHead}>
              <p className="eyebrow">{plural(t.seasons.length, "season")}</p>
              <h2 id="seasons-title" className={styles.sectionTitle}>
                The seasons
              </h2>
              <Divider />
            </div>
            <ul className={styles.seasons}>
              {t.seasons.slice(0, 24).map((s) => (
                <li key={s.number} className={styles.season}>
                  <Poster src={s.poster} title={s.name} year={s.year} sizes="160px" />
                  <p className={styles.seasonName}>{s.name}</p>
                  <p className={styles.seasonMeta}>
                    {[s.year, s.episodeCount ? plural(s.episodeCount, "episode") : null].filter(Boolean).join(" · ") ||
                      episodeLabel({ season: s.number, episode: null })}
                  </p>
                </li>
              ))}
            </ul>
            {t.seasons.length > 24 && (
              <p className={styles.seasonsMore}>…and {plural(t.seasons.length - 24, "more season")}.</p>
            )}
          </section>
        )}

        {t.cast.length > 0 && (
          <section className={styles.section} aria-labelledby="cast-title">
            <div className={styles.sectionHead}>
              <p className="eyebrow">Starring</p>
              <h2 id="cast-title" className={styles.sectionTitle}>
                The cast
              </h2>
              <Divider />
            </div>
            <ul className={styles.cast}>
              {t.cast.map((person) => (
                <li key={`${person.id}-${person.role}`} className={styles.castMember}>
                  <div className={styles.portrait}>
                    {person.photo ? (
                      <Image src={person.photo} alt="" fill sizes="160px" className={styles.portraitImage} />
                    ) : (
                      <ReelStar className={styles.portraitMark} />
                    )}
                  </div>
                  <p className={styles.castName}>{person.name}</p>
                  {person.role && <p className={styles.castRole}>{person.role}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {t.watch && (
          <section className={styles.watch}>
            <WatchProviders watch={t.watch} />
          </section>
        )}

        <nav className={styles.links} aria-label="Elsewhere">
          {t.imdbId && (
            <a href={`https://www.imdb.com/title/${t.imdbId}/`} target="_blank" rel="noopener noreferrer" className="link">
              IMDb ↗
            </a>
          )}
          <a
            href={`https://www.themoviedb.org/${t.kind}/${t.tmdbId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            TMDB ↗
          </a>
          {t.homepage && (
            <a href={t.homepage} target="_blank" rel="noopener noreferrer" className="link">
              Official site ↗
            </a>
          )}
          <Link href="/" className="link">
            Search for something else
          </Link>
        </nav>
      </div>
    </article>
  );
}

function TitleSkeleton() {
  return (
    <div className={`container ${styles.skeleton}`} role="status">
      <ReelStar className={styles.skeletonMark} />
      <p className="eyebrow">Pulling the reel from the archive…</p>
    </div>
  );
}

function NeedsTmdb() {
  return (
    <section className={`container ${styles.needs}`}>
      <ReelStar className={styles.skeletonMark} />
      <h1 className={styles.sectionTitle}>Detail pages need a TMDB key</h1>
      <p>
        Full credits, trailers, seasons and where-to-watch come from The Movie Database. Add a free{" "}
        <code>TMDB_API_KEY</code> to switch them on.
      </p>
      <Link href="/about#setup" className="btn">
        Setup guide
      </Link>
    </section>
  );
}

function Unavailable() {
  return (
    <section className={`container ${styles.needs}`} role="alert">
      <ReelStar className={styles.skeletonMark} />
      <h1 className={styles.sectionTitle}>The archive is out of reach</h1>
      <p>We couldn’t load this title just now. Please try again in a moment.</p>
      <Link href="/" className="btn btn--ghost">
        Back to the lobby
      </Link>
    </section>
  );
}

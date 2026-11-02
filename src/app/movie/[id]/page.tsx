import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import { Divider, ReelStar } from "@/components/ornaments";
import { Poster } from "@/components/Poster";
import { SiteHeader } from "@/components/SiteHeader";
import { VideoGallery } from "@/components/VideoGallery";
import { WatchProviders } from "@/components/WatchProviders";
import { getFeatures } from "@/lib/config";
import { youtubeSearchUrl } from "@/lib/search-params";
import { getMovieDetails } from "@/lib/tmdb";
import { resolveTmdbImage } from "@/lib/tmdb-images";
import type { FilmDetails } from "@/lib/types";

import styles from "./movie.module.css";

type Props = PageProps<"/movie/[id]">;

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 && n < 1e9 ? n : null;
}

async function load(id: string): Promise<FilmDetails | null> {
  const tmdbId = parseId(id);
  if (tmdbId === null || !getFeatures().tmdb) return null;
  try {
    return await getMovieDetails(tmdbId);
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[getreel] could not load film ${tmdbId}:`, error);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const film = await load(id);
  if (!film) return { title: "Film" };
  const title = film.year ? `${film.title} (${film.year})` : film.title;
  const image = film.backdrop ? resolveTmdbImage(film.backdrop, 1280) : null;
  return {
    title,
    description: film.overview ?? undefined,
    openGraph: { title, description: film.overview ?? undefined, images: image ? [{ url: image }] : undefined },
  };
}

export default function MoviePage({ params }: Props) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="page">
        <Suspense fallback={<MovieSkeleton />}>
          <Movie params={params} />
        </Suspense>
      </main>
    </>
  );
}

async function Movie({ params }: Pick<Props, "params">) {
  const { id } = await params;
  if (parseId(id) === null) notFound();
  if (!getFeatures().tmdb) return <NeedsTmdb />;
  const film = await load(id);
  if (!film) notFound();
  return <FilmPage film={film} />;
}

function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

function formatDate(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function FilmPage({ film }: { film: FilmDetails }) {
  const facts = [
    film.year ? String(film.year) : null,
    film.certification,
    film.runtime ? formatRuntime(film.runtime) : null,
    film.rating ? `★ ${film.rating.toFixed(1)}` : null,
  ].filter((f): f is string => Boolean(f));
  const released = formatDate(film.releaseDate);
  const searchUrl = youtubeSearchUrl(`${film.title} ${film.year ?? ""} official trailer`);

  return (
    <article className={styles.film}>
      <header className={styles.hero}>
        {film.backdrop && (
          <div className={styles.backdrop} aria-hidden="true">
            <Image src={film.backdrop} alt="" fill sizes="100vw" preload className={styles.backdropImage} />
          </div>
        )}
        <div className={`container ${styles.heroInner}`}>
          <div className={styles.poster}>
            <Poster src={film.poster} title={film.title} year={film.year} sizes="(min-width: 900px) 300px, 50vw" preload />
          </div>
          <div className={styles.heading}>
            <p className="eyebrow">From the archive</p>
            <h1 className={styles.title}>{film.title}</h1>
            {film.originalTitle && <p className={styles.originalTitle}>{film.originalTitle}</p>}
            {film.tagline && <p className={styles.tagline}>“{film.tagline}”</p>}
            {facts.length > 0 && (
              <p className={`meta ${styles.facts}`}>
                {facts.map((f, i) => (
                  <span key={f} className={i > 0 ? "meta-sep" : undefined}>
                    {f}
                  </span>
                ))}
              </p>
            )}
            {film.genres.length > 0 && (
              <ul className={styles.genres}>
                {film.genres.map((g) => (
                  <li key={g} className="chip">
                    {g}
                  </li>
                ))}
              </ul>
            )}
            <dl className={styles.crew}>
              {film.directors.length > 0 && (
                <div>
                  <dt>Directed by</dt>
                  <dd>{film.directors.map((d) => d.name).join(", ")}</dd>
                </div>
              )}
              {film.writers.length > 0 && (
                <div>
                  <dt>Written by</dt>
                  <dd>{film.writers.map((w) => w.name).join(", ")}</dd>
                </div>
              )}
              {released && (
                <div>
                  <dt>Released</dt>
                  <dd>{released}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </header>

      <div className={`container ${styles.body}`}>
        {film.overview && (
          <section className={styles.overview} aria-label="Synopsis">
            <p>{film.overview}</p>
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
            <VideoGallery videos={film.videos.slice(0, 8)} filmTitle={film.title} searchUrl={searchUrl} />
          </div>
        </section>

        {film.cast.length > 0 && (
          <section className={styles.section} aria-labelledby="cast-title">
            <div className={styles.sectionHead}>
              <p className="eyebrow">Starring</p>
              <h2 id="cast-title" className={styles.sectionTitle}>
                The cast
              </h2>
              <Divider />
            </div>
            <ul className={styles.cast}>
              {film.cast.map((person) => (
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

        {film.watch && (
          <section className={styles.watch}>
            <WatchProviders watch={film.watch} />
          </section>
        )}

        <nav className={styles.links} aria-label="Elsewhere">
          {film.imdbId && (
            <a href={`https://www.imdb.com/title/${film.imdbId}/`} target="_blank" rel="noopener noreferrer" className="link">
              IMDb ↗
            </a>
          )}
          <a href={`https://www.themoviedb.org/movie/${film.tmdbId}`} target="_blank" rel="noopener noreferrer" className="link">
            TMDB ↗
          </a>
          {film.homepage && (
            <a href={film.homepage} target="_blank" rel="noopener noreferrer" className="link">
              Official site ↗
            </a>
          )}
          <Link href="/" className="link">
            Search for another film
          </Link>
        </nav>
      </div>
    </article>
  );
}

function MovieSkeleton() {
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
      <h1 className={styles.sectionTitle}>Film pages need a TMDB key</h1>
      <p>
        Full credits, trailers and where-to-watch come from The Movie Database. Add a free <code>TMDB_API_KEY</code> to
        switch them on.
      </p>
      <Link href="/about#setup" className="btn">
        Setup guide
      </Link>
    </section>
  );
}

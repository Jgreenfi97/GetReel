import type { Metadata } from "next";
import Link from "next/link";

import { Divider, Khatam, StarNumeral } from "@/components/ornaments";
import { SiteHeader } from "@/components/SiteHeader";
import { getFeatures } from "@/lib/config";

import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "About",
  description: "How GetReel finds the films you half-remember, and how to switch on live search.",
};

const SERVICES = [
  {
    key: "claude" as const,
    name: "Claude (Anthropic)",
    role: "Works out which film you’re describing",
    env: "ANTHROPIC_API_KEY",
    where: "platform.claude.com → API keys",
    href: "https://platform.claude.com/settings/keys",
    cost: "Pay as you go",
  },
  {
    key: "tmdb" as const,
    name: "The Movie Database",
    role: "Posters, cast, trailers and where to watch",
    env: "TMDB_API_KEY",
    where: "themoviedb.org → Settings → API",
    href: "https://www.themoviedb.org/settings/api",
    cost: "Free for non-commercial use",
  },
  {
    key: "youtube" as const,
    name: "YouTube Data API",
    role: "Finds the exact scene you described",
    env: "YOUTUBE_API_KEY",
    where: "Google Cloud Console → YouTube Data API v3",
    href: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
    cost: "Free (about 100 searches a day)",
  },
];

export default function AboutPage() {
  const features = getFeatures();
  return (
    <>
      <SiteHeader />
      <main id="main" className={`page container ${styles.about}`}>
        <header className={styles.header}>
          <p className="eyebrow">About GetReel</p>
          <h1 className={styles.title}>A search engine for the films you can’t quite name</h1>
          <p className="lede">
            You remember the feeling, a face, a single image, but not the title. GetReel works from whatever you have and
            brings back the film and the scene.
          </p>
          <Divider />
        </header>

        <section className={styles.section} aria-labelledby="pipeline-title">
          <h2 id="pipeline-title" className={styles.sectionTitle}>
            What happens when you search
          </h2>
          <ol className={styles.pipeline}>
            <li>
              <StarNumeral numeral="I" />
              <div>
                <h3>The archivist reads your description</h3>
                <p>
                  Claude, an AI model by Anthropic, weighs your clues the way a film buff would: distinctive details count
                  for more than generic ones, and it expects memory to be a little wrong. It returns up to five likely
                  films, each with a confidence score and its reasons.
                </p>
              </div>
            </li>
            <li>
              <StarNumeral numeral="II" />
              <div>
                <h3>Each guess is checked against the record</h3>
                <p>
                  Every candidate is matched to The Movie Database to confirm the title and year and fetch the poster,
                  cast, trailers and streaming options.
                </p>
              </div>
            </li>
            <li>
              <StarNumeral numeral="III" />
              <div>
                <h3>The projector finds your scene</h3>
                <p>
                  For the top match we search YouTube for the moment you described. Otherwise you get the official clip
                  or trailer. Rule films out or add a detail, and the search picks up where it left off.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section id="setup" className={styles.section} aria-labelledby="setup-title">
          <h2 id="setup-title" className={styles.sectionTitle}>
            Switching on live search
          </h2>
          <p className={styles.text}>
            Without keys, GetReel runs in demo mode with a few hand-picked examples. Add these as environment variables
            (in <code>.env.local</code> on your computer, or in your hosting provider’s settings) and restart.
          </p>
          <ul className={styles.services}>
            {SERVICES.map((s) => (
              <li key={s.key} className={`slab ${styles.service}`}>
                <div className={styles.serviceHead}>
                  <h3>{s.name}</h3>
                  <span className={features[s.key] ? styles.on : styles.off}>
                    {features[s.key] ? "Connected" : "Not set"}
                  </span>
                </div>
                <p className={styles.role}>{s.role}</p>
                <p className={styles.env}>
                  <code>{s.env}</code>
                </p>
                <p className={styles.where}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="link">
                    {s.where}
                  </a>
                  <span className={styles.cost}>{s.cost}</span>
                </p>
              </li>
            ))}
          </ul>
          <p className={styles.text}>
            Only Claude is needed for real searches; TMDB and YouTube add pictures and clips. The project’s README has
            step-by-step instructions.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="privacy-title">
          <h2 id="privacy-title" className={styles.sectionTitle}>
            Privacy
          </h2>
          <p className={styles.text}>
            What you type is sent to Anthropic to identify the film and is not stored by GetReel beyond a short-lived
            cache that makes repeat searches instant. Clips are loaded from YouTube only when you press play.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="credits-title">
          <h2 id="credits-title" className={styles.sectionTitle}>
            Credits
          </h2>
          <ul className={styles.credits}>
            <li>
              <Khatam size={12} /> Film data and images from TMDB. This product uses the TMDB API but is not endorsed or
              certified by TMDB.
            </li>
            <li>
              <Khatam size={12} /> Where-to-watch listings are provided by JustWatch.
            </li>
            <li>
              <Khatam size={12} /> Clips and trailers play from YouTube.
            </li>
            <li>
              <Khatam size={12} /> Film identification by Claude, from Anthropic.
            </li>
          </ul>
          <p>
            <Link href="/" className="btn">
              Start a search
            </Link>
          </p>
        </section>
      </main>
    </>
  );
}

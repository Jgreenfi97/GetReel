import Image from "next/image";

import type { WatchOptions, WatchProvider } from "@/lib/types";

import styles from "./WatchProviders.module.css";

function Row({ label, providers }: { label: string; providers: WatchProvider[] }) {
  if (providers.length === 0) return null;
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <ul className={styles.list}>
        {providers.map((p) => (
          <li key={p.id} className={styles.provider} title={p.name}>
            {p.logo ? (
              <Image src={p.logo} alt={p.name} width={36} height={36} className={styles.logo} />
            ) : (
              <span className={styles.name}>{p.name}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Streaming, rental and purchase options for the visitor's region (JustWatch data via TMDB). */
export function WatchProviders({ watch, compact = false }: { watch: WatchOptions; compact?: boolean }) {
  return (
    <section className={`${styles.watch} ${compact ? styles.compact : ""}`} aria-label="Where to watch">
      <p className={styles.heading}>
        <span className="eyebrow">Where to watch</span>
        <span className={styles.region}>{watch.region}</span>
      </p>
      <Row label="Stream" providers={watch.stream} />
      <Row label="Rent" providers={watch.rent} />
      {!compact && <Row label="Buy" providers={watch.buy} />}
      <p className={styles.attribution}>
        {watch.link ? (
          <a href={watch.link} target="_blank" rel="noopener noreferrer" className="link">
            All options
          </a>
        ) : null}{" "}
        · Listings by JustWatch
      </p>
    </section>
  );
}

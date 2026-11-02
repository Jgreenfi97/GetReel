import styles from "./ConfidenceMeter.module.css";

/** Words alongside the number, so the meter never relies on the bar alone. */
export function confidenceLabel(value: number): string {
  if (value >= 85) return "Almost certainly";
  if (value >= 60) return "Very likely";
  if (value >= 35) return "Possibly";
  if (value >= 12) return "A long shot";
  return "Outside chance";
}

/**
 * How sure we are about a match: a thin gold fill on a pale-gold track (one
 * ramp), with the value and a plain-language label printed in ink.
 */
export function ConfidenceMeter({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const label = confidenceLabel(pct);
  return (
    <div className={`${styles.meter} ${styles[size]}`}>
      <div className={styles.text}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{pct}% match</span>
      </div>
      <div
        className={styles.track}
        role="meter"
        aria-label="Match confidence"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%, ${label.toLowerCase()}`}
      >
        <div className={styles.fill} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

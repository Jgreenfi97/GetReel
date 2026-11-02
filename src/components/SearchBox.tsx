"use client";

import Form from "next/form";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { LIMITS } from "@/lib/search-params";

import styles from "./SearchBox.module.css";

const PLACEHOLDERS = [
  "The one where a man befriends a volleyball on a desert island…",
  "The sitcom episode where they carry a couch up the stairs yelling ‘pivot’…",
  "A black-and-white film where a husband makes his wife think she’s going mad…",
  "A Korean show with deadly children’s games and green tracksuits…",
  "A bus that will explode if it drops below fifty miles an hour…",
  "A Spanish heist series with red jumpsuits and Dalí masks…",
  "An old musical where a man dances in the rain with an umbrella…",
];

type SearchBoxProps = {
  defaultValue?: string;
  variant?: "hero" | "compact";
  autoFocus?: boolean;
};

/**
 * The main search field. It is a plain GET form to /search, so it works even
 * before JavaScript loads; with JavaScript, next/form turns it into an instant
 * client-side navigation.
 */
export function SearchBox({ defaultValue = "", variant = "hero", autoFocus = false }: SearchBoxProps) {
  const [value, setValue] = useState(defaultValue);
  const [placeholder, setPlaceholder] = useState(0);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const hero = variant === "hero";

  // Grow the textarea with its content.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, hero ? 240 : 160)}px`;
  }, [value, hero]);

  // Cycle example descriptions while the field is empty and idle.
  useEffect(() => {
    if (!hero || value || focused) return;
    const timer = window.setInterval(() => setPlaceholder((p) => (p + 1) % PLACEHOLDERS.length), 4200);
    return () => window.clearInterval(timer);
  }, [hero, value, focused]);

  function validate(event: FormEvent<HTMLFormElement>) {
    if (value.trim().length < LIMITS.minDescription) {
      event.preventDefault();
      setError("Describe it in a few words first: a scene, a line, an actor, a feeling.");
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter searches; Shift+Enter adds a new line.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const remaining = LIMITS.description - value.length;

  return (
    <Form action="/search" onSubmit={validate} className={`${styles.form} ${hero ? styles.hero : styles.compact}`}>
      <label htmlFor={`${id}-q`} className="visually-hidden">
        Describe the film or show you’re trying to remember
      </label>
      <div className={styles.field}>
        <textarea
          ref={textareaRef}
          id={`${id}-q`}
          name="q"
          rows={hero ? 3 : 1}
          value={value}
          maxLength={LIMITS.description}
          placeholder={hero ? PLACEHOLDERS[placeholder] : "Describe another film or show…"}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck
          aria-describedby={error ? `${id}-error` : hero ? `${id}-hint` : undefined}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          className={styles.textarea}
        />
        <button type="submit" className={`btn ${styles.submit}`} aria-label={hero ? undefined : "Search"}>
          <span>{hero ? "Search the archive" : "Search"}</span>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>
      {hero && (
        <div className={styles.footer}>
          <p id={`${id}-hint`} className={styles.hint}>
            <kbd>Enter</kbd> to search · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
          </p>
          {remaining < 200 && (
            <p className={styles.count} aria-live="polite">
              {remaining} characters left
            </p>
          )}
        </div>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </Form>
  );
}

"use client";

import Form from "next/form";
import { useId, useState, type FormEvent } from "react";

import { LIMITS } from "@/lib/search-params";
import type { SearchInput } from "@/lib/types";

import styles from "./RefineBox.module.css";

type RefineBoxProps = {
  input: SearchInput;
  /** Titles ruled out on this page that should stay ruled out. */
  ruledOut?: string[];
  /** A question from the archivist; the answer is sent along with it. */
  question?: string | null;
  title?: string;
  placeholder?: string;
};

/**
 * Adds one more remembered detail to the current search. Everything already
 * known (the description, earlier clues, ruled-out films) rides along as
 * hidden fields, so the new search builds on the old one.
 */
export function RefineBox({ input, ruledOut = [], question, title, placeholder }: RefineBoxProps) {
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState(false);
  const id = useId();
  const clue = question ? `${question} ${answer.trim()}` : answer.trim();
  const excluded = Array.from(new Set([...input.excluded, ...ruledOut]));

  function validate(event: FormEvent<HTMLFormElement>) {
    if (answer.trim().length === 0) {
      event.preventDefault();
      setError(true);
    }
  }

  return (
    <Form action="/search" onSubmit={validate} className={`${styles.box} ${question ? styles.question : ""}`}>
      <input type="hidden" name="q" value={input.description} />
      {input.clues.map((c, i) => (
        <input key={`c${i}`} type="hidden" name="more" value={c} />
      ))}
      <input type="hidden" name="more" value={clue} />
      {excluded.map((label, i) => (
        <input key={`x${i}`} type="hidden" name="not" value={label} />
      ))}

      <label htmlFor={`${id}-a`} className={styles.label}>
        {question ? (
          <>
            <span className="eyebrow">One question to narrow it down</span>
            <span className={styles.questionText}>{question}</span>
          </>
        ) : (
          <span className="eyebrow">{title ?? "Add a detail"}</span>
        )}
      </label>
      <div className={styles.row}>
        <input
          id={`${id}-a`}
          type="text"
          value={answer}
          maxLength={Math.max(60, LIMITS.clue - (question?.length ?? 0) - 1)}
          placeholder={placeholder ?? (question ? "Your answer…" : "e.g. “it was animated”, “late 90s”, “set in Paris”")}
          onChange={(e) => {
            setAnswer(e.target.value);
            setError(false);
          }}
          aria-invalid={error || undefined}
          className={styles.input}
          autoComplete="off"
        />
        <button type="submit" className="btn btn--small">
          Refine
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          Type a detail first.
        </p>
      )}
    </Form>
  );
}

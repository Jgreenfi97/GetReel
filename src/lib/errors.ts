/**
 * Errors that are expected during normal operation and safe to show people.
 * Anything else is logged on the server and shown as a generic failure.
 */

export type SearchErrorCode =
  | "invalid_input"
  | "rate_limited"
  | "refused"
  | "auth"
  | "busy"
  | "network"
  | "unknown";

const MESSAGES: Record<SearchErrorCode, string> = {
  invalid_input: "Tell us a little more. A few words about the film or show is enough to start.",
  rate_limited: "You've run a lot of searches in a short time. Take a breather and try again in a few minutes.",
  refused: "Our archivist couldn't help with that description. Try describing it a different way.",
  auth: "The search service isn't configured correctly (the API key was rejected).",
  busy: "The archive is very busy right now. Please try again in a moment.",
  network: "We couldn't reach the archive. Check your connection and try again.",
  unknown: "Something went wrong while searching. Please try again.",
};

const STATUS: Record<SearchErrorCode, number> = {
  invalid_input: 400,
  rate_limited: 429,
  refused: 422,
  auth: 500,
  busy: 503,
  network: 502,
  unknown: 500,
};

export class SearchError extends Error {
  readonly code: SearchErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: SearchErrorCode, detail?: string, retryAfterSeconds?: number) {
    super(detail ?? MESSAGES[code]);
    this.name = "SearchError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** Message that is safe to show to the person searching. */
  get publicMessage(): string {
    return MESSAGES[this.code];
  }

  get status(): number {
    return STATUS[this.code];
  }
}

export function publicMessageFor(code: SearchErrorCode): string {
  return MESSAGES[code];
}

export function isSearchError(error: unknown): error is SearchError {
  return error instanceof SearchError;
}

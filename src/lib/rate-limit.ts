/**
 * A small fixed-window rate limiter, kept in memory.
 *
 * Good enough to stop one visitor from running up a large Claude bill on a
 * single server. On serverless hosts each instance keeps its own counts, so
 * for a busy public site swap this for a shared store (e.g. Upstash Redis).
 */

type Window = { count: number; resetAt: number };

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export class RateLimiter {
  private windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  check(key: string, now: number = Date.now()): RateLimitResult {
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
      this.prune(now);
    }
    window.count += 1;
    const ok = window.count <= this.limit;
    return {
      ok,
      remaining: Math.max(0, this.limit - window.count),
      retryAfterSeconds: ok ? 0 : Math.ceil((window.resetAt - now) / 1000),
    };
  }

  private prune(now: number) {
    if (this.windows.size <= this.maxKeys) return;
    for (const [key, w] of this.windows) {
      if (w.resetAt <= now) this.windows.delete(key);
    }
    // Still too many: drop the oldest entries.
    while (this.windows.size > this.maxKeys) {
      const oldest = this.windows.keys().next().value;
      if (oldest === undefined) break;
      this.windows.delete(oldest);
    }
  }
}

/** Best-effort client identifier from proxy headers. */
export function clientKey(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "anonymous";
}

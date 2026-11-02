import { describe, expect, it } from "vitest";

import { DEMO_CASES, demoExtras, demoIdentify, findDemoCase } from "@/lib/demo";
import { clientKey, RateLimiter } from "@/lib/rate-limit";
import { decodeEntities, pickYouTubeResult } from "@/lib/youtube-core";

describe("YouTube results", () => {
  it("decodes HTML entities in titles", () => {
    expect(decodeEntities("Don&#39;t &amp; &quot;Won&#x27;t&quot; &#8212; ok")).toBe(`Don't & "Won&#x27;t" — ok`);
  });

  it("prefers a clip that names the film and skips reaction videos", () => {
    const items = [
      { id: { videoId: "react" }, snippet: { title: "Cast Away REACTION!!", channelTitle: "Some Guy" } },
      { id: { videoId: "other" }, snippet: { title: "Volleyball highlights", channelTitle: "Sports" } },
      { id: { videoId: "clip" }, snippet: { title: "Cast Away (2000) - Wilson! Scene | Movieclips", channelTitle: "Movieclips" } },
    ];
    expect(pickYouTubeResult(items, "Cast Away")?.youtubeId).toBe("clip");
  });

  it("ignores live streams and items without ids", () => {
    const items = [
      { id: {}, snippet: { title: "Cast Away" } },
      { id: { videoId: "live" }, snippet: { title: "Cast Away live", liveBroadcastContent: "live" } },
    ];
    expect(pickYouTubeResult(items, "Cast Away")).toBeNull();
  });
});

describe("demo mode", () => {
  it("answers every example prompt with a confident top match", () => {
    for (const demo of DEMO_CASES) {
      const result = demoIdentify({ description: demo.prompt, clues: [], excluded: [] });
      expect(result.candidates.length).toBeGreaterThan(1);
      expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(70);
      expect(demoExtras(result.candidates[0].title, result.candidates[0].year)).not.toBeNull();
    }
  });

  it("recognises a paraphrase by its keywords", () => {
    expect(findDemoCase({ description: "that movie with tom hanks and the volleyball", clues: [], excluded: [] })?.label).toBe(
      "The volleyball friend",
    );
  });

  it("returns no guesses for unrelated descriptions", () => {
    expect(demoIdentify({ description: "a cowboy on a horse", clues: [], excluded: [] }).candidates).toEqual([]);
  });

  it("honours ruled-out films", () => {
    const prompt = DEMO_CASES.find((d) => d.label === "Rival magicians")!.prompt;
    const result = demoIdentify({ description: prompt, clues: [], excluded: ["The Prestige (2006)"] });
    expect(result.candidates[0].title).toBe("The Illusionist");
  });
});

describe("RateLimiter", () => {
  it("allows the limit, then blocks until the window resets", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.check("a", 0).ok).toBe(true);
    expect(limiter.check("a", 10).ok).toBe(true);
    const blocked = limiter.check("a", 20);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(limiter.check("b", 20).ok).toBe(true);
    expect(limiter.check("a", 1001).ok).toBe(true);
  });

  it("evicts old keys when full", () => {
    const limiter = new RateLimiter(1, 1000, 2);
    limiter.check("a", 0);
    limiter.check("b", 0);
    limiter.check("c", 0);
    // "a" was evicted, so it gets a fresh window.
    expect(limiter.check("a", 1).ok).toBe(true);
  });

  it("reads the client address from proxy headers", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientKey(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientKey(new Headers())).toBe("anonymous");
  });
});

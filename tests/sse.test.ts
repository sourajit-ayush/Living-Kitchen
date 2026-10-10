import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/ratelimit";
import { parseSseFrame } from "@/lib/sseClient";

describe("parseSseFrame", () => {
  it("parses an event frame", () => {
    expect(parseSseFrame('event: progress\ndata: {"type":"progress","value":0.5}')).toEqual({
      type: "progress",
      value: 0.5,
    });
  });

  it("ignores comments, blanks and bad JSON", () => {
    expect(parseSseFrame(": keep-alive")).toBeNull();
    expect(parseSseFrame("")).toBeNull();
    expect(parseSseFrame("data: {nope")).toBeNull();
  });
});

describe("rate limiter", () => {
  it("allows `limit` hits per window, then blocks with a retry-after", () => {
    const check = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(check("ip", 0).ok).toBe(true);
    expect(check("ip", 100).ok).toBe(true);
    const blocked = check("ip", 200);
    expect(blocked).toMatchObject({ ok: false, retryAfterSec: 1 });
    expect(check("other-ip", 200).ok).toBe(true);
    expect(check("ip", 1001).ok).toBe(true);
  });
});

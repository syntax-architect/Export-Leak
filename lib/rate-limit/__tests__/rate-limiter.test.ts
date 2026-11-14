import { describe, expect, it } from "vitest";
import {
  checkRateLimit,
  createRateLimitResponse,
  enforceRateLimit,
  getClientIp,
  getRateLimitHeaders,
  RATE_LIMIT_PRESETS,
} from "@/lib/rate-limit/memory-rate-limiter";

describe("Industry-standard rate limiting system", () => {
  it("tracks and decrements remaining quota within the window", () => {
    const testIp = `192.0.2.${Math.floor(Math.random() * 250) + 1}`;
    const action = `test_action_${Date.now()}`;

    const r1 = checkRateLimit(testIp, action, 3, 60);
    expect(r1.allowed).toBe(true);
    expect(r1.limit).toBe(3);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit(testIp, action, 3, 60);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit(testIp, action, 3, 60);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // 4th request exceeds limit
    const r4 = checkRateLimit(testIp, action, 3, 60);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.resetSeconds).toBeGreaterThan(0);
    expect(r4.friendlyMessage).toContain("reached the limit");
  });

  it("produces standard IETF, legacy X-, and Retry-After headers", () => {
    const allowed = {
      allowed: true,
      limit: 100,
      remaining: 95,
      resetSeconds: 60,
    };
    const allowedHeaders = getRateLimitHeaders(allowed);
    expect(allowedHeaders["RateLimit-Limit"]).toBe("100");
    expect(allowedHeaders["RateLimit-Remaining"]).toBe("95");
    expect(allowedHeaders["RateLimit-Reset"]).toBe("60");
    expect(allowedHeaders["X-RateLimit-Limit"]).toBe("100");
    expect(allowedHeaders["Retry-After"]).toBeUndefined();

    const blocked = {
      allowed: false,
      limit: 100,
      remaining: 0,
      resetSeconds: 42,
      friendlyMessage: "Slow down",
    };
    const blockedHeaders = getRateLimitHeaders(blocked);
    expect(blockedHeaders["RateLimit-Remaining"]).toBe("0");
    expect(blockedHeaders["Retry-After"]).toBe("42");
    expect(blockedHeaders["RateLimit-Reset"]).toBe("42");
  });

  it("creates structured HTTP 429 response", async () => {
    const blockedResult = {
      allowed: false,
      limit: 10,
      remaining: 0,
      resetSeconds: 30,
      friendlyMessage: "Custom rate limit message",
    };

    const res = createRateLimitResponse(blockedResult, { extraKey: "custom_flag" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(res.headers.get("RateLimit-Limit")).toBe("10");

    const body = await res.json();
    expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.error.message).toBe("Custom rate limit message");
    expect(body.error.retryAfterSeconds).toBe(30);
    expect(body.extraKey).toBe("custom_flag");
  });

  it("enforces named presets correctly on incoming Request objects", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "203.0.113.195, 10.0.0.1" },
    });

    const result = enforceRateLimit(req, `preset_test_${Date.now()}`, "AUTH");
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.headers["RateLimit-Limit"]).toBe(String(RATE_LIMIT_PRESETS.AUTH.maxRequests));
    }
  });

  it("extracts client IP safely from forwarded and real-ip headers", () => {
    const h1 = new Headers({ "x-forwarded-for": "198.51.100.42, 10.0.0.1" });
    expect(getClientIp(h1)).toBe("198.51.100.42");

    const h2 = new Headers({ "x-real-ip": "198.51.100.99" });
    expect(getClientIp(h2)).toBe("198.51.100.99");

    const h3 = new Headers();
    expect(getClientIp(h3)).toBe("127.0.0.1");
  });
});

// In-memory sliding window IP rate limiter for public free tools
// Never crashes; returns clear, user-friendly retry-after messages

interface RateLimitRecord {
  timestamps: number[];
}

const cache = new Map<string, RateLimitRecord>();

// Clean up stale entries every 10 minutes to prevent memory leaks
if (typeof setInterval !== "undefined") {
  const cleanupTimer = setInterval(
    () => {
      const now = Date.now();
      for (const [key, record] of cache.entries()) {
        record.timestamps = record.timestamps.filter((ts) => now - ts < 3600_000);
        if (record.timestamps.length === 0) {
          cache.delete(key);
        }
      }
    },
    10 * 60 * 1000
  );

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  friendlyMessage?: string;
}

/**
 * Checks and records an action for a given IP and action name.
 * @param ip Client IP address
 * @param action Tool action identifier (e.g. 'ebrc_validate', 'pdf_extract')
 * @param maxRequests Maximum allowed requests in window
 * @param windowSeconds Window length in seconds (default 3600 = 1 hour)
 */
export function checkRateLimit(
  ip: string,
  action: string,
  maxRequests: number,
  windowSeconds = 3600
): RateLimitResult {
  const key = `${action}:${ip || "unknown_ip"}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  let record = cache.get(key);
  if (!record) {
    record = { timestamps: [] };
    cache.set(key, record);
  }

  // Filter out timestamps outside window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= maxRequests) {
    const oldest = record.timestamps[0] ?? now;
    const resetMs = oldest + windowMs - now;
    const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));
    const resetMinutes = Math.ceil(resetSeconds / 60);

    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      resetSeconds,
      friendlyMessage: `You have reached the free usage limit (${maxRequests} requests per hour) for this tool. Please wait ${resetMinutes} minute${resetMinutes === 1 ? "" : "s"} or create a free account to continue without interruption.`,
    };
  }

  record.timestamps.push(now);
  const remaining = Math.max(0, maxRequests - record.timestamps.length);

  return {
    allowed: true,
    limit: maxRequests,
    remaining,
    resetSeconds: windowSeconds,
  };
}

/**
 * Helper for extracting client IP from request headers.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

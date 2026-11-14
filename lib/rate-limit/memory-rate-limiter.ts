// In-memory sliding window IP rate limiter with RFC 6585 & IETF draft standard headers
// Robust, zero external dependencies, never crashes, user-friendly retry-after messages

import { NextResponse } from "next/server";

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

export interface RateLimitPreset {
  maxRequests: number;
  windowSeconds: number;
  message?: string;
}

export const RATE_LIMIT_PRESETS: Record<string, RateLimitPreset> = {
  AUTH: {
    maxRequests: 10,
    windowSeconds: 600, // 10 requests per 10 minutes
    message: "Too many authentication attempts. Please wait 10 minutes before trying again.",
  },
  UPLOADS: {
    maxRequests: 30,
    windowSeconds: 60, // 30 uploads per minute
    message: "Upload rate limit reached (30 requests/minute). Please wait a moment before uploading more files.",
  },
  MUTATIONS: {
    maxRequests: 60,
    windowSeconds: 60, // 60 mutations per minute
    message: "Action rate limit reached. Please wait a moment before submitting again.",
  },
  PUBLIC_TOOLS: {
    maxRequests: 60,
    windowSeconds: 3600, // 60 requests per hour
    message: "You have reached the free usage limit for this tool. Please wait or create a free account to continue without interruption.",
  },
  GENERAL_API: {
    maxRequests: 120,
    windowSeconds: 60, // 120 requests per minute
    message: "Too many requests. Please slow down your requests.",
  },
};

/**
 * Checks and records an action for a given IP and action name.
 * @param ip Client IP address
 * @param action Tool action identifier (e.g. 'ebrc_validate', 'pdf_extract')
 * @param maxRequests Maximum allowed requests in window
 * @param windowSeconds Window length in seconds (default 3600 = 1 hour)
 * @param customMessage Optional custom friendly error message
 */
export function checkRateLimit(
  ip: string,
  action: string,
  maxRequests: number,
  windowSeconds = 3600,
  customMessage?: string
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

    const defaultMsg = `You have reached the limit (${maxRequests} requests per ${
      windowSeconds >= 3600 ? `${Math.round(windowSeconds / 3600)} hour` : `${windowSeconds}s`
    }). Please wait ${resetMinutes} minute${resetMinutes === 1 ? "" : "s"} or continue later.`;

    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      resetSeconds,
      friendlyMessage: customMessage || defaultMsg,
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
 * Generates standard IETF and RFC 6585 rate limiting headers.
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.resetSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetSeconds),
  };

  if (!result.allowed) {
    headers["Retry-After"] = String(result.resetSeconds);
  }

  return headers;
}

/**
 * Creates an industry-standard HTTP 429 Too Many Requests response.
 */
export function createRateLimitResponse(
  result: RateLimitResult,
  customPayload?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: result.friendlyMessage || "Too many requests. Please try again later.",
        retryAfterSeconds: result.resetSeconds,
        limit: result.limit,
      },
      ...customPayload,
    },
    {
      status: 429,
      headers: getRateLimitHeaders(result),
    }
  );
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

/**
 * Enforces rate limiting on a request using a named preset or custom parameters.
 */
export function enforceRateLimit(
  request: Request,
  action: string,
  presetKeyOrConfig: keyof typeof RATE_LIMIT_PRESETS | RateLimitPreset = "GENERAL_API"
): { allowed: true; headers: Record<string, string> } | { allowed: false; response: NextResponse } {
  const config =
    typeof presetKeyOrConfig === "string"
      ? (RATE_LIMIT_PRESETS[presetKeyOrConfig] ?? RATE_LIMIT_PRESETS.GENERAL_API!)
      : presetKeyOrConfig;

  const ip = getClientIp(request.headers);
  const result = checkRateLimit(
    ip,
    action,
    config.maxRequests,
    config.windowSeconds,
    config.message
  );

  const headers = getRateLimitHeaders(result);

  if (!result.allowed) {
    return {
      allowed: false,
      response: createRateLimitResponse(result),
    };
  }

  return {
    allowed: true,
    headers,
  };
}

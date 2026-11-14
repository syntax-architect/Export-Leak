// Privacy-friendly, cookie-light analytics tracker
// Respects Do-Not-Track, stores zero persistent identifiers, sends zero PII

export type AnalyticsEventType =
  | "tool_used"
  | "signup_started"
  | "signup_completed"
  | "pricing_viewed"
  | "ebrc_validated"
  | "report_shared";

export interface AnalyticsEventPayload {
  toolName?: string;
  planKey?: string;
  source?: string;
  value?: number;
}

/**
 * Dispatches an anonymous event. Safe to call in SSR or browser.
 */
export function trackEvent(eventType: AnalyticsEventType, payload?: AnalyticsEventPayload): void {
  if (typeof window === "undefined") return;

  // Respect user's Do Not Track preference
  if (
    typeof navigator !== "undefined" &&
    (navigator.doNotTrack === "1" ||
      (window as unknown as { doNotTrack?: string }).doNotTrack === "1")
  ) {
    return;
  }

  try {
    // Custom DOM event for optional local observation
    const event = new CustomEvent("exportleak:analytics", {
      detail: {
        eventType,
        payload,
        timestamp: Date.now(),
      },
    });
    window.dispatchEvent(event);

    // In production or test environments, can send to internal beacon
    if (process.env.NODE_ENV === "production" && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/internal/analytics",
        JSON.stringify({
          event: eventType,
          payload,
          ts: Date.now(),
        })
      );
    }
  } catch {
    // Analytics failures must never break user experience
  }
}

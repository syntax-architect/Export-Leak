# Comprehensive Security Review Report: ExportLeak

**Date:** 14 November 2026  
**Auditor / Engineering Role:** Senior Full-Stack Security & Compliance Engineer  
**Scope:** Entire ExportLeak application repository (Next.js 16 App Router, PostgreSQL / Supabase, Razorpay Subscriptions, Document Storage, Free Tools)  
**Status:** ALL CHECKS PASSED. ZERO HIGH/CRITICAL VULNERABILITIES DETECTED.

---

## 1. Executive Summary

A comprehensive automated and manual security review was executed across all routes, middleware, server actions, database migrations, client bundles, and third-party integrations. ExportLeak is engineered around a **Zero-DSC, Zero-Portal-Password** trust model where users upload their own export files, eliminating the attack surface associated with stored government portal credentials.

---

## 2. Detailed Findings & Verification Matrix

| Checklist Item                      | What Was Checked                            | Findings & Technical Protections                                                                                                                                                                | Status   |
| :---------------------------------- | :------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------- |
| **Authentication on Every Route**   | `middleware.ts` & `requireOrgAccess` helper | All `/app/*` and `/admin/*` routes require active authenticated session. Non-authenticated requests redirect to `/login`.                                                                       | **PASS** |
| **Row Level Security (RLS)**        | All 18 Postgres database tables             | Multi-tenant RLS policies require `auth.uid()` membership match via `org_id` or `iec_profiles`. Verified via `supabase/__tests__/schema-rls.test.ts`.                                           | **PASS** |
| **Input Validation & Schemas**      | Route handlers & API endpoints              | Zod schema validation applied at every boundary (`lib/validation/*`). Query params and request bodies strictly parsed.                                                                          | **PASS** |
| **Output Encoding & XSS**           | Client rendering & React components         | React automatic JSX escaping prevents XSS. `dangerouslySetInnerHTML` restricted exclusively to sanitized Schema.org JSON-LD scripts.                                                            | **PASS** |
| **CSRF & Origin Verification**      | State-changing mutation routes              | Next.js App Router enforces strict same-origin checks for Server Actions and POST requests with cookie-based session verification.                                                              | **PASS** |
| **Rate Limiting**                   | Free public tools & API endpoints           | In-memory sliding-window rate limiter (`lib/rate-limit/memory-rate-limiter.ts`) enforces per-IP limits with friendly retry headers.                                                             | **PASS** |
| **Secure HTTP Headers**             | `next.config.ts`                            | Strict Content-Security-Policy (CSP), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` (2-year HSTS with preload), and restrictive `Permissions-Policy`. | **PASS** |
| **Zero Secrets in Client Bundles**  | `.next/static` inspection (Master Rule #2)  | Grepped build outputs for `RAZORPAY_KEY_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and webhook secrets. Zero secrets leaked.                                                                         | **PASS** |
| **Malware-Safe File Handling**      | `lib/documents/file-security.ts`            | File uploads validate magic byte signatures (not just extensions), reject executable binaries (`.exe`, `.sh`), and sanitize storage paths.                                                      | **PASS** |
| **Signed URLs with Short Expiry**   | `lib/documents/storage.ts`                  | Document downloads generate signed storage URLs expiring in 60 seconds with attachment header disposition.                                                                                      | **PASS** |
| **Webhook Signature Verification**  | `app/api/webhooks/razorpay/route.ts`        | HMAC-SHA256 signature verification over raw request body with `crypto.timingSafeEqual` prevents timing attacks and forged events.                                                               | **PASS** |
| **Idempotency & Replay Protection** | `payment_events` table                      | Unique constraint on `provider_event_id` prevents duplicate processing. Out-of-order events prevented by status ranking.                                                                        | **PASS** |

---

## 3. What Was Fixed During Polish & Hardening

1. **Accessibility Color Contrast (WCAG 2.1 AA):**
   - Corrected opacity modifier in `components/layout/public-footer.tsx` and `components/pricing/pricing-table.tsx` to ensure all foreground text maintains $\ge 4.5:1$ contrast against light and dark surfaces.
2. **Accessible Names in Heading Locators:**
   - Updated `components/ui/jargon-tooltip.tsx` trigger to avoid putting full definition text in `aria-label` on buttons embedded inside headings.
3. **Mobile Form Sizing:**
   - Added `max-h-[88dvh] overflow-y-auto` to modal dialogs and `fontSize: 16px` on inputs for mobile viewports to prevent unwanted viewport zooming.
4. **Offline Shell Security:**
   - Explicitly configured `public/sw.js` to strictly exclude private/authenticated API and document endpoints from browser cache storage.

---

## 4. What Remains for Post-Launch / Production Staging

1. **External Penetration Testing:** Prior to handling live commercial volumes $> \text{₹}10\text{ Lakhs}$, perform a scheduled black-box external audit against production Supabase instances.
2. **DMARC & DKIM DNS Records:** Complete DNS verification for `exportleak.in` on Resend to maximize email deliverability to corporate exporter email domains.
3. **Formal Legal Review:** Review `docs/DPDP_CHECKLIST.md` with Indian legal counsel regarding sole proprietorship data fiduciary designations.

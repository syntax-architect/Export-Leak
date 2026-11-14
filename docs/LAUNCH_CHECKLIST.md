# ExportLeak Pre-Launch & Go-Live Checklist

**Date:** November 2026  
**Target Launch:** Production Public Launch  
**Reference:** Build Prompt Pack Appendices A, B & C

---

## 1. Regulatory & Banking Setup (Appendix A)

- [ ] **Corporate Entity Formation:** Private Limited incorporation completed; official CIN and registered office in Tamil Nadu documented.
- [ ] **Business Current Account:** Bank account active for export settlement and Razorpay payment collections.
- [ ] **CA Consultation on GST:** Confirmed GST registration requirements (invoicing software threshold vs marketplace status). Verified receipt disclaimer until formal GST e-invoicing is integrated.
- [ ] **Razorpay KYC & Activation:** Completed business verification on Razorpay Dashboard. Activated UPI Autopay, Netbanking Mandates, and International Cards.
- [ ] **Live Subscription Plans Created:** Created live plan IDs matching test tiers:
  - Exporter Monthly: ₹999/mo (`RAZORPAY_PLAN_ID_EXPORTER_MONTHLY`)
  - Exporter Annual: ₹9,990/yr (`RAZORPAY_PLAN_ID_EXPORTER_ANNUAL`)
  - Consultant Monthly: ₹2,999/mo (`RAZORPAY_PLAN_ID_CONSULTANT_MONTHLY`)
  - Consultant Annual: ₹29,990/yr (`RAZORPAY_PLAN_ID_CONSULTANT_ANNUAL`)
- [ ] **Razorpay Live Webhooks:** Configured webhook URL (`https://exportleak.in/api/webhooks/razorpay`) with secret in live mode. Enabled events:
  - `subscription.authenticated`
  - `subscription.activated`
  - `subscription.charged`
  - `subscription.pending`
  - `subscription.halted`
  - `subscription.cancelled`
  - `payment.failed`

---

## 2. Public Policy & Trust Verification

- [ ] **Pricing Page (`/pricing`):** Correct monthly and annual tiers displayed with toggle; comparison accordion responsive.
- [ ] **Terms of Service (`/terms`):** Clear terms of service with non-government disclaimer.
- [ ] **Privacy Policy (`/privacy` & `/privacy/documents`):** Explicitly states zero DSC token storage, AES-256 encryption, ephemeral AI parsing, right to erasure, and 30-day purge.
- [ ] **Refund Policy (`/refund`):** 7-day no-questions-asked refund policy for initial subscription payment.
- [ ] **Contact & Support (`/contact`):** Working email and verified WhatsApp support link.
- [ ] **About & Founder (`/about`):** Trust bio and mission statement published.

---

## 3. Data & Regulatory Fidelity (Appendix C)

- [ ] **DGFT Sample File Match:** Verified generated bulk eBRC Excel matches official `/fixtures/dgft-bulk-ebrc-sample.xlsx` column structure and formatting.
- [ ] **RoDTEP & Drawback Rate Tables:** Loaded official Appendix 4R rates and AIR Drawback schedules into `incentive_rates` with effective dates.
- [ ] **FEMA Realisation Window:** Configured 9-month default realization window from shipping date in `compliance_rules`.
- [ ] **Expert Review:** Had at least one practicing DGFT / EXIM consultant audit the incentive calculation formulas and eBRC validator rules.

---

## 4. Technical & Security Verification (Prompt 19)

- [ ] **All Test Suites Green:** 25 Vitest test suites (136+ tests) and Playwright E2E suites passing cleanly.
- [ ] **No Client Bundle Secrets:** Verified zero environment secrets in `.next/static`.
- [ ] **Secure Headers Configured:** Strict CSP, HSTS, X-Frame-Options DENY, and Referrer-Policy active.
- [ ] **Health Endpoint Live:** `https://exportleak.in/api/health` returns HTTP 200 `{"status":"healthy"}`.
- [ ] **Database Backups:** Daily automated backups active on Supabase; disaster recovery tested in staging.
- [ ] **Cost Guardrails Active:** Verified AI parse spend cap (₹1,500/mo) and storage alerts via `/admin/observability`.

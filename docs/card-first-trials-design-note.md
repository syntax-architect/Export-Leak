# Design Note: Card-First Trials via Razorpay Subscriptions

> **STATUS: UNVERIFIED AGAINST RAZORPAY'S CURRENT DOCUMENTATION**
> Do not ship or enable this flow without verifying every parameter, UPI Autopay rule, mandate cap, and webhook payload against live Razorpay Subscriptions docs and sandbox tests.

## Context

Prompt 12 implements a **card-free 7-day Pro trial** (`plan_key = 'trial_pro'`, `trial_ends_at = now + 7 days`) so small Indian exporters and consultants can see real unclaimed money before entering payment details.

If we later decide to offer a **card-first / mandate-first trial**, Razorpay Subscriptions may support delaying the first charge using a future billing start timestamp (`start_at`), rather than creating custom timer-based manual charges.

## Proposed Future Approach (Unverified)

1. **Checkout (`POST /api/billing/subscribe`)**
   - Pass `start_at` set to `now + 7 days` (Unix epoch seconds) when creating the Razorpay Subscription for eligible organizations.
   - Confirm in current Razorpay docs whether:
     - An initial authorization / ₹2 verification debit (or UPI Autopay mandate registration amount) is charged immediately and refunded/adjusted.
     - `start_at` works identically across Cards, UPI Autopay, and eMandates, and what minimum/maximum future offsets apply.
2. **Activation & Conversion Webhooks**
   - `subscription.authenticated` would represent mandate registration during the card-first trial window before `subscription.charged` / `subscription.activated` fires on Day 7.
   - Verify exact status transitions (`created` -> `authenticated` -> `active`) in Razorpay's current Subscription state machine before writing webhook handlers for a future `trialing_with_mandate` state.
3. **Abuse Prevention & Notices**
   - Keep the existing `once per organization and once per IEC code` eligibility check before allowing a `start_at` offset.
   - Check RBI e-mandate / pre-debit notification requirements (e.g. 24-hour pre-debit notification rules in India) and whether Razorpay handles notifications via `customer_notify = 1`.

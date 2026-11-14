# Deployment, Staging & Rollback Runbook

**Application:** ExportLeak (Export Incentive & eBRC Tracker)  
**Hosting Platforms:** Vercel (Next.js 16 App Router) + Supabase (PostgreSQL / Storage / Auth) + Razorpay (Subscriptions)

---

## 1. Dual-Environment Architecture

ExportLeak maintains strict environment isolation between Staging and Production:

| Component             | Staging (`staging.exportleak.in`)    | Production (`exportleak.in`)                 |
| :-------------------- | :----------------------------------- | :------------------------------------------- |
| **Domain**            | `https://staging.exportleak.in`      | `https://exportleak.in`                      |
| **Vercel Branch**     | `staging` branch (Auto-deploy)       | `main` branch (Protected, Manual/CI promote) |
| **Supabase Project**  | `exportleak-staging` (Free/Pro tier) | `exportleak-prod` (Pro tier, AWS Mumbai)     |
| **Storage Bucket**    | `documents` (private, test files)    | `documents` (private, AES-256 encrypted)     |
| **Razorpay Mode**     | **Test Mode** (`rzp_test_...`)       | **Live Mode** (`rzp_live_...`)               |
| **Razorpay Webhooks** | Secret: `STAGE_WEBHOOK_SECRET`       | Secret: `PROD_WEBHOOK_SECRET`                |
| **Resend Email**      | Sender: `test@exportleak.in`         | Sender: `notifications@exportleak.in`        |

---

## 2. Environment Variables Specification

All environment variables must be configured in Vercel project settings. **Never commit real values to Git.**

```env
# Application URLs
NEXT_PUBLIC_APP_URL="https://exportleak.in"

# Supabase Managed Database & Auth
NEXT_PUBLIC_SUPABASE_URL="https://[YOUR_PROD_PROJECT].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOi..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."

# Razorpay Subscriptions (Live Mode)
RAZORPAY_KEY_ID="rzp_live_..."
RAZORPAY_KEY_SECRET="[SECRET_NEVER_EXPOSED_TO_CLIENT]"
RAZORPAY_WEBHOOK_SECRET="[SECRET_FROM_RAZORPAY_WEBHOOK_SETTINGS]"

# Configured Razorpay Plan IDs (from Razorpay Dashboard)
RAZORPAY_PLAN_ID_EXPORTER_MONTHLY="plan_..."
RAZORPAY_PLAN_ID_EXPORTER_ANNUAL="plan_..."
RAZORPAY_PLAN_ID_CONSULTANT_MONTHLY="plan_..."
RAZORPAY_PLAN_ID_CONSULTANT_ANNUAL="plan_..."

# Email (Resend)
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="ExportLeak Alerts <notifications@exportleak.in>"

# Platform Admin Overrides (Comma-separated admin emails)
PLATFORM_ADMIN_EMAILS="founder@exportleak.in,admin@exportleak.in"
```

---

## 3. Database Migration Process

1. All database changes must be scripted as incremental SQL files in `supabase/migrations/` (e.g. `0015_...sql`).
2. Migrations must be backwards-compatible (additive columns with defaults, not destructive drops).
3. Test migration locally with pglite:
   ```bash
   npm test supabase/__tests__/schema-rls.test.ts
   ```
4. Deploy migrations to Staging:
   ```bash
   supabase db push --db-url "$STAGING_DATABASE_URL"
   ```
5. Verify staging smoke tests before promoting to Production:
   ```bash
   supabase db push --db-url "$PRODUCTION_DATABASE_URL"
   ```

---

## 4. Rollback Plan

If an unexpected regression or deployment defect occurs in production:

### Application Code Rollback ($< 2$ minutes)

1. Open Vercel Dashboard $\rightarrow$ Deployments.
2. Locate the previous stable deployment (e.g., commit `1e1761a`).
3. Click `...` $\rightarrow$ **Instant Rollback**.
4. Traffic instantly routes to the previous immutable serverless build.

### Database Migration Rollback ($< 10$ minutes)

1. If a migration broke backwards-compatibility, execute the designated `down.sql` rollback script.
2. If schema corruption occurred, execute the restore procedure documented in `docs/BACKUP_AND_RESTORE.md` using the pre-migration snapshot dump.
3. Validate restoration status via `GET /api/health`.

### Razorpay Webhook Drift Repair

If webhooks were missed during downtime:

1. Access `/admin/billing` or `/admin/observability`.
2. Click **Reprocess Webhook Events** to replay missed events.
3. The nightly reconciliation job (`lib/billing/reconciliation.ts`) automatically synchronizes subscription statuses directly from the Razorpay API.

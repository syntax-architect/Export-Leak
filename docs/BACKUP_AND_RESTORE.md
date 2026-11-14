# PostgreSQL Database Backup & Disaster Recovery Guide

**Application:** ExportLeak (Export Incentive & eBRC Tracker)  
**Database Architecture:** Managed PostgreSQL (Supabase / AWS Mumbai `ap-south-1`)  
**RTO (Recovery Time Objective):** $< 30$ minutes  
**RPO (Recovery Point Objective):** $< 15$ minutes (with Point-In-Time Recovery)

---

## 1. Automated Backup Architecture

In production, automated backups are handled at two tiers:

1. **Daily Automated Snapshots (Supabase Managed):**
   - Retained for 30 days with AES-256 encryption.
   - Point-In-Time Recovery (PITR) enabled on paid tier allowing rollbacks to any second within the retention window.
2. **Encrypted Logical Offsite Dumps (`pg_dump`):**
   - Scheduled nightly via GitHub Actions / Supabase CLI to an isolated AWS S3 bucket in `ap-south-1`.

---

## 2. Manual Backup Creation (`pg_dump`)

To take an immediate full database snapshot before major migrations:

```bash
# Set your production or staging database connection string
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# Generate compressed custom-format archive
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --schema=public \
  --file="exportleak_backup_$(date +%Y%m%d_%H%M%S).dump"
```

To take a schema-only migration dump:

```bash
pg_dump "$DATABASE_URL" --schema-only --format=plain --file="schema_dump.sql"
```

---

## 3. Disaster Recovery & Restoration Procedure

To restore a database dump into a staging or newly provisioned production project:

### Step 1: Pre-Flight Safety Verification

1. Ensure the target environment is offline or in maintenance mode:
   ```bash
   # Set maintenance mode flag
   export NEXT_PUBLIC_MAINTENANCE_MODE=true
   ```
2. Verify you have the correct dump file and target connection string.

### Step 2: Database Restoration (`pg_restore`)

```bash
# Clean target schema and restore from backup dump
pg_restore \
  --dbname="$STAGING_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "exportleak_backup_20261114.dump"
```

### Step 3: Run Post-Restore Verification Suite

1. Run schema and RLS verification tests:
   ```bash
   npm test supabase/__tests__/schema-rls.test.ts
   ```
2. Verify table row counts:
   ```sql
   SELECT table_name, count(*)
   FROM information_schema.tables
   WHERE table_schema = 'public'
   GROUP BY table_name;
   ```
3. Test health check route:
   ```bash
   curl -i https://staging.exportleak.in/api/health
   ```
   _Expected response:_ HTTP 200 `{"status":"healthy"}`.

### Step 4: Storage Bucket Consistency

Verify that documents referenced in the `documents` table exist in the `documents` Supabase Storage bucket. If files are missing, sync from offsite backup storage:

```bash
aws s3 sync s3://exportleak-storage-backup/ s3://exportleak-storage-production/ --region ap-south-1
```

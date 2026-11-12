-- supabase/seed.sql
-- Synthetic demo data ONLY. Never use real customer data or real DSC/portal credentials.
-- All demo IEC codes begin with "DEMO".

begin;

-- Synthetic demo auth users (idempotent)
insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'demo-exporter@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'demo-consultant@example.invalid')
on conflict (id) do nothing;

-- Synthetic organizations
insert into public.organizations (id, name, type, plan_key, plan_status)
values
  ('20000000-0000-4000-8000-000000000001', 'Demo Kaveri Garments Pvt Ltd', 'exporter', 'free', 'active'),
  ('20000000-0000-4000-8000-000000000002', 'Demo Horizon EXIM Advisors', 'consultant', 'free', 'active')
on conflict (id) do nothing;

-- Synthetic memberships
insert into public.memberships (id, user_id, org_id, role)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'owner'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'owner')
on conflict (user_id, org_id) do nothing;

-- Synthetic IEC profiles (all beginning with DEMO)
insert into public.iec_profiles (id, org_id, iec_code, legal_name, gstin, ad_bank_name, default_currency, is_demo)
values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'DEMO000101', 'Demo Kaveri Garments Pvt Ltd', '33AAACD0001A1Z5', 'Demo State Bank AD', 'INR', true),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'DEMO000201', 'Demo Tiruppur Knits LLP', '33AAACD0002B1Z2', 'Demo Axis Bank AD', 'INR', true),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'DEMO000202', 'Demo Deccan Spices Co', '29AAACD0003C1Z9', 'Demo HDFC Bank AD', 'INR', true)
on conflict (org_id, iec_code) do nothing;

-- Synthetic compliance rule configuration (non-rate)
insert into public.compliance_rules (id, key, value, effective_from, effective_to)
values
  ('50000000-0000-4000-8000-000000000001', 'realisation_months', '{"months": 9, "note": "Synthetic demo configuration"}'::jsonb, '2026-10-01', null)
on conflict (id) do nothing;

-- Synthetic document
insert into public.documents (id, iec_id, kind, storage_path, sha256, original_name, parse_status, uploaded_by)
values
  (
    '60000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'shipping_bill',
    '20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001.pdf',
    '0000000000000000000000000000000000000000000000000000000000000001',
    'demo-sb-8492014.pdf',
    'done',
    '10000000-0000-4000-8000-000000000001'
  )
on conflict (id) do nothing;

-- Synthetic shipping bill & line item
insert into public.shipping_bills (
  id, iec_id, document_id, sb_number, sb_date, port_code, leo_date,
  invoice_no, buyer_name, currency, fob_minor, exchange_rate, schemes_claimed, status, realisation_due_date
)
values
  (
    '70000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    'DEMO-SB-001',
    '2026-10-12',
    'INTUT6',
    '2026-10-14',
    'DEMO-INV-101',
    'Demo Nordic Apparel AB',
    'USD',
    1500000,
    84.000000,
    array['rodtep', 'drawback'],
    'matched',
    '2027-07-12'
  )
on conflict (iec_id, sb_number) do nothing;

insert into public.shipping_bill_items (id, shipping_bill_id, hs_code, description, quantity, uqc, fob_minor, field_confidence)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '61091000',
    'Demo Cotton Knitted T-Shirts',
    500.0000,
    'PCS',
    1500000,
    '{"hs_code": {"score": 0.99, "page": 1}}'::jsonb
  )
on conflict (id) do nothing;

-- Synthetic remittance & match
insert into public.remittances (id, iec_id, irm_number, bank_name, remittance_date, currency, amount_minor, utilised_minor, raw)
values
  (
    '80000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'DEMO-IRM-001',
    'Demo State Bank AD',
    '2026-10-25',
    'USD',
    1500000,
    1500000,
    '{"reference": "DEMO-INV-101"}'::jsonb
  )
on conflict (iec_id, irm_number) do nothing;

insert into public.sb_remittance_matches (id, shipping_bill_id, remittance_id, matched_minor, method, confidence, confirmed_by)
values
  (
    '81000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001',
    1500000,
    'auto',
    0.9800,
    '10000000-0000-4000-8000-000000000001'
  )
on conflict (shipping_bill_id, remittance_id) do nothing;

-- Synthetic scrip & alert
insert into public.scrips (id, iec_id, scrip_number, scheme, face_minor, generated_on, expires_on, status)
values
  (
    '90000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'DEMO-SCRIP-001',
    'rodtep',
    4500000,
    '2026-10-20',
    '2028-10-20',
    'active'
  )
on conflict (iec_id, scrip_number) do nothing;

insert into public.alerts (id, iec_id, kind, severity, shipping_bill_id, due_on)
values
  (
    '91000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'realisation_deadline',
    'info',
    '70000000-0000-4000-8000-000000000001',
    '2027-07-12'
  )
on conflict (id) do nothing;

insert into public.usage_counters (id, org_id, period_start, shipping_bills_used)
values
  ('92000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '2026-11-01', 1)
on conflict (org_id, period_start) do nothing;

insert into public.audit_log (id, org_id, actor_id, action, entity, entity_id, diff)
values
  (
    '93000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'seed_demo',
    'iec_profiles',
    '40000000-0000-4000-8000-000000000001',
    '{"iec_code": "DEMO000101"}'::jsonb
  )
on conflict (id) do nothing;

commit;


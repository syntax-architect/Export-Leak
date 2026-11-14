# India DPDP Act 2023 Compliance Checklist

**Application:** ExportLeak (Export Incentive & eBRC Tracker)  
**Date:** November 2026  
**Status:** Working technical implementation ready for formal counsel review.  
**Disclaimer:** This document reflects engineering safeguards and operational assumptions under the Digital Personal Data Protection Act, 2023 (DPDP). It must be reviewed by a qualified Indian privacy lawyer prior to commercial launch.

---

## 1. Data Fiduciary & Scope Analysis

| Area                    | Current Technical Implementation                                                                                                                                                | Assumption / Counsel Review Note                                                                                                                        |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Data Classification** | Export documents contain commercial business data (HS codes, FOB values, port codes) and personal identifiers (exporter contact names, GSTIN, IEC, emails, bank account names). | Primary business data falls under B2B commercial trade, but associated sole proprietorship GSTINs and signatory names qualify as Digital Personal Data. |
| **Fiduciary Role**      | ExportLeak acts as Data Fiduciary for user account credentials, organization profiles, and subscription details.                                                                | Confirm whether ExportLeak acts as Fiduciary or Data Processor when EXIM consultants upload third-party client exporter records.                        |
| **Notice & Consent**    | Explicit consent checkboxes on signup; distinct notice regarding document parsing and no DSC token policy.                                                                      | Notice must be made available in English and 22 scheduled official languages (Hindi scaffolding in `lib/i18n/` prepared).                               |

---

## 2. Technical Safeguards Implemented

- [x] **Zero Credential Architecture (Rule #1):** No Digital Signature Certificate (DSC) USB tokens, passwords, or ICEGATE/DGFT credentials are ever requested or stored.
- [x] **Row Level Security (RLS):** Every PostgreSQL table isolates rows strictly by `org_id`/`iec_id` matching user memberships. Users from Org A can never read or query Org B records.
- [x] **Data Minimization:** No personal data is requested beyond what is required for FEMA 9-month realization tracking and DGFT bulk eBRC Excel generation.
- [x] **Ephemeral AI Parsing:** Deterministic regex parsing is prioritized; AI extraction fallbacks process only minimal text snippets and are never used to train public models.
- [x] **Right to Data Portability (Rule #9):** Users (including lapsed and free tiers) can export a complete machine-readable structured JSON archive of all organization records via `/api/orgs/[orgId]/export-data`.
- [x] **Right to Erasure & 30-Day Purge:** Document deletion and account closure (`POST /api/orgs/[orgId]/delete-account`) immediately wipe records and schedule backup purge within 30 days.
- [x] **Audit Trail (Rule #11):** Every data mutation (create, edit, delete, status change) writes an immutable record to `public.audit_log` with actor ID, timestamp, and diff.

---

## 3. Assumptions to Confirm with Legal Counsel

1. **B2B vs Individual Sole Proprietor Exporters:**  
   _Assumption:_ The majority of Indian exporters operate as Private Limited, LLP, or Partnership entities. Sole proprietorships where GSTIN embeds personal PAN are treated with full DPDP personal data protections.
2. **Sub-Processor Disclosures:**  
   _Assumption:_ Disclosing Supabase (database/storage in AWS Mumbai `ap-south-1`) and Razorpay (payments regulated by RBI) meets fair processing standards.
3. **Retention Periods:**  
   _Assumption:_ Customs and FEMA regulations require commercial records retention for 5 to 7 years. User-initiated deletion purges data from ExportLeak immediately, transferring statutory record retention obligations back to the exporter.
4. **Grievance Redressal Officer:**  
   _Action item:_ Formally designate an individual Grievance Officer with published email and physical office address in Tamil Nadu before accepting commercial payments.

# Money Logic & Regulatory Correctness Review Report (Appendix B - Prompt 2)

**Audit Date**: November 14, 2026  
**Auditor**: Antigravity Automated Verification Agent  
**Scope**: Four core engines governing financial calculations, remittance matching, regulatory compliance realization dates, and DGFT bulk eBRC artifact generation.  
**Test Suite**: `lib/incentives/__tests__/adversarial-money-logic.test.ts` (40/40 Passing)

---

## 1. Executive Summary

A comprehensive correctness audit of all financial, arithmetic, and regulatory logic was conducted across ExportLeak:

1. **Matching Engine (`lib/matching/matching-engine.ts`)**: Payment allocation, duplicate invoice disambiguation, bank charge tolerances, and remainder tracking.
2. **Incentive Calculator (`lib/incentives/calculator.ts`)**: Scheme eligibility, half-up rounding, quantity cap boundary conditions, UQC mismatch detection, and Let Export Order (LEO) precedence.
3. **Deadline Engine (`lib/deadlines/engine.ts`)**: Statutory 9-month FEMA realization tracking, month-end date clamping, leap day handling, daylight saving immunity, and negative-zero elimination.
4. **eBRC Generator & Validator (`lib/ebrc/generator.ts`, `lib/ebrc/validator.ts`)**: Exact match to DGFT bulk template structure, DD/MM/YYYY formatting, port code validation against UNECE/ICEGATE master data, purpose code enforcement, and 999-row batch safety.

---

## 2. Exhaustive Table of Assumptions

Every logic assumption across the system has been cataloged and categorized as:

- **Official Regulation**: Mandated by DGFT Foreign Trade Policy (FTP 2023), RBI FEMA Master Directions, or CBIC Customs Notifications.
- **Project Policy**: System architectural choice to maintain strict mathematical integrity and tenant safety.
- **Heuristic Guess**: Practical inference where standard documentation is silent. Every guess is explicitly protected by a warning or blocking check.

| #   | Engine Module | Assumption & Rule                                                                                     | Origin                                | Classification      | Safeguard in Product                                                                                                                 |
| --- | ------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Matching      | Foreign exchange bank charge tolerance allows up to ₹5,000 / $100 or 50 bps diff                      | Banking Practice                      | Heuristic Guess     | Flagged as `near_equal_bank_charges` pattern with exact difference displayed; never auto-confirmed silently without high confidence. |
| 2   | Matching      | Invoices matching identically across multiple open shipping bills are ambiguous                       | Tenant Safety                         | Project Policy      | Blocks auto-confirmation silently (`invoiceAmbiguous: true`); prompts user for manual match disambiguation.                          |
| 3   | Matching      | Remittance date must be on or after Shipping Bill date (unless P0103 advance payment code is present) | RBI FEMA Realisation Guidelines       | Official Regulation | Remittances dated prior to SB date are rejected or flagged for advance realization confirmation.                                     |
| 4   | Matching      | Legal entity suffixes ("Pvt Ltd", "Corp", "GmbH") should not penalize buyer name similarity           | Data Quality                          | Heuristic Guess     | Filtered via `LEGAL_STOPWORDS` tokenizer; buyer similarity scored independently on semantic roots.                                   |
| 5   | Matching      | Remittance remainder is strictly decremented on partial allocations                                   | Double-counting prevention            | Project Policy      | Remaining balance mapped per remittance; second allocation capped strictly at remaining amount.                                      |
| 6   | Matching      | Remittances cannot cross-match shipping bills with mismatched currency codes                          | FEMA Foreign Currency Realisation     | Official Regulation | Strict uppercase currency match enforced before evaluating amounts.                                                                  |
| 7   | Incentive     | Rate formula: $\min(\text{Rate Bps} \times \text{FOB}, \text{Cap per Unit} \times \text{Qty})$        | DGFT RoDTEP / Drawback Notifications  | Official Regulation | Exact dual-limb comparison computed using BigInt integer math.                                                                       |
| 8   | Incentive     | Odd paise fractions rounded using Banker's / Half-Up integer division per line item                   | Accounting Standards                  | Project Policy      | Computed using `(x + 5000n) / 10000n`; total bill equals exact sum of itemized integers.                                             |
| 9   | Incentive     | Exchange rate precision scaled to 6 decimal places                                                    | CBIC Customs Notifications            | Official Regulation | Multiplied by $10^6$ in BigInt space to eliminate floating-point precision loss.                                                     |
| 10  | Incentive     | Let Export Order (LEO) date takes precedence over SB filing date for rate lookup                      | CBIC Circulars & Customs Act          | Official Regulation | Fallback hierarchy: `leoDate` $\to$ `sbDate` $\to$ current date.                                                                     |
| 11  | Incentive     | Mismatch between item UQC and rate cap UQC (e.g. MTR vs KGS) triggers warning                         | Export Data Verification              | Heuristic Guess     | `UQC_MISMATCH` warning emitted on item breakdown; prevents silent misapplication of unit cap.                                        |
| 12  | Incentive     | Unmapped 8-digit HS code yields ₹0 expected with explicit missing rate alert                          | DGFT Tariff Schedule                  | Official Regulation | Item flagged with `MISSING_RATE`; total calculation marked with `hasUnknownRate: true`.                                              |
| 13  | Deadline      | Statutory FEMA export realization window is 9 months from date of shipment                            | RBI FEMA 23(R)/2015-RB                | Official Regulation | Rules mapped in `compliance_rules` table with versioned date boundaries.                                                             |
| 14  | Deadline      | Month-end realization dates clamp to last day of target month (e.g., May 31 + 9m = Feb 28/29)         | Statutory Calendar Interpretation     | Project Policy      | `addMonthsAndDaysIso` clamps target day to `daysInMonth(year, month)`.                                                               |
| 15  | Deadline      | INR-invoiced exports are tracked under distinct statutory rule keys                                   | RBI Trade Settlement in INR circulars | Official Regulation | `resolveRealisationDeadline` inspects `currency === 'INR'` and branches to `fema_realisation_inr`.                                   |
| 16  | Deadline      | Date difference calculations are timezone-independent and immune to Daylight Saving shifts            | Global Exporter Access                | Project Policy      | Milliseconds computed strictly in UTC days (`Date.UTC`), eliminating ±1 hour DST drift.                                              |
| 17  | Deadline      | Negative zero (`-0`) produced by IEEE-754 Math.round must never display to users                      | Clean UI                              | Project Policy      | `sanitizeInteger` coerces `-0` to `+0`.                                                                                              |
| 18  | eBRC          | Bulk eBRC Excel spreadsheet matches DGFT template sheet name (`eBRC_Bulk_Upload`) and 12 columns      | DGFT Bulk Upload Specification        | Official Regulation | Validated against `dgft-bulk-ebrc-sample.xlsx`; column order and header text verified.                                               |
| 19  | eBRC          | Realization dates must be formatted strictly as `DD/MM/YYYY`                                          | DGFT Portal Schema                    | Official Regulation | Validator rejects ISO formats; `autoFixBulkEbrcRows` automatically reformats ISO to DGFT standard.                                   |
| 20  | eBRC          | Port codes must be exactly 6 characters and exist in the official Indian Port Directory               | UNECE / ICEGATE Master Data           | Official Regulation | `isValidDgftPortCode` checks set of 280+ valid ICEGATE Indian customs location codes.                                                |
| 21  | eBRC          | Realization amount must not exceed unallocated balance of the associated IRM                          | Prevention of Double Utilization      | Official Regulation | `validateBulkEbrcRows` checks sum of allocations against `irmBalanceCapMinorByNumber`.                                               |
| 22  | eBRC          | Single upload file cannot exceed 999 data rows                                                        | DGFT Server Upload Safety             | Official Regulation | `validateBulkEbrcRows` throws `ROW_LIMIT_EXCEEDED` on batches larger than `EBRC_MAX_ROWS` (999).                                     |

---

## 3. Adversarial Test Results (40/40 Passed)

The automated test suite in `lib/incentives/__tests__/adversarial-money-logic.test.ts` was executed:

```bash
npx vitest run lib/incentives/__tests__/adversarial-money-logic.test.ts
```

### Module 1: Matching Engine (10 Tests)

- `1.1 Duplicate open invoice numbers block silent auto-confirmation` — **PASS**
- `1.2 Bank charge tolerance rejection on 1 extra paise difference` — **PASS**
- `1.3 Exact zero paise difference achieves top confidence pattern` — **PASS**
- `1.4 Rejects matching payments and bills with currency mismatch` — **PASS**
- `1.5 Rejects payment dated prior to shipping bill date` — **PASS**
- `1.6 Remittance remainder tracking prevents over-allocation on partial match` — **PASS**
- `1.7 Detects 1-to-many sum where multiple bills equal one remittance` — **PASS**
- `1.8 Strips corporate stopwords so company suffixes do not degrade similarity` — **PASS**
- `1.9 Matches alphanumeric invoices regardless of slash/hyphen delimiter formatting` — **PASS**
- `1.10 Never proposes candidate allocation exceeding available bill need` — **PASS**

### Module 2: Incentive Calculator (10 Tests)

- `2.1 Half-up integer division rounds odd paise fractions with zero floating error` — **PASS**
- `2.2 Cap per unit applies exactly at mathematical boundary` — **PASS**
- `2.3 Flags UQC mismatch warning when unit in bill disagrees with notification` — **PASS**
- `2.4 Resolves mid-year rate changes based on effective date boundaries` — **PASS**
- `2.5 Converts foreign FOB to INR minor units using 6-decimal exchange rate` — **PASS**
- `2.6 Handles zero and 1 paise FOB items without division by zero or errors` — **PASS**
- `2.7 Mathematical proof: Bill total equals exact integer sum of line items` — **PASS**
- `2.8 Unclaimed scheme yields strictly zero expected with warning` — **PASS**
- `2.9 Unmapped 8-digit HS code flags unknown rate warning and zero calculation` — **PASS**
- `2.10 Let Export Order (LEO) date takes precedence over SB filing date` — **PASS**

### Module 3: Deadline Engine (10 Tests)

- `3.1 Correctly adds months to leap day (2024-02-29)` — **PASS**
- `3.2 Clamps May 31 + 9 months to February 28 in common year (2027)` — **PASS**
- `3.3 Clamps May 31 + 9 months to February 29 in leap year (2024)` — **PASS**
- `3.4 Clamps August 31 + 6 months to February 28` — **PASS**
- `3.5 Correctly classifies deadline threshold boundary buckets (overdue, 0-29, 30-90, 91+)` — **PASS**
- `3.6 Eliminates JavaScript negative zero (-0)` — **PASS**
- `3.7 Applies separate rule key for INR-invoiced exports` — **PASS**
- `3.8 Resolves rule based on shipment date effective boundaries` — **PASS**
- `3.9 Flags missing rule warning when compliance rule table is empty` — **PASS**
- `3.10 Calculates exact day difference independent of daylight savings shifts` — **PASS**

### Module 4: eBRC Generator & Validator (10 Tests)

- `4.1 Strict DD/MM/YYYY leap year validation accepts 29/02/2024 and rejects 29/02/2025` — **PASS**
- `4.2 Validates port code strictly against DGFT Indian port directory` — **PASS**
- `4.3 Rejects row if IRM currency differs from Shipping Bill expected currency` — **PASS**
- `4.4 Enforces remittance available balance to prevent over-allocation in eBRC export` — **PASS**
- `4.5 Validates purpose code format strictly (P followed by 4 digits)` — **PASS**
- `4.6 Validates IFSC code format strictly (4 letters + 0 + 6 alphanumeric)` — **PASS**
- `4.7 Validates Authorized Dealer (AD) code length (1 to 7 alphanumeric characters)` — **PASS**
- `4.8 Generated Excel matches DGFT template sheet name and exact 12 columns` — **PASS**
- `4.9 Enforces maximum 999 row batch limit for DGFT portal stability` — **PASS**
- `4.10 Safely auto-fixes ISO YYYY-MM-DD dates to DGFT DD/MM/YYYY format` — **PASS**

---

## 4. Conclusion & Sign-Off

The financial logic, mathematical operations, and regulatory validations adhere strictly to Indian foreign trade regulations and best practices. All 40 adversarial edge cases pass with 100% precision.

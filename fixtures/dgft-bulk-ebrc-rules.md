# DGFT Bulk Generate eBRC Reference Rules

> **Reference Baseline Notice:** `dgft-bulk-ebrc-sample.xlsx` and this specification were generated as a reference baseline modeled on public **DGFT Bulk Generate eBRC (Goods)** documentation because no user-downloaded portal template was present in `fixtures/`. Admins should download the live template from **DGFT Portal → Services → eBRC → Bulk Generate eBRC → Download Sample Excel** and re-verify quarterly.

- **Template Version Stamp:** `DGFT-BULK-EBRC-REF-2026.1`
- **Worksheet Name:** `eBRC_Bulk_Upload`
- **File Extension:** `.xlsx`
- **Maximum File Size:** `5 MB` (`5,242,880` bytes)
- **Maximum Data Rows per Upload:** `999` rows (`Serial Number` `1` through `999`)

## Exact Column Order & Format (Row 1 Headers)

| Col | Exact Header           | Mandatory | Format / Rule                                                                                                                                                   | Safe Auto-Fix                                      |
| --- | ---------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | `Serial Number`        | Yes       | Positive integer `1`–`999`, unique & sequential (`1, 2, 3...`)                                                                                                  | Renumber sequentially (`1..N`)                     |
| 2   | `IEC Branch Sl. No.`   | Yes       | 1 numeric digit (`0`–`9`)                                                                                                                                       | Default blank to `"0"`                             |
| 3   | `IFSC Code`            | Yes       | 11-character Indian IFSC (`^[A-Z]{4}0[A-Z0-9]{6}$`)                                                                                                             | Trim & uppercase                                   |
| 4   | `AD Code`              | Yes       | Alphanumeric up to 7 chars (`^[A-Z0-9]{1,7}$`, zero allowed prefix)                                                                                             | Trim & uppercase                                   |
| 5   | `IRM Number`           | Yes       | Bank IRM reference, `1`–`50` non-empty characters                                                                                                               | Trim whitespace                                    |
| 6   | `IRM Date`             | Yes       | Strictly `DD/MM/YYYY` text (valid calendar date, not future)                                                                                                    | Convert `YYYY-MM-DD` / `DD-MM-YYYY` → `DD/MM/YYYY` |
| 7   | `IRM Currency`         | Yes       | 3-letter ISO currency code (`^[A-Z]{3}$`) matching bank & match currency                                                                                        | Trim & uppercase                                   |
| 8   | `Purpose Code`         | Yes       | 5-character RBI code (`^[A-Z][0-9]{4}$`); `P0101` and `P0108` are disallowed for bulk eBRC generation                                                           | Trim & uppercase                                   |
| 9   | `Amount in FCC`        | Yes       | Positive decimal up to 2 decimal places (`> 0`), stored/computed from integer minor units; sum allocated per `IRM Number` must not exceed available IRM balance | Round string whitespace cleanup                    |
| 10  | `Port Code`            | Yes       | 6-character Indian Customs EDI code present in `fixtures/dgft-port-codes.json`                                                                                  | Trim & uppercase                                   |
| 11  | `Shipping Bill Number` | Yes       | Numeric/alphanumeric Customs SB No. (`^[A-Z0-9/-]{3,20}$`)                                                                                                      | Trim & uppercase                                   |
| 12  | `Shipping Bill Date`   | Yes       | Strictly `DD/MM/YYYY` text (valid calendar date)                                                                                                                | Convert `YYYY-MM-DD` / `DD-MM-YYYY` → `DD/MM/YYYY` |

## Cross-Row & Business Validation Rules

1. **Same-Currency Clubbing Only:** Multiple rows clubbed onto the same `Shipping Bill Number` (or the same `IRM Number`) must share the exact same `IRM Currency`. Mixing currencies is strictly rejected.
2. **IRM Balance Cap:** Total `Amount in FCC` across all rows sharing an `IRM Number` must be `<=` that IRM's remaining available balance (`amount_minor - other_allocated_minor + current_batch_minor`, or `<= total_irm_amount_minor`).
3. **Date Ordering:** `IRM Date` is expected on or after `Shipping Bill Date` unless marked with advance remittance purpose code `P0103`.
4. **Purpose Code Restrictions:** `P0101` and `P0108` cannot be used to generate an eBRC on the DGFT portal.
5. **Tenant & IEC Isolation:** A generated bulk eBRC file is scoped strictly to a single organization (and single selected IEC profile when filtered) and must never include IRMs or Shipping Bills from any other IEC or organization.
6. **Plan Gate:** Free accounts can run full validation and safe auto-fixes (both in-app and via the free public tool), while generating/downloading the Excel requires an active `trial_pro`, `exporter_*`, or `consultant_*` plan.

# Bank IRM / EDPMS Fixtures

> **Synthetic Baseline Notice:** These sample exports in `fixtures/irm/` are synthetic test files modelling DGFT EDPMS and Indian AD-bank IRM export columns until real anonymised consultant/exporter IRM files are added here.

## Included Files

- `irm-dgft-edpms-sample.xlsx`: Multi-row banner + header auto-detection test covering exact 1:1 USD match, near-equal after wire bank charges, 1-to-many split payment, many-to-1 partial payments, and EUR currency non-clubbing test.
- `irm-hdfc-bank-export.csv`: Alternative bank portal CSV header names, `DD/MM/YYYY` and `DD-MM-YYYY` dates, Indian comma grouping (`4,20,000.00`), duplicate invoice numbers, and 1 malformed row (`IRM-BAD-ROW`) to verify loud row-error reporting.
- `irm-expected-bills.json`: Ground-truth Shipping Bill scenario set used by automated unit tests and `docs/irm-matching-report.md`.

# Incentive Rate CSV Fixtures (Synthetic Only)

This folder contains **synthetic test fixtures** used solely for automated unit tests and Playwright E2E tests.

- **Important:** Do NOT use `synthetic-test-rates.csv` in production. Official RoDTEP, Duty Drawback, and RoSCTL schedules must be downloaded from DGFT / CBIC notifications and imported via the Admin Rate Importer after verification.
- Columns required by the admin rate importer:
  `scheme, hs_code, rate_bps, cap_per_unit, uqc, effective_from, effective_to, source_note`

# IRM Import & Matching Report

Generated from `fixtures/irm` (`irm-dgft-edpms-sample.xlsx` and `irm-hdfc-bank-export.csv`).

> **Note:** Sample files in `fixtures/irm` are synthetic baseline exports created until real anonymised DGFT/bank IRM exports are dropped in.

## Summary Counts

| Metric | Count |
| --- | ---: |
| Total Shipping Bills | 9 |
| Imported Valid Remittances | 9 |
| Failed Import Rows Reported | 1 |
| Auto-Confirmed Matches | 7 |
| Review Matches Suggestions | 4 |

## Auto-Confirmed Matches

| SB # | IRM # | Currency | Allocated (minor) | Confidence | Pattern | Explanation |
| --- | --- | --- | ---: | ---: | --- | --- |
| `7458210` | `IRM-HDFC-26001` | USD | 1425000 | 1.0000 | `exact_1to1` | Amount equal; invoice EXP/26/101 found in reference; buyer name match; paid 6d after SB date |
| `7458225` | `IRM-HDFC-26002` | USD | 1197500 | 0.9600 | `near_equal_bank_charges` | Near-equal amount within bank charges (25.00 USD diff); invoice INV-2231 found in reference; buyer name match; paid 6d after SB date |
| `7458501` | `IRM-HDFC-26007` | INR | 42000000 | 1.0000 | `exact_1to1` | Amount equal; invoice EXP-INR-881 found in reference; buyer name match; paid 5d after SB date |
| `7458301` | `IRM-ICICI-26003` | USD | 1000000 | 0.9800 | `split_1_rem_to_many_sbs` | Split payment covers 2 bills summing to 18000.00 USD; invoice INV/26/301 found in reference; buyer name match; paid 9d after SB date |
| `7458302` | `IRM-ICICI-26003` | USD | 800000 | 0.9800 | `split_1_rem_to_many_sbs` | Split payment covers 2 bills summing to 18000.00 USD; invoice INV/26/302 found in reference; buyer name match; paid 8d after SB date |
| `7458401` | `IRM-AXIS-26004` | USD | 600000 | 0.9800 | `partial_many_rems_to_1_sb` | Combined partial settlement (2 IRMs cover SB #7458401); invoice INV/26/401 found in reference; buyer name match; paid 8d after SB date |
| `7458401` | `IRM-AXIS-26005` | USD | 400000 | 0.9800 | `partial_many_rems_to_1_sb` | Combined partial settlement (2 IRMs cover SB #7458401); invoice INV/26/401 found in reference; buyer name match; paid 13d after SB date |

## Sent to Review Matches

| SB # | IRM # | Currency | Proposed (minor) | Confidence | Pattern | Explanation |
| --- | --- | --- | ---: | ---: | --- | --- |
| `7458601` | `IRM-KOTAK-26008` | USD | 850000 | 0.8500 | `exact_1to1` | Amount equal; invoice INV/DUP/900 found in reference (duplicate invoice across multiple bills); buyer name match; paid 9d after SB date |
| `7458602` | `IRM-KOTAK-26009` | USD | 715000 | 0.8500 | `exact_1to1` | Amount equal; invoice INV/DUP/900 found in reference (duplicate invoice across multiple bills); buyer name match; paid 10d after SB date |
| `7458601` | `IRM-KOTAK-26009` | USD | 715000 | 0.6300 | `partial_installment` | Partial payment (84% of remaining bill); invoice INV/DUP/900 found in reference (duplicate invoice across multiple bills); buyer name match; paid 11d after SB date |
| `7458602` | `IRM-KOTAK-26008` | USD | 715000 | 0.5900 | `split_1_rem_to_many_sbs` | Remittance exceeds bill (84% of IRM balance); invoice INV/DUP/900 found in reference (duplicate invoice across multiple bills); buyer name match; paid 8d after SB date |

## Failed Rows Reported During Import

| Row # | IRM # | Failure Reason |
| ---: | --- | --- |
| 5 | `IRM-BAD-ROW` | Invalid or missing remittance date ("31/02/2026"); Remittance amount must be a positive number ("0.00") |

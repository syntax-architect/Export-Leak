# Shipping Bill Parser Accuracy Report

Generated from `fixtures/shipping-bills` (12 multi-layout synthetic fixture PDFs).

> **Note:** Fixtures in `fixtures/shipping-bills` are synthetic multi-layout prints created until real anonymised consultant/exporter PDFs are dropped in.

## Field-Level Precision, Recall & Safe Coverage

| Field | Cases | TP | FP | FN | Flagged for Review | Precision | Recall | Correct or Flagged |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `sbNumber` | 12 | 12 | 0 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| `sbDate` | 12 | 12 | 0 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| `portCode` | 12 | 12 | 0 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| `leoDate` | 9 | 9 | 0 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| `invoiceNo` | 12 | 12 | 0 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| `buyerName` | 11 | 11 | 0 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| `currency` | 12 | 12 | 0 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| `fobMinor` | 12 | 12 | 0 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| `itemHsCodes` | 19 | 17 | 0 | 2 | 2 | 100.0% | 89.5% | 100.0% |

## Document Results

| Fixture | Layout | Expected | Actual | OCR Fallback | Review Fields | Mismatches |
| --- | --- | --- | --- | --- | --- | --- |
| `sb-01-icegate-garment.pdf` | ICEGATE Web Print | `done` | `done` | No | None | None |
| `sb-02-icegate-pharma-multipage.pdf` | ICEGATE Multi-Page Print | `done` | `done` | No | None | None |
| `sb-03-cha-summary-tiles.pdf` | CHA Generated Checklist Summary | `done` | `done` | No | None | None |
| `sb-04-cha-engineering-inr.pdf` | CHA INR Invoice Summary | `done` | `done` | No | None | None |
| `sb-05-ices-edi-textiles.pdf` | ICES EDI Condensed Print | `done` | `done` | No | None | None |
| `sb-06-icegate-leather.pdf` | ICEGATE DD-MMM-YYYY Print | `done` | `done` | No | None | None |
| `sb-07-cha-spices-bulk.pdf` | CHA Bulk Spices Format | `done` | `done` | No | None | None |
| `sb-08-icegate-machinery.pdf` | ICEGATE Copy Before LEO | `done` | `done` | No | None | None |
| `sb-09-cha-chemicals.pdf` | CHA DD MMM YYYY Layout | `done` | `done` | No | None | None |
| `sb-10-icegate-agri-rice.pdf` | ICEGATE Export Print | `done` | `done` | No | None | None |
| `sb-11-scanned-lowtext.pdf` | Scanned Image-Only PDF (OCR Fallback) | `needs_review` | `needs_review` | Yes | items, sbNumber, sbDate, portCode, invoiceNo, buyerName, currency, fobMinor, exchangeRate, schemesClaimed | None |
| `sb-12-uncertain-edge.pdf` | Uncertain Edge Case (Partial HS + FOB Mismatch -> Review Required) | `needs_review` | `needs_review` | No | items[0].hsCode, buyerName, fobMinor, exchangeRate | None |

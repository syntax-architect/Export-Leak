# Shipping Bill Fixture Pack (Synthetic Multi-Layout Baseline)

These 12 PDF fixtures are **SYNTHETIC** test documents created to benchmark multi-layout Indian Customs Shipping Bill parsing (ICEGATE Web Print, ICES 1.5 condensed copy, multi-page Continuation items, CHA Checklist summaries, INR & multi-currency exports, scanned OCR-fallback PDFs, and validation edge cases).

When you obtain real, anonymised Shipping Bill PDFs from partner exporters or EXIM consultants, place them in this folder, add their expected values to `ground-truth.json`, and re-run the parser benchmark test to update `docs/shipping-bill-parser-accuracy.md`.

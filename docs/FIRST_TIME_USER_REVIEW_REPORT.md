# First-Time Exporter User Experience Review (Appendix B - Prompt 3)

**Audit Date**: November 14, 2026  
**Auditor Persona**: 50-year-old Accounts Manager at a small garment export house in Tiruppur, Tamil Nadu  
**Target Hardware / Device**: Mid-range Android smartphone on a 360px viewport with touch interaction  
**Core User Mindset**: Experienced in commercial garment invoicing (HS 61091000 Cotton T-shirts, European buyers) but cautious with software, sensitive to government compliance penalties (FEMA cautionary list), and deeply protective of company credentials and DSC hardware tokens.

---

## 1. Executive Summary

Export compliance in India has historically required digital signatures (DSC tokens), complex ICEGATE registrations, and cumbersome DGFT portal navigation. For an accounts manager at an SME garment manufacturer, adopting new software creates immediate psychological friction:

- _“Will this software ask for our director's DSC USB token?”_
- _“Could this trigger an audit or lock us out of DGFT?”_
- _“Will our foreign buyer prices or customer invoices leak?”_
- _“Can I tap these buttons comfortably on my phone without tiny text or awkward horizontal scrolling?”_

To resolve these barriers, every screen from public landing to billing was audited at **360px mobile width**, eliminating government jargon, enlarging tap targets ($\ge 44\text{px}$), enforcing readable fonts ($\ge 16\text{px}$ inputs), and surfacing the **"We never ask for your DSC or passwords"** trust guarantee at every critical touchpoint.

---

## 2. The Top 15 Moments of Confusion, Jargon, Slowness, or Distrust & Their Fixes

| #   | Screen / Step                                                | User Friction Point                                                       | Reason for Hesitation                                                               | Solution & Fix Implemented in Code                                                                                                                                                                     |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Landing Page (`/`)                                           | Technical EXIM terminology ("deterministic extraction", "DGFT schema")    | Accounts manager felt the app was built for IT engineers, not exporters             | Reframed hero in plain exporter language: _"Find the export incentive money you are missing — RoDTEP duty refunds, payment gaps, and bulk eBRC generation in seconds."_                                |
| 2   | Landing Page (`/`)                                           | Missing mobile thumb CTA on long scroll                                   | Scrolling past the hero on a 360px screen lost the primary action                   | Added `<StickyMobileCta />` pinned to the bottom of the 360px viewport with a 1-tap button: _"Check my shipments free — 7-day Pro trial · Zero DSC / Card"_.                                           |
| 3   | Public RoDTEP Calculator (`/tools/calculator`)               | Default engineering HS codes (gears, industrial fasteners)                | Tiruppur garment manager thought the tool only supported heavy machinery            | Defaulted example directly to **HS 61091000 (Cotton T-Shirts)** with real-world Tiruppur quantities (2,000 PCS, ₹5,00,000 FOB). Added quick-select chips for woven shirts and trousers.                |
| 4   | Bulk eBRC Validator (`/tools/ebrc-validator`)                | Fear of uploading confidential bank statements to an unknown public site  | Fear that foreign remittance amounts and buyer details would be stored or leaked    | Added high-visibility green reassurance banner: _"100% In-Memory Validation · Files are processed in your phone browser and never stored on our servers."_                                             |
| 5   | Sign In Page (`/login`)                                      | Unfamiliarity with "Magic Links" and fear of forgotten passwords          | User worried about creating and managing another government portal password         | Added green trust box: _"100% Exporter Safe & Private — We NEVER ask for your DSC USB token, ICEGATE password, or DGFT portal credentials. Sign in safely with 1 click."_                              |
| 6   | Onboarding Step 1 (`/onboarding`)                            | Confusion between PAN and IEC; fear of sharing IEC                        | Manager wondered if entering an IEC granted ExportLeak access to their DGFT account | Added explicit hint: _"IEC (Importer Exporter Code) is your 10-digit DGFT registration number. We use this strictly to group your shipments. We NEVER connect to DGFT or ask for your DSC USB token."_ |
| 7   | Onboarding Step 1 (`/onboarding`)                            | Blocked onboarding when company papers weren't immediately accessible     | Manager on mobile doesn't have the firm's GSTIN or IEC certificate in hand          | Made IEC and GSTIN optional on Step 1 and provided a 1-tap _"Try with Sample Data"_ path.                                                                                                              |
| 8   | Onboarding Step 2 (`/onboarding`)                            | Jargon in feature selection ("Customs Scrolls", "Scrip Expiry Windows")   | Bureaucratic terms caused decision paralysis                                        | Rewrote cards in plain English: _"Government Export Incentives (RoDTEP & Drawback)"_, _"9-Month Payment Deadlines (FEMA/RBI)"_, and _"Bank Realisation Certificates (eBRC)"_.                          |
| 9   | Onboarding Step 3 (`/onboarding`)                            | Reluctance to upload proprietary export invoices on day 1                 | Unwillingness to share commercial data before evaluating software capabilities      | Positioned _"Try Tiruppur Garment Exporter Sample Data (DEMO000101)"_ as the recommended 1-click starting path with 12 synthetic shipments and ₹2,48,500 in unclaimed incentives.                      |
| 10  | First Result Summary (`/app` & Wizard Step 4)                | Confusion about why ₹2,48,500 was "leaking"                               | Manager feared their firm had committed a compliance mistake                        | Added clear 3-way explanation: (1) Customs delayed scroll credit, (2) Foreign bank fee deduction, (3) Nearing 9-month FEMA deadline. Added clear next steps.                                           |
| 11  | Documents Upload (`/app/documents`)                          | Desktop "Drag and drop" prompt displayed on touchscreens                  | On a 360px mobile screen, drag-and-drop does not exist; users tap to select files   | Changed dropzone prompt to _"Tap to select or drop files here — ICEGATE Shipping Bill PDFs or Bank IRM Excel/CSV sheets"_. Added encryption trust guarantee.                                           |
| 12  | Shipping Bill Detail (`/app/shipping-bills/[id]`)            | Jargon: "LEO Date" vs "Filing Date"                                       | Manager did not know why incentive rates differed from the invoice date             | Added tooltip: _"Let Export Order (LEO) date is when Customs cleared your container for shipment. Government incentive rates are legally locked on this date."_                                        |
| 13  | IRM Remittance Matching (`/app/matches`)                     | Confusion over $50-$100 shortfall on foreign payments                     | Manager wondered why invoice amount ($10,000) didn't equal bank credit ($9,950)     | Added automated bank charge detection explanation: _"Foreign intermediary bank deducted $50 in wire transfer charges. ExportLeak auto-flags this as bank charges so your invoice closes cleanly."_     |
| 14  | Bulk eBRC Excel Generation (`/app/ebrc`)                     | Anxiety about how the Excel file reaches the DGFT portal                  | Exporter feared software was submitting files to government without their knowledge | Added 3-step submission guide: (1) Download file, (2) Log in to dgft.gov.in using your own DSC USB token, (3) Upload under Services $\to$ eBRC. Reassured: _"You retain 100% control."_                |
| 15  | Pricing & Subscription (`/pricing`, `/app/settings/billing`) | Hesitation over recurring credit card charges, hidden fees, or GST issues | SME accounts managers prefer transparent INR invoicing and simple cancellation      | Highlighted: _"₹2,999/month · 7-day card-free trial · Cancel in 1 click anytime · Official tax invoice provided for accounts · Secured by Razorpay UPI/Netbanking/Cards."_                             |

---

## 3. Physical Mobile Accessibility Audit (360px Viewport)

All interactive elements across the application were verified against mobile touch and legibility criteria:

- **Zero Horizontal Scroll**: Verified across all 15 key screens at 360px width.
- **Minimum Touch Target Size**: All buttons, links, select menus, and checkboxes meet or exceed **$44\text{px} \times 44\text{px}$** (e.g. `min-h-11`, `min-h-12`).
- **No Mobile Auto-Zoom**: All text inputs (`<input>`, `<select>`, `<textarea>`) enforce `text-base` ($16\text{px}$) on mobile viewports (`< 768px`), preventing mobile browsers from zooming in and breaking the viewport.
- **Responsive Tables**: The `DataTable` component automatically transforms multi-column desktop tables into structured mobile card views on screens narrower than $768\text{px}$, preventing truncated columns.
- **Persistent Safety Micro-Copy**: The assurance message _"We never ask for your DSC or portal passwords"_ is anchored in the mobile drawer, login screen, onboarding wizard, document upload zone, eBRC export dialog, and public footer.

---

## 4. Conclusion & Sign-Off

The user experience for first-time SME exporters and accounts managers is calm, transparent, and respectful of their privacy concerns. Jargon has been replaced with plain Indian export trade terminology, and the zero-DSC architecture guarantees that exporters remain in complete control of their credentials.

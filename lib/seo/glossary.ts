export interface GlossaryTerm {
  slug: string;
  term: string;
  fullTitle: string;
  category: "Incentives" | "Banking & FEMA" | "Customs & DGFT" | "Documentation";
  shortDescription: string;
  explanation: string[];
  statutoryRules: string[];
  commonMistakes: { title: string; consequence: string; fix: string }[];
  howExportLeakHelps: string;
  relatedTool?: { title: string; href: string; ctaText: string };
  lastReviewed: string; // ISO date
  reviewerNote: string;
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    slug: "rodtep",
    term: "RoDTEP",
    fullTitle: "Remission of Duties and Taxes on Exported Products",
    category: "Incentives",
    shortDescription:
      "A WTO-compliant scheme reimbursing embedded central, state, and local duties (such as electricity duty and fuel VAT) incurred in the export supply chain.",
    explanation: [
      "The RoDTEP scheme was introduced by the Ministry of Commerce & Industry under the Foreign Trade Policy to replace MEIS. It refunds un-rebated taxes and levies that are not refunded under GST or Duty Drawback.",
      "Rebates are calculated as a percentage of the FOB value of the exported goods, subject to a value cap per unit (e.g. ₹35 per piece or ₹40 per kg). The rates are published by the Directorate General of Foreign Trade (DGFT) in Appendix 4R.",
      "Credits are issued in the form of transferable electronic duty credit scrips (e-scrips) directly into the exporter's customs ledger on ICEGATE.",
    ],
    statutoryRules: [
      "Governed by DGFT Notification No. 19/2015-2020 and updated Appendix 4R schedules.",
      "Exporter must declare 'RODTEPY' in the Shipping Bill declaration at the time of export filing; omission prevents benefit claiming.",
      "Credits must be claimed through an electronic scroll generated on the ICEGATE portal.",
    ],
    commonMistakes: [
      {
        title: "Failing to check the 'RODTEPY' flag on the Shipping Bill",
        consequence:
          "Customs treats the shipment as ineligible, losing 1.5%–4% of FOB value forever.",
        fix: "Instruct your Customs Broker (CHA) to mandatorily check the RoDTEP claim box before filing the checklist.",
      },
      {
        title: "Assuming percentage applies without checking the unit cap",
        consequence:
          "Overestimating export margins because high-value items hit the rupee-per-unit ceiling.",
        fix: "Use an automated rate calculator to verify whether your shipment hits the per-unit cap.",
      },
      {
        title: "Leaving e-scrips ungenerated on the ICEGATE portal",
        consequence: "Ledger scrolls expire or remain unutilised, stranding working capital.",
        fix: "Track scroll issuance weekly and generate e-scrips promptly upon scroll credit.",
      },
    ],
    howExportLeakHelps:
      "ExportLeak cross-references every 8-digit HS code on your Shipping Bills with official DGFT rate schedules, calculates your exact entitlement with caps, and alerts you when customs credits less than what you earned.",
    relatedTool: {
      title: "Free RoDTEP & Drawback Calculator",
      href: "/tools/calculator",
      ctaText: "Calculate RoDTEP Rate",
    },
    lastReviewed: "2026-11-12",
    reviewerNote:
      "Verified against DGFT Appendix 4R Notification schedules. Maintained by EXIM Compliance Specialist.",
  },
  {
    slug: "ebrc",
    term: "eBRC",
    fullTitle: "Electronic Bank Realisation Certificate",
    category: "Banking & FEMA",
    shortDescription:
      "The official digital certificate issued through DGFT confirming that an exporter has received inward foreign exchange payment against an export shipment.",
    explanation: [
      "The electronic Bank Realisation Certificate (eBRC) is the foundational proof of export realisation required by DGFT to grant export incentives and close shipping bills.",
      "Under DGFT's upgraded eBRC system, banks transmit Inward Remittance Messages (IRMs) to DGFT, and exporters (or their authorized consultants) link those IRMs to specific Shipping Bills using the Bulk eBRC Excel upload.",
      "Once an eBRC is generated, DGFT matches the data with ICEGATE shipping bills and updates RBI's EDPMS portal, certifying full statutory compliance.",
    ],
    statutoryRules: [
      "Mandated under Chapter 2 of the Foreign Trade Policy (FTP).",
      "Only payments received through authorised banking channels with eligible RBI export purpose codes (e.g. P0102) qualify for eBRC generation.",
      "DGFT Bulk eBRC Excel submissions must strictly follow the official layout with valid AD codes, IFSCs, and same-currency remittances.",
    ],
    commonMistakes: [
      {
        title: "Clubbing remittances in different currencies into one eBRC row",
        consequence:
          "DGFT bulk upload fails with validation error 'Cross-currency clubbing not allowed'.",
        fix: "Ensure each eBRC row matches the exact currency of the underlying IRM.",
      },
      {
        title: "Uploading invalid or missing Authorised Dealer (AD) codes",
        consequence: "Entire batch of 50+ eBRC rows gets rejected by the portal.",
        fix: "Validate 7-digit AD codes against RBI's master bank directory before generating the upload file.",
      },
      {
        title: "Delaying eBRC filing beyond the 9-month FEMA realisation period",
        consequence: "Shipping bill gets flagged on RBI EDPMS, leading to bank caution-listing.",
        fix: "Generate and upload bulk eBRCs within 30 days of receiving inward remittance.",
      },
    ],
    howExportLeakHelps:
      "ExportLeak automatically matches bank IRM exports with your Shipping Bill PDFs and produces the exact DGFT bulk eBRC Excel format without manual transcription or format errors.",
    relatedTool: {
      title: "Free Bulk eBRC Excel Validator",
      href: "/tools/ebrc-validator",
      ctaText: "Validate eBRC Excel",
    },
    lastReviewed: "2026-11-12",
    reviewerNote:
      "Reviewed against DGFT Bulk eBRC guidelines and RBI Master Direction on Export of Goods.",
  },
  {
    slug: "irm",
    term: "IRM",
    fullTitle: "Inward Remittance Message",
    category: "Banking & FEMA",
    shortDescription:
      "A standardised electronic notification generated by an Authorised Dealer (AD) bank when an exporter receives foreign exchange payment from an overseas buyer.",
    explanation: [
      "When foreign buyers transfer payment into an Indian exporter's EEFC or current account, the receiving bank generates an Inward Remittance Message (IRM) and reports it to the RBI EDPMS portal.",
      "Each IRM contains a unique bank reference number, remittance date, currency, amount received, remitter name, and an RBI Purpose Code denoting the nature of the transaction.",
      "Exporters must link the IRM to their shipping bills to generate eBRCs and discharge their statutory realisation obligations under FEMA.",
    ],
    statutoryRules: [
      "Governed by RBI Master Direction – Export of Goods and Services.",
      "AD banks must report IRMs to EDPMS within the prescribed statutory timeframe.",
      "An IRM can be utilized in full or partially across multiple shipping bills, provided the allocated amounts do not exceed the remitted balance.",
    ],
    commonMistakes: [
      {
        title: "Over-allocating the IRM balance across multiple shipping bills",
        consequence:
          "DGFT rejects the eBRC upload because total allocated sum exceeds the remittance.",
        fix: "Track utilised vs. remaining unutilised balance on every IRM systematically.",
      },
      {
        title: "Selecting wrong purpose codes for merchanting or advance remittances",
        consequence: "Bank flags transaction for discrepancy; GST refund or eBRC gets withheld.",
        fix: "Verify purpose code (e.g. P0102 for standard goods, P0103 for advance) with your bank before submitting documentation.",
      },
    ],
    howExportLeakHelps:
      "ExportLeak tracks the remaining balance of every IRM, prevents over-allocation down to the exact paisa/cent, and matches buyer names and invoice numbers with intelligent fuzzy algorithms.",
    relatedTool: {
      title: "Free RoDTEP & Drawback Calculator",
      href: "/tools/calculator",
      ctaText: "Check Rate Calculator",
    },
    lastReviewed: "2026-11-12",
    reviewerNote:
      "Verified with current RBI EDPMS reporting specifications and AD category banking workflows.",
  },
  {
    slug: "edpms",
    term: "EDPMS",
    fullTitle: "Export Data Processing and Monitoring System",
    category: "Banking & FEMA",
    shortDescription:
      "The Reserve Bank of India's centralized online monitoring platform that tracks all shipping bills and their corresponding inward remittances.",
    explanation: [
      "EDPMS was launched by RBI to integrate customs export data from ICEGATE with banking remittance data from Authorized Dealer (AD) banks.",
      "When customs clears a Shipping Bill, ICEGATE automatically pushes the shipment details to EDPMS. When the buyer pays, the bank pushes the IRM to EDPMS.",
      "If a Shipping Bill remains un-realised after the statutory FEMA deadline (currently 9 months), the system automatically flags the exporter as 'caution-listed'.",
    ],
    statutoryRules: [
      "Operated under RBI FEMA Regulations, 2015 (Notification No. FEMA 23(R)/2015-RB).",
      "Statutory realization window is 9 months from the date of shipment (15 months for status holders or warehouse exports).",
      "Caution-listed exporters lose the privilege of dispatching goods without advance payment or letter of credit.",
    ],
    commonMistakes: [
      {
        title: "Assuming the bank will automatically close the Shipping Bill in EDPMS",
        consequence:
          "Shipments remain open for years; exporter gets surprise caution-listing notice from RBI.",
        fix: "Regularly audit your open EDPMS entries and submit eBRC proofs directly to your AD bank.",
      },
      {
        title: "Ignoring bank deduction charges that cause small balance mismatches",
        consequence:
          "Shipping bill stays 99% matched with $50 open, triggering automated EDPMS flags.",
        fix: "Obtain bank charge write-off certificates for deductions within permitted regulatory limits.",
      },
    ],
    howExportLeakHelps:
      "ExportLeak runs a daily statutory countdown on all open shipping bills, alerts you at 90, 60, 30, and 7 days before EDPMS caution-listing, and prepares the documentation to close entries on time.",
    relatedTool: {
      title: "Free eBRC Excel Validator",
      href: "/tools/ebrc-validator",
      ctaText: "Validate eBRC File",
    },
    lastReviewed: "2026-11-12",
    reviewerNote:
      "Checked against RBI Master Direction on Monitoring of Export Realisation (EDPMS).",
  },
  {
    slug: "duty-drawback",
    term: "Duty Drawback",
    fullTitle: "Customs & Central Excise Duty Drawback",
    category: "Incentives",
    shortDescription:
      "Rebate of customs and central excise duties paid on imported or indigenous inputs used in the manufacture of export products.",
    explanation: [
      "Duty Drawback (DBK) is administered under Section 75 of the Customs Act, 1962. It refunds duties on raw materials used in making exported goods.",
      "Under the All Industry Rates (AIR) schedule, the government announces standard drawback rates (percentages of FOB value with per-unit caps) for thousands of tariff items.",
      "Unlike RoDTEP which is issued as an electronic scrip, Duty Drawback is credited directly as cash into the exporter's bank account registered with ICEGATE.",
    ],
    statutoryRules: [
      "Section 74 and Section 75 of the Customs Act, 1962.",
      "Shipping Bill acts as the claim for drawback; must be declared with Drawback code.",
      "Customs requires valid Let Export Order (LEO) and bank account validation before scroll generation.",
    ],
    commonMistakes: [
      {
        title: "Not noticing bank account invalidation on ICEGATE",
        consequence:
          "Customs generates the scroll, but the electronic transfer fails silently for months.",
        fix: "Check your PFMS/ICEGATE bank account validation status quarterly.",
      },
      {
        title: "Mismatch between Drawback tariff item and 8-digit HS code",
        consequence: "Customs rejects claim or credits at the lower fallback rate.",
        fix: "Verify that your shipping bill invoice description exactly matches the AIR schedule heading.",
      },
    ],
    howExportLeakHelps:
      "ExportLeak tracks expected drawback credits, reconciles them with your bank credit statements, and flags short-payments or missing scrolls instantly.",
    relatedTool: {
      title: "Free RoDTEP & Drawback Calculator",
      href: "/tools/calculator",
      ctaText: "Calculate Drawback Rate",
    },
    lastReviewed: "2026-11-12",
    reviewerNote:
      "Verified against the latest CBIC All Industry Rates (AIR) of Duty Drawback Schedule.",
  },
  {
    slug: "duty-credit-scrip",
    term: "Duty Credit Scrip",
    fullTitle: "DGFT Duty Credit Scrip (e-Scrip)",
    category: "Incentives",
    shortDescription:
      "Tradable digital instruments issued under RoDTEP, RoSCTL, or legacy schemes (MEIS/SEIS) used to pay basic customs duty on imports or sold for cash.",
    explanation: [
      "Duty credit scrips are electronic credit certificates created in the exporter's ledger on the ICEGATE portal under schemes like RoDTEP and RoSCTL.",
      "Scrips can either be utilized by the exporter to pay Basic Customs Duty (BCD) on imported cargo, or transferred electronically to another importer through the ICEGATE scrip transfer module for liquid cash.",
      "Crucially, duty credit scrips carry a strict statutory validity period (typically 1 to 2 years from generation), after which unutilized credits lapse completely.",
    ],
    statutoryRules: [
      "Governed by Foreign Trade Policy and Customs Electronic Duty Credit Ledger Regulations.",
      "Valid for a fixed period from the date of generation; no extension is generally granted.",
      "Freely transferable to other registered ICEGATE entities with IEC numbers.",
    ],
    commonMistakes: [
      {
        title: "Letting scrips sit in the ledger past their expiration date",
        consequence:
          "Scrip status turns 'expired', completely wiping out tens of thousands of rupees.",
        fix: "Set up automated expiry reminders 90, 30, and 7 days prior to expiry.",
      },
      {
        title: "Selling scrips below market discount rate",
        consequence: "Loss of 2%–5% extra margin on scrip liquidation.",
        fix: "Monitor prevailing scrip market premiums before transferring on ICEGATE.",
      },
    ],
    howExportLeakHelps:
      "ExportLeak continuously monitors your scrip ledger, calculates days remaining until expiry, and sends proactive notifications so you never allow a scrip to expire worthless.",
    relatedTool: {
      title: "Free RoDTEP & Drawback Calculator",
      href: "/tools/calculator",
      ctaText: "Check Rate Calculator",
    },
    lastReviewed: "2026-11-12",
    reviewerNote:
      "Verified against Customs Electronic Duty Credit Ledger Regulations and DGFT circulars.",
  },
  {
    slug: "iec",
    term: "IEC",
    fullTitle: "Importer Exporter Code",
    category: "Customs & DGFT",
    shortDescription:
      "A 10-digit alphanumeric code issued by the Directorate General of Foreign Trade (DGFT) mandatory for commercial import and export activities in India.",
    explanation: [
      "The Importer Exporter Code (IEC) is the primary business identifier for any business entity engaging in foreign trade in India. It is aligned with the entity's Permanent Account Number (PAN).",
      "Without an active IEC, customs will not grant clearance for shipments, banks cannot process inward or outward trade remittances, and DGFT cannot issue export incentives.",
      "All IEC holders are required to update and confirm their IEC profile electronically on the DGFT portal annually between April and June.",
    ],
    statutoryRules: [
      "Issued under Section 7 of the Foreign Trade (Development and Regulation) Act, 1992.",
      "Mandatory annual electronic verification on DGFT portal between April and June.",
      "Failure to update leads to automatic de-activation of the IEC.",
    ],
    commonMistakes: [
      {
        title: "Missing the annual April–June IEC renewal window",
        consequence: "IEC gets automatically deactivated, stalling customs clearances at ports.",
        fix: "Mark April 15 on your calendar to re-confirm details on the DGFT portal.",
      },
      {
        title: "Operating without linking AD bank codes to the IEC",
        consequence: "Bank cannot transmit IRMs to DGFT, preventing eBRC generation.",
        fix: "Ensure all Authorized Dealer (AD) bank branches are registered under your IEC profile on ICEGATE.",
      },
    ],
    howExportLeakHelps:
      "ExportLeak supports managing multiple IECs in one account, validates 10-character alphanumeric IEC formatting, and tracks statutory deadlines across all your entities.",
    relatedTool: {
      title: "Free Bulk eBRC Excel Validator",
      href: "/tools/ebrc-validator",
      ctaText: "Validate eBRC File",
    },
    lastReviewed: "2026-11-12",
    reviewerNote: "Checked against DGFT Trade Notice No. 33/2021-22 on annual IEC updation.",
  },
  {
    slug: "leo",
    term: "LEO",
    fullTitle: "Let Export Order",
    category: "Customs & DGFT",
    shortDescription:
      "The final customs clearance order issued by an Appraiser or Superintendent of Customs permitting the export vessel or flight to load the cargo.",
    explanation: [
      "Let Export Order (LEO) marks the official completion of customs assessment, examination, and cargo loading permission at the port of export.",
      "The LEO date is critical in Indian EXIM because statutory compliance periods—including the RoDTEP entitlement date, currency conversion exchange rates, and the 9-month FEMA realisation clock—are calculated from or tightly linked to the LEO and shipment dates.",
      "Once LEO is granted, the Shipping Bill data is electronically transmitted from ICEGATE to RBI EDPMS and DGFT.",
    ],
    statutoryRules: [
      "Section 51 of the Customs Act, 1962.",
      "Cargo cannot be loaded onto aircraft or ship until LEO is formally granted in ICEGATE.",
      "LEO date triggers the release of customs export incentive scrolls.",
    ],
    commonMistakes: [
      {
        title: "Assuming Shipping Bill filing date is the realization start date",
        consequence: "Miscalculating the FEMA 9-month deadline by weeks.",
        fix: "Always calculate statutory deadlines from the official LEO and bill dates.",
      },
      {
        title: "Not checking whether LEO generated an electronic scroll",
        consequence: "Shipment clears customs but scroll generation stalls due to system hold.",
        fix: "Monitor shipping bill status until it changes from 'LEO' to 'eBRC Ready'.",
      },
    ],
    howExportLeakHelps:
      "ExportLeak parses LEO dates directly from your Shipping Bill PDFs and establishes a timeline of every milestone from filing to cash credit.",
    relatedTool: {
      title: "Free Shipping Bill Extractor",
      href: "/tools/shipping-bill-extractor",
      ctaText: "Extract Shipping Bill",
    },
    lastReviewed: "2026-11-12",
    reviewerNote:
      "Verified against Customs Cargo Handling Regulations and ICEGATE data interfaces.",
  },
  {
    slug: "fema-realisation",
    term: "FEMA Realisation Window",
    fullTitle: "FEMA Statutory 9-Month Export Realisation Window",
    category: "Banking & FEMA",
    shortDescription:
      "The statutory time limit prescribed by the Reserve Bank of India under FEMA regulations within which full export proceeds must be realised and repatriated to India.",
    explanation: [
      "Under Regulation 9 of the Foreign Exchange Management (Export of Goods and Services) Regulations, full export value must be received and repatriated to India within 9 months from the date of export.",
      "For exports to warehouses established outside India, the period is extended to 15 months with prior permission.",
      "If export proceeds are not received within 9 months, the exporter must either apply to the AD bank for an extension of time or initiate formal write-off proceedings under permissible RBI limits.",
    ],
    statutoryRules: [
      "Foreign Exchange Management Act (FEMA), 1999 & Notification No. FEMA 23(R)/2015-RB.",
      "Statutory limit: 9 months for general merchandise exports.",
      "Un-realised shipments after 9 months trigger automated EDPMS caution-listing.",
    ],
    commonMistakes: [
      {
        title: "Waiting until day 270 before following up with foreign buyers",
        consequence: "Realisation exceeds 9 months; bank files discrepancy in EDPMS.",
        fix: "Set up automated alerts at 90, 60, and 30 days before the deadline.",
      },
      {
        title: "Failing to apply for an extension with the AD bank before the deadline",
        consequence:
          "Exporter loses the automatic entitlement to extension, requiring cumbersome manual filings.",
        fix: "Submit Form ETX to your Authorized Dealer bank at least 15 days before the 9-month expiry.",
      },
    ],
    howExportLeakHelps:
      "ExportLeak features a dedicated statutory deadline engine with color-coded countdown indicators (green > 90d, amber 30-90d, red < 30d) and automated email alerts.",
    relatedTool: {
      title: "Free Bulk eBRC Excel Validator",
      href: "/tools/ebrc-validator",
      ctaText: "Validate eBRC File",
    },
    lastReviewed: "2026-11-12",
    reviewerNote: "Certified against RBI Master Direction on Export Realisation Timeframe.",
  },
  {
    slug: "ad-code",
    term: "AD Code",
    fullTitle: "Authorised Dealer (AD) Code & Bank Registration",
    category: "Customs & DGFT",
    shortDescription:
      "A 7-digit numerical code issued by the Reserve Bank of India to an Authorized Dealer bank branch, registered at customs ports for export clearance.",
    explanation: [
      "An Authorised Dealer (AD) Code is a unique 7-digit identifier assigned by RBI to a bank branch dealing in foreign exchange.",
      "To export goods through any Indian port (sea port, airport, or inland container depot ICD), the exporter must register their bank branch's AD Code with customs at that specific port.",
      "When a Shipping Bill is filed, the registered AD Code and IFSC ensure that export proceeds and customs duty drawbacks flow into the verified bank account.",
    ],
    statutoryRules: [
      "Customs Public Notices on Electronic Port Registration of AD Codes.",
      "Registration must be completed on ICEGATE with digital signature endorsement.",
      "Each customs port of export requires prior AD code registration before filing.",
    ],
    commonMistakes: [
      {
        title: "Filing Shipping Bill at a new port before AD code registration",
        consequence: "Cargo is halted at customs; shipment misses vessel cutoff.",
        fix: "Apply for one-time AD code registration on ICEGATE at least 3 days before moving cargo.",
      },
      {
        title: "Using wrong IFSC code that differs from the port registration",
        consequence: "Drawback credit bounces and eBRC validation rejects the submission.",
        fix: "Ensure exact match between AD code, bank IFSC, and port code on every eBRC row.",
      },
    ],
    howExportLeakHelps:
      "ExportLeak checks every row of your Bulk eBRC Excel for valid 7-digit AD codes and matching IFSCs, catching mismatches before they cause DGFT portal rejections.",
    relatedTool: {
      title: "Free Bulk eBRC Excel Validator",
      href: "/tools/ebrc-validator",
      ctaText: "Validate eBRC File",
    },
    lastReviewed: "2026-11-12",
    reviewerNote: "Verified against DGFT & ICEGATE AD Code bank master directory requirements.",
  },
];

export function getGlossaryTerm(slug: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find((t) => t.slug === slug);
}

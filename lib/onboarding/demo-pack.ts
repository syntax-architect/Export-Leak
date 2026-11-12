import crypto from "node:crypto";
import type {
  AlertSeverity,
  DocumentKind,
  IncentiveScheme,
  ShippingBillStatus,
} from "@/lib/database.types";

export const DEMO_IEC_CODE = "DEMO000101";
export const DEMO_IEC_LEGAL_NAME = "Demo Kaveri Exports Pvt Ltd";

function isoDateOffset(daysOffset: number): string {
  const date = new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "11";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export interface DemoPackData {
  iec: {
    id: string;
    orgId: string;
    iecCode: string;
    legalName: string;
    gstin: string;
    adBankName: string;
    defaultCurrency: string;
  };
  documents: Array<{
    id: string;
    iecId: string;
    kind: DocumentKind;
    storagePath: string;
    sha256: string;
    originalName: string;
    parseStatus: "done";
    uploadedBy: string;
  }>;
  shippingBills: Array<{
    id: string;
    iecId: string;
    documentId: string;
    sbNumber: string;
    sbDate: string;
    portCode: string;
    leoDate: string;
    invoiceNo: string;
    buyerName: string;
    currency: string;
    fobMinor: number;
    exchangeRate: number;
    schemesClaimed: IncentiveScheme[];
    status: ShippingBillStatus;
    realisationDueDate: string;
  }>;
  items: Array<{
    id: string;
    shippingBillId: string;
    hsCode: string;
    description: string;
    quantity: number;
    uqc: string;
    fobMinor: number;
    fieldConfidence: Record<string, unknown>;
  }>;
  remittances: Array<{
    id: string;
    iecId: string;
    irmNumber: string;
    bankName: string;
    remittanceDate: string;
    currency: string;
    amountMinor: number;
    utilisedMinor: number;
    raw: Record<string, unknown>;
  }>;
  matches: Array<{
    id: string;
    shippingBillId: string;
    remittanceId: string;
    matchedMinor: number;
    method: "auto" | "manual";
    confidence: number;
    confirmedBy: string;
  }>;
  expectations: Array<{
    id: string;
    shippingBillId: string;
    scheme: IncentiveScheme;
    expectedMinor: number;
    calcDetail: Record<string, unknown>;
  }>;
  credits: Array<{
    id: string;
    shippingBillId: string;
    scheme: IncentiveScheme;
    creditedMinor: number;
    creditedOn: string;
    sourceDocumentId: string;
  }>;
  scrips: Array<{
    id: string;
    iecId: string;
    scripNumber: string;
    scheme: IncentiveScheme;
    faceMinor: number;
    generatedOn: string;
    expiresOn: string;
    status: "active";
  }>;
  alerts: Array<{
    id: string;
    iecId: string;
    kind: string;
    severity: AlertSeverity;
    shippingBillId: string | null;
    dueOn: string;
  }>;
}

/**
 * Generates sanitised synthetic demo data scoped to a single organization.
 * Incentive amounts here are pre-labelled synthetic sample numbers rather than
 * hard-coded official rate schedules.
 */
export function buildSanitisedDemoPack(orgId: string, userId: string): DemoPackData {
  const iecId = crypto.randomUUID();
  const docSbId = crypto.randomUUID();
  const docIrmId = crypto.randomUUID();
  const docScrollId = crypto.randomUUID();

  const sb1 = crypto.randomUUID();
  const sb2 = crypto.randomUUID();
  const sb3 = crypto.randomUUID();
  const sb4 = crypto.randomUUID();

  const irm1 = crypto.randomUUID();
  const irm2 = crypto.randomUUID();

  const sha = (label: string) =>
    crypto.createHash("sha256").update(`${iecId}:${label}`).digest("hex");

  return {
    iec: {
      id: iecId,
      orgId,
      iecCode: DEMO_IEC_CODE,
      legalName: DEMO_IEC_LEGAL_NAME,
      gstin: "33AAACD0001A1Z5",
      adBankName: "Demo State Bank AD",
      defaultCurrency: "INR",
    },
    documents: [
      {
        id: docSbId,
        iecId,
        kind: "shipping_bill",
        storagePath: `${orgId}/${iecId}/${docSbId}.pdf`,
        sha256: sha("demo-sb"),
        originalName: "demo-shipping-bills-oct.pdf",
        parseStatus: "done",
        uploadedBy: userId,
      },
      {
        id: docIrmId,
        iecId,
        kind: "irm_export",
        storagePath: `${orgId}/${iecId}/${docIrmId}.pdf`,
        sha256: sha("demo-irm"),
        originalName: "demo-irm-export-oct.csv",
        parseStatus: "done",
        uploadedBy: userId,
      },
      {
        id: docScrollId,
        iecId,
        kind: "scroll",
        storagePath: `${orgId}/${iecId}/${docScrollId}.pdf`,
        sha256: sha("demo-scroll"),
        originalName: "demo-rodtep-scroll.csv",
        parseStatus: "done",
        uploadedBy: userId,
      },
    ],
    shippingBills: [
      {
        id: sb1,
        iecId,
        documentId: docSbId,
        sbNumber: "DEMO-849201",
        sbDate: isoDateOffset(-55),
        portCode: "INTUT6",
        leoDate: isoDateOffset(-53),
        invoiceNo: "DEMO-INV-101",
        buyerName: "Demo Nordic Apparel AB",
        currency: "USD",
        fobMinor: 1850000,
        exchangeRate: 84.0,
        schemesClaimed: ["rodtep", "drawback"],
        status: "matched",
        realisationDueDate: isoDateOffset(215),
      },
      {
        id: sb2,
        iecId,
        documentId: docSbId,
        sbNumber: "DEMO-849202",
        sbDate: isoDateOffset(-225),
        portCode: "INMAA4",
        leoDate: isoDateOffset(-223),
        invoiceNo: "DEMO-INV-102",
        buyerName: "Demo EuroHome Textiles GmbH",
        currency: "EUR",
        fobMinor: 2400000,
        exchangeRate: 91.5,
        schemesClaimed: ["rodtep"],
        status: "pending",
        realisationDueDate: isoDateOffset(45),
      },
      {
        id: sb3,
        iecId,
        documentId: docSbId,
        sbNumber: "DEMO-849203",
        sbDate: isoDateOffset(-35),
        portCode: "INNSA1",
        leoDate: isoDateOffset(-33),
        invoiceNo: "DEMO-INV-103",
        buyerName: "Demo Albion Retail Ltd",
        currency: "GBP",
        fobMinor: 1920000,
        exchangeRate: 106.0,
        schemesClaimed: ["rodtep", "drawback"],
        status: "ebrc_ready",
        realisationDueDate: isoDateOffset(235),
      },
      {
        id: sb4,
        iecId,
        documentId: docSbId,
        sbNumber: "DEMO-849204",
        sbDate: isoDateOffset(-20),
        portCode: "INTUT6",
        leoDate: isoDateOffset(-18),
        invoiceNo: "DEMO-INV-104",
        buyerName: "Demo Pacific Essentials Inc",
        currency: "USD",
        fobMinor: 1200000,
        exchangeRate: 84.2,
        schemesClaimed: ["rodtep"],
        status: "closed",
        realisationDueDate: isoDateOffset(250),
      },
    ],
    items: [
      {
        id: crypto.randomUUID(),
        shippingBillId: sb1,
        hsCode: "61091000",
        description: "Demo Cotton Knitted T-Shirts",
        quantity: 650,
        uqc: "PCS",
        fobMinor: 1850000,
        fieldConfidence: { hs_code: { score: 0.99, page: 1 }, isSyntheticDemo: true },
      },
      {
        id: crypto.randomUUID(),
        shippingBillId: sb2,
        hsCode: "63026090",
        description: "Demo Cotton Kitchen Linen",
        quantity: 1200,
        uqc: "KGS",
        fobMinor: 2400000,
        fieldConfidence: { hs_code: { score: 0.98, page: 2 }, isSyntheticDemo: true },
      },
      {
        id: crypto.randomUUID(),
        shippingBillId: sb3,
        hsCode: "61051010",
        description: "Demo Mens Woven Cotton Shirts",
        quantity: 900,
        uqc: "PCS",
        fobMinor: 1920000,
        fieldConfidence: { hs_code: { score: 0.97, page: 3 }, isSyntheticDemo: true },
      },
      {
        id: crypto.randomUUID(),
        shippingBillId: sb4,
        hsCode: "61091000",
        description: "Demo Organic Cotton Polos",
        quantity: 420,
        uqc: "PCS",
        fobMinor: 1200000,
        fieldConfidence: { hs_code: { score: 0.99, page: 4 }, isSyntheticDemo: true },
      },
    ],
    remittances: [
      {
        id: irm1,
        iecId,
        irmNumber: "DEMO-IRM-2601",
        bankName: "Demo State Bank AD",
        remittanceDate: isoDateOffset(-40),
        currency: "USD",
        amountMinor: 1850000,
        utilisedMinor: 1850000,
        raw: { reference: "DEMO-INV-101", isSyntheticDemo: true },
      },
      {
        id: irm2,
        iecId,
        irmNumber: "DEMO-IRM-2602",
        bankName: "Demo State Bank AD",
        remittanceDate: isoDateOffset(-12),
        currency: "GBP",
        amountMinor: 1920000,
        utilisedMinor: 1920000,
        raw: { reference: "DEMO-INV-103", isSyntheticDemo: true },
      },
    ],
    matches: [
      {
        id: crypto.randomUUID(),
        shippingBillId: sb1,
        remittanceId: irm1,
        matchedMinor: 1850000,
        method: "auto",
        confidence: 0.98,
        confirmedBy: userId,
      },
      {
        id: crypto.randomUUID(),
        shippingBillId: sb3,
        remittanceId: irm2,
        matchedMinor: 1920000,
        method: "auto",
        confidence: 0.96,
        confirmedBy: userId,
      },
    ],
    expectations: [
      {
        id: crypto.randomUUID(),
        shippingBillId: sb1,
        scheme: "rodtep",
        expectedMinor: 2950000,
        calcDetail: { isSyntheticDemo: true, label: "Sample RoDTEP expectation" },
      },
      {
        id: crypto.randomUUID(),
        shippingBillId: sb2,
        scheme: "rodtep",
        expectedMinor: 3825000,
        calcDetail: { isSyntheticDemo: true, label: "Sample uncredited RoDTEP" },
      },
      {
        id: crypto.randomUUID(),
        shippingBillId: sb3,
        scheme: "rodtep",
        expectedMinor: 4100000,
        calcDetail: { isSyntheticDemo: true, label: "Sample pending credit" },
      },
      {
        id: crypto.randomUUID(),
        shippingBillId: sb4,
        scheme: "rodtep",
        expectedMinor: 1980000,
        calcDetail: { isSyntheticDemo: true, label: "Sample credited RoDTEP" },
      },
    ],
    credits: [
      {
        id: crypto.randomUUID(),
        shippingBillId: sb1,
        scheme: "rodtep",
        creditedMinor: 2950000,
        creditedOn: isoDateOffset(-30),
        sourceDocumentId: docScrollId,
      },
      {
        id: crypto.randomUUID(),
        shippingBillId: sb2,
        scheme: "rodtep",
        creditedMinor: 1400000,
        creditedOn: isoDateOffset(-15),
        sourceDocumentId: docScrollId,
      },
      {
        id: crypto.randomUUID(),
        shippingBillId: sb4,
        scheme: "rodtep",
        creditedMinor: 1980000,
        creditedOn: isoDateOffset(-8),
        sourceDocumentId: docScrollId,
      },
    ],
    scrips: [
      {
        id: crypto.randomUUID(),
        iecId,
        scripNumber: "DEMO-SCRIP-001",
        scheme: "rodtep",
        faceMinor: 4930000,
        generatedOn: isoDateOffset(-320),
        expiresOn: isoDateOffset(45),
        status: "active",
      },
    ],
    alerts: [
      {
        id: crypto.randomUUID(),
        iecId,
        kind: "realisation_deadline",
        severity: "warning",
        shippingBillId: sb2,
        dueOn: isoDateOffset(45),
      },
      {
        id: crypto.randomUUID(),
        iecId,
        kind: "unclaimed_incentive",
        severity: "critical",
        shippingBillId: sb3,
        dueOn: isoDateOffset(14),
      },
    ],
  };
}

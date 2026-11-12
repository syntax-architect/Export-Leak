export const IRM_CANONICAL_FIELDS = [
  "irmNumber",
  "bankName",
  "remittanceDate",
  "currency",
  "amount",
  "utilisedAmount",
  "remitterName",
  "invoiceReference",
  "adCode",
] as const;

export type IrmCanonicalField = (typeof IRM_CANONICAL_FIELDS)[number];

export type IrmColumnMapping = Record<IrmCanonicalField, string | null>;

export interface RawTabularSheet {
  sheetName: string;
  rows: string[][];
}

export interface IrmNormalizedRow {
  rowNumber: number; // 1-based row number in the spreadsheet
  irmNumber: string;
  bankName: string;
  remittanceDate: string; // ISO YYYY-MM-DD
  currency: string; // ISO-3 uppercase
  amountMinor: number;
  utilisedMinor: number;
  remitterName: string;
  invoiceReference: string;
  adCode: string | null;
  raw: Record<string, string>;
}

export interface IrmRowError {
  rowNumber: number;
  irmNumber: string | null;
  reason: string;
  raw: Record<string, string>;
}

export interface IrmImportPreview {
  filename: string;
  sheetName: string;
  headerRowNumber: number; // 1-based row index
  headers: string[];
  suggestedMapping: IrmColumnMapping;
  totalDataRows: number;
  validCount: number;
  failedCount: number;
  previewRows: IrmNormalizedRow[];
  failedRows: IrmRowError[];
}

export interface IrmImportParseResult {
  sheetName: string;
  headerRowNumber: number;
  headers: string[];
  mapping: IrmColumnMapping;
  totalDataRows: number;
  validRows: IrmNormalizedRow[];
  failedRows: IrmRowError[];
}

export interface MatchingShippingBillInput {
  id: string;
  iecId: string;
  sbNumber: string;
  sbDate: string; // ISO YYYY-MM-DD
  invoiceNo: string;
  buyerName: string;
  currency: string;
  fobMinor: number;
  alreadyMatchedMinor: number;
  calculationEligible: boolean;
  status: string;
}

export interface MatchingRemittanceInput {
  id: string;
  iecId: string;
  irmNumber: string;
  bankName: string;
  remittanceDate: string; // ISO YYYY-MM-DD
  currency: string;
  amountMinor: number;
  utilisedMinor: number;
  remitterName: string;
  invoiceReference: string;
}

export type MatchPattern =
  | "exact_1to1"
  | "near_equal_bank_charges"
  | "split_1_rem_to_many_sbs"
  | "partial_many_rems_to_1_sb"
  | "partial_installment";

export interface MatchSignalBreakdown {
  invoiceMatched: boolean;
  invoiceAmbiguous: boolean;
  amountDiffMinor: number;
  withinBankChargeTolerance: boolean;
  buyerSimilarity: number;
  daysAfterSb: number;
  pattern: MatchPattern;
  groupPeerIds: string[];
}

export interface MatchCandidate {
  shippingBillId: string;
  remittanceId: string;
  sbNumber: string;
  irmNumber: string;
  currency: string;
  proposedMinor: number;
  confidence: number; // 0..1
  explanation: string;
  signals: MatchSignalBreakdown;
  autoConfirmEligible: boolean;
}

export interface MatchingEngineConfig {
  autoConfirmThreshold: number;
  minSuggestConfidence: number;
  bankChargeMaxMinor: number;
  bankChargeToleranceBps: number;
}

export const DEFAULT_MATCHING_CONFIG: MatchingEngineConfig = {
  autoConfirmThreshold: 0.9,
  minSuggestConfidence: 0.35,
  bankChargeMaxMinor: 100_00, // e.g. $100 or Rs 100
  bankChargeToleranceBps: 250, // 2.5%
};

export interface MatchingEngineResult {
  autoConfirmed: MatchCandidate[];
  reviewSuggestions: MatchCandidate[];
  ineligibleShippingBillIds: string[];
  unmatchedBillRemainders: Record<string, number>;
  unmatchedRemittanceRemainders: Record<string, number>;
}

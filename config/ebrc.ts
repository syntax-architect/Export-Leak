import path from "node:path";

export const EBRC_TEMPLATE_VERSION = "DGFT-BULK-EBRC-REF-2026.1";
export const EBRC_TEMPLATE_LAST_VERIFIED_ON = "2026-11-12";
export const EBRC_SHEET_NAME = "eBRC_Bulk_Upload";

export const EBRC_HEADERS = [
  "Serial Number",
  "IEC Branch Sl. No.",
  "IFSC Code",
  "AD Code",
  "IRM Number",
  "IRM Date",
  "IRM Currency",
  "Purpose Code",
  "Amount in FCC",
  "Port Code",
  "Shipping Bill Number",
  "Shipping Bill Date",
] as const;

export const EBRC_MAX_ROWS = 999;
export const EBRC_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export const EBRC_RESTRICTED_PURPOSE_CODES = ["P0101", "P0108"] as const;
export const EBRC_DEFAULT_PURPOSE_CODE = "P0102";
export const EBRC_ADVANCE_PURPOSE_CODE = "P0103";
export const EBRC_DEFAULT_BRANCH_SL_NO = "0";

export const EBRC_USER_CONFIRMATION_TEXT =
  "Review this file before uploading it on the DGFT portal. You submit it yourself.";

export const EBRC_SAMPLE_TEMPLATE_PATH = path.resolve(
  process.cwd(),
  "fixtures",
  "dgft-bulk-ebrc-sample.xlsx"
);

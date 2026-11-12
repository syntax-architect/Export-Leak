import { APP_CONFIG } from "@/config/app";

export interface FormatMoneyOptions {
  showCode?: boolean;
  showDecimals?: "auto" | "always" | "never";
}

const inrIntegerFormatter = new Intl.NumberFormat(APP_CONFIG.locale, {
  maximumFractionDigits: 0,
});

const intlIntegerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

/**
 * Formats integer minor units (e.g. paise for INR, cents for USD) without floating-point math.
 * Displays INR with en-IN Indian grouping and includes the currency code per rule 8.
 */
export function formatMoney(
  minorUnits: number,
  currency: string = APP_CONFIG.defaultCurrency,
  options: FormatMoneyOptions = {}
): string {
  if (!Number.isFinite(minorUnits)) {
    return formatMoney(0, currency, options);
  }

  const normalizedCurrency = currency.trim().toUpperCase() || APP_CONFIG.defaultCurrency;
  const safeMinor = Math.trunc(minorUnits);
  const isNegative = safeMinor < 0;
  const absMinor = Math.abs(safeMinor);

  const majorPart = Math.trunc(absMinor / 100);
  const fractionalPart = absMinor % 100;

  const showCode = options.showCode ?? true;
  const showDecimals = options.showDecimals ?? "auto";

  const integerFormatter =
    normalizedCurrency === "INR" ? inrIntegerFormatter : intlIntegerFormatter;
  const formattedMajor = integerFormatter.format(majorPart);

  const includeDecimals =
    showDecimals === "always" || (showDecimals === "auto" && fractionalPart !== 0);

  const decimalSuffix = includeDecimals ? `.${String(fractionalPart).padStart(2, "0")}` : "";
  const symbol = CURRENCY_SYMBOLS[normalizedCurrency] ?? "";
  const sign = isNegative ? "-" : "";

  const numberWithSymbol = symbol
    ? `${sign}${symbol}${formattedMajor}${decimalSuffix}`
    : `${sign}${formattedMajor}${decimalSuffix}`;

  if (!showCode) {
    return numberWithSymbol;
  }

  if (symbol) {
    return `${numberWithSymbol} ${normalizedCurrency}`;
  }

  return `${normalizedCurrency} ${numberWithSymbol}`;
}

export function formatNumberIN(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const normalized = Object.is(value, -0) ? 0 : Math.trunc(value);
  return inrIntegerFormatter.format(normalized);
}

const istDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_CONFIG.timezone,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * Formats a date in Asia/Kolkata timezone as "DD MMM YYYY" (e.g. "12 Nov 2026").
 */
export function formatDate(input: Date | string | number): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const parts = istDateFormatter.formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";

  if (!day || !month || !year) {
    return istDateFormatter.format(date);
  }

  return `${day} ${month} ${year}`;
}

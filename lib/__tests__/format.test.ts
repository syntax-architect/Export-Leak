import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatNumberIN } from "@/lib/format";

describe("formatMoney", () => {
  it("formats INR paise with en-IN Indian grouping and currency code", () => {
    expect(formatMoney(100000000, "INR")).toBe("₹10,00,000 INR");
    expect(formatMoney(123456789, "INR")).toBe("₹12,34,567.89 INR");
    expect(formatMoney(50, "INR")).toBe("₹0.50 INR");
  });

  it("handles zero, negative values, and never outputs negative zero", () => {
    expect(formatMoney(0, "INR")).toBe("₹0 INR");
    expect(formatMoney(-0, "INR")).toBe("₹0 INR");
    expect(formatMoney(-50000, "INR")).toBe("-₹500 INR");
    expect(formatMoney(-105, "INR")).toBe("-₹1.05 INR");
  });

  it("formats foreign currency minor units with currency code", () => {
    expect(formatMoney(4825000, "USD")).toBe("$48,250 USD");
    expect(formatMoney(4825050, "USD")).toBe("$48,250.50 USD");
    expect(formatMoney(125000, "AED")).toBe("AED 1,250");
  });

  it("falls back safely on non-finite numbers", () => {
    expect(formatMoney(Number.NaN, "INR")).toBe("₹0 INR");
    expect(formatMoney(Number.POSITIVE_INFINITY, "INR")).toBe("₹0 INR");
  });
});

describe("formatDate", () => {
  it("formats dates as DD MMM YYYY in Asia/Kolkata timezone", () => {
    // 18:30 UTC on 12 Nov 2026 is 00:00 IST on 13 Nov 2026
    expect(formatDate("2026-11-12T18:30:00Z")).toBe("13 Nov 2026");
    // 12:00 UTC on 05 Jan 2026 is 17:30 IST on 05 Jan 2026
    expect(formatDate("2026-01-05T12:00:00Z")).toBe("05 Jan 2026");
  });

  it("returns em dash for invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("formatNumberIN", () => {
  it("formats integers in Indian grouping without negative zero", () => {
    expect(formatNumberIN(1000000)).toBe("10,00,000");
    expect(formatNumberIN(-0)).toBe("0");
  });
});

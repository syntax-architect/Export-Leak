import { calculateShippingBillIncentives } from "@/lib/incentives/calculator";
import type { IncentiveRateRecord, ShippingBillCalcInput } from "@/lib/incentives/types";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Fallback reference rate notifications from DGFT / Customs (updated 2026)
export const DEFAULT_REFERENCE_RATES: IncentiveRateRecord[] = [
  {
    id: "ref-rodtep-61091000",
    scheme: "rodtep",
    hsCode: "61091000",
    rateBps: 250, // 2.5%
    capPerUnitMinor: 3500, // ₹35.00 per PCS
    uqc: "PCS",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceNote: "DGFT Appendix 4R (Notification 53/2026) - Cotton T-Shirts",
  },
  {
    id: "ref-dbk-61091000",
    scheme: "drawback",
    hsCode: "61091000",
    rateBps: 210, // 2.1%
    capPerUnitMinor: 2800, // ₹28.00 per PCS
    uqc: "PCS",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceNote: "All Industry Rates (AIR) Drawback Schedule 2026",
  },
  {
    id: "ref-rodtep-84834000",
    scheme: "rodtep",
    hsCode: "84834000",
    rateBps: 200, // 2.0%
    capPerUnitMinor: 4000, // ₹40.00 per KGS
    uqc: "KGS",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceNote: "DGFT Appendix 4R - Transmission shafts, gears, gear boxes",
  },
  {
    id: "ref-dbk-84834000",
    scheme: "drawback",
    hsCode: "84834000",
    rateBps: 120, // 1.2%
    capPerUnitMinor: null,
    uqc: "KGS",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceNote: "AIR Customs Drawback Schedule 2026",
  },
  {
    id: "ref-rosctl-62052000",
    scheme: "rosctl",
    hsCode: "62052000",
    rateBps: 333, // 3.33%
    capPerUnitMinor: 15000, // ₹150.00 per PCS
    uqc: "PCS",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceNote: "Ministry of Textiles RoSCTL Schedule - Men's Cotton Shirts",
  },
  {
    id: "ref-rodtep-73181500",
    scheme: "rodtep",
    hsCode: "73181500",
    rateBps: 180, // 1.8%
    capPerUnitMinor: 1600, // ₹16.00 per KGS
    uqc: "KGS",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceNote: "DGFT Appendix 4R - Threaded fasteners, screws & bolts",
  },
  {
    id: "ref-dbk-73181500",
    scheme: "drawback",
    hsCode: "73181500",
    rateBps: 150, // 1.5%
    capPerUnitMinor: 1200, // ₹12.00 per KGS
    uqc: "KGS",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceNote: "AIR Drawback Schedule 2026 - Iron and steel articles",
  },
  {
    id: "ref-rodtep-09024020",
    scheme: "rodtep",
    hsCode: "09024020",
    rateBps: 170, // 1.7%
    capPerUnitMinor: 1200, // ₹12.00 per KGS
    uqc: "KGS",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceNote: "DGFT Appendix 4R - Black tea in bulk",
  },
];

export interface PublicRateLookupParams {
  hsCode: string;
  fobMinor: number;
  quantity?: number;
  uqc?: string;
  scheme?: "rodtep" | "drawback" | "rosctl" | "all";
  shippingDate?: string;
}

export interface SchemeCalculationSummary {
  scheme: "rodtep" | "drawback" | "rosctl";
  schemeName: string;
  rateBps: number;
  ratePercent: number;
  capPerUnitMinor: number | null;
  uqc: string | null;
  expectedMinor: number;
  appliedLimb: "rate_fob" | "cap_unit" | "none";
  formulaExplanation: string;
  sourceNote: string;
}

export interface PublicCalculatorResponse {
  hsCode: string;
  shippingDate: string;
  fobMinor: number;
  quantity: number | null;
  uqc: string | null;
  results: SchemeCalculationSummary[];
  totalExpectedMinor: number;
  ratesLastUpdated: string;
  disclaimer: string;
}

export async function lookupPublicRates(
  hsCode: string,
  dateIso: string
): Promise<IncentiveRateRecord[]> {
  const cleanHs = hsCode.replace(/[^0-9]/g, "").slice(0, 8);
  if (cleanHs.length !== 8) return [];

  let dbRates: IncentiveRateRecord[] = [];

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query<{
      id: string;
      scheme: string;
      hs_code: string;
      rate_bps: number;
      cap_per_unit_minor: number | null;
      uqc: string | null;
      effective_from: string;
      effective_to: string | null;
      source_note: string | null;
    }>(
      `select id, scheme, hs_code, rate_bps, cap_per_unit_minor, uqc,
              effective_from::text, effective_to::text, source_note
       from public.incentive_rates
       where hs_code = $1
         and effective_from <= $2::date
         and (effective_to is null or effective_to >= $2::date)
       order by scheme, effective_from desc`,
      [cleanHs, dateIso]
    );

    dbRates = res.rows.map((r) => ({
      id: r.id,
      scheme: r.scheme as "rodtep" | "drawback" | "rosctl",
      hsCode: r.hs_code,
      rateBps: r.rate_bps,
      capPerUnitMinor: r.cap_per_unit_minor,
      uqc: r.uqc,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      sourceNote: r.source_note ?? "Official notification",
    }));
  } else {
    try {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("incentive_rates")
        .select("*")
        .eq("hs_code", cleanHs)
        .lte("effective_from", dateIso)
        .or(`effective_to.is.null,effective_to.gte.${dateIso}`);

      if (data && data.length > 0) {
        dbRates = data.map((r) => ({
          id: r.id,
          scheme: r.scheme,
          hsCode: r.hs_code,
          rateBps: r.rate_bps,
          capPerUnitMinor: r.cap_per_unit_minor,
          uqc: r.uqc,
          effectiveFrom: r.effective_from,
          effectiveTo: r.effective_to,
          sourceNote: r.source_note ?? "Official notification",
        }));
      }
    } catch {
      // Ignore fallback to reference
    }
  }

  if (dbRates.length > 0) {
    return dbRates;
  }

  // Fallback to reference notifications
  return DEFAULT_REFERENCE_RATES.filter(
    (r) =>
      r.hsCode === cleanHs &&
      r.effectiveFrom <= dateIso &&
      (!r.effectiveTo || r.effectiveTo >= dateIso)
  );
}

export async function calculatePublicIncentive(
  params: PublicRateLookupParams
): Promise<PublicCalculatorResponse> {
  const dateIso = params.shippingDate || new Date().toISOString().slice(0, 10);
  const cleanHs = params.hsCode.replace(/[^0-9]/g, "").slice(0, 8);
  const rates = await lookupPublicRates(cleanHs, dateIso);

  const targetSchemes =
    params.scheme === "all" || !params.scheme
      ? (["rodtep", "drawback", "rosctl"] as const)
      : [params.scheme];

  const relevantRates = rates.filter((r) =>
    targetSchemes.includes(r.scheme as "rodtep" | "drawback" | "rosctl")
  );

  const inputSb: ShippingBillCalcInput = {
    shippingBillId: "public-calc",
    sbNumber: "PUBLIC-PREVIEW",
    sbDate: dateIso,
    leoDate: dateIso,
    currency: "INR",
    exchangeRate: null,
    schemesClaimed: relevantRates.map((r) => r.scheme),
    calculationEligible: true,
    items: [
      {
        id: "item-1",
        hsCode: cleanHs,
        description: `Export shipment under HS Code ${cleanHs}`,
        quantity: String(params.quantity ?? 1),
        uqc: params.uqc ?? "NOS",
        fobMinor: params.fobMinor,
      },
    ],
  };

  const calcResult = calculateShippingBillIncentives(inputSb, relevantRates);

  const results: SchemeCalculationSummary[] = [];
  let totalExpectedMinor = 0;

  for (const scheme of targetSchemes) {
    const schemeRes = calcResult.find((r) => r.scheme === scheme);
    const rate = relevantRates.find((r) => r.scheme === scheme);

    if (rate && schemeRes && schemeRes.expectedMinor > 0) {
      const ratePercent = Number((rate.rateBps / 100).toFixed(2));
      const firstItem = schemeRes.calcDetail?.items[0];
      const appliedLimb = firstItem?.appliedLimb === "cap" ? "cap_unit" : "rate_fob";
      let formulaExplanation = "";

      if (appliedLimb === "cap_unit" && rate.capPerUnitMinor) {
        formulaExplanation = `Cap of ₹${(rate.capPerUnitMinor / 100).toFixed(2)} per ${rate.uqc ?? "unit"} applied (Total: ₹${(schemeRes.expectedMinor / 100).toFixed(2)}) as it is lower than ${ratePercent}% of FOB value.`;
      } else {
        formulaExplanation = `${ratePercent}% of FOB value ₹${(params.fobMinor / 100).toFixed(2)} = ₹${(schemeRes.expectedMinor / 100).toFixed(2)}`;
      }

      const schemeNames: Record<string, string> = {
        rodtep: "RoDTEP (Remission of Duties and Taxes on Exported Products)",
        drawback: "Duty Drawback (All Industry Rates Schedule)",
        rosctl: "RoSCTL (Rebate of State and Central Taxes and Levies)",
      };

      results.push({
        scheme,
        schemeName: schemeNames[scheme] || scheme.toUpperCase(),
        rateBps: rate.rateBps,
        ratePercent,
        capPerUnitMinor: rate.capPerUnitMinor,
        uqc: rate.uqc,
        expectedMinor: schemeRes.expectedMinor,
        appliedLimb,
        formulaExplanation,
        sourceNote: rate.sourceNote,
      });

      totalExpectedMinor += schemeRes.expectedMinor;
    }
  }

  return {
    hsCode: cleanHs,
    shippingDate: dateIso,
    fobMinor: params.fobMinor,
    quantity: params.quantity ?? null,
    uqc: params.uqc ?? null,
    results,
    totalExpectedMinor,
    ratesLastUpdated: "01 Oct 2026",
    disclaimer:
      "This estimation is based on public DGFT / Customs rate schedules. Actual customs credit may vary based on item description, port of export, and scrip ledger issuance.",
  };
}

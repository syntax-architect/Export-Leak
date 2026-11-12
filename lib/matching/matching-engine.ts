import {
  DEFAULT_MATCHING_CONFIG,
  type MatchCandidate,
  type MatchingEngineConfig,
  type MatchingEngineResult,
  type MatchingRemittanceInput,
  type MatchingShippingBillInput,
  type MatchPattern,
} from "@/lib/matching/types";

const LEGAL_STOPWORDS = new Set([
  "pvt",
  "private",
  "ltd",
  "limited",
  "llp",
  "inc",
  "corp",
  "corporation",
  "llc",
  "gmbh",
  "ag",
  "ab",
  "bv",
  "co",
  "plc",
  "company",
  "exports",
  "imports",
  "trading",
]);

function normalizeAlphaNum(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenizeName(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !LEGAL_STOPWORDS.has(token));
}

export function computeBuyerSimilarity(a: string, b: string): number {
  const tokensA = tokenizeName(a);
  const tokensB = tokenizeName(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  if (union === 0) return 0;

  return Number((intersection / union).toFixed(4));
}

function parseIsoDayUtc(isoDate: string): number | null {
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(ms) ? null : Math.floor(ms / 86400000);
}

function formatMinorSimple(minor: number, currency: string): string {
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${whole}.${frac} ${currency}`;
}

function checkReferenceMatch(
  sb: MatchingShippingBillInput,
  rem: MatchingRemittanceInput
): { matched: boolean; label: string | null } {
  const hayRaw = rem.invoiceReference.toLowerCase();
  const hayAlpha = normalizeAlphaNum(rem.invoiceReference);

  const invoiceTrimmed = sb.invoiceNo.trim().toLowerCase();
  const invoiceAlpha = normalizeAlphaNum(sb.invoiceNo);
  if (invoiceTrimmed.length >= 3 && invoiceAlpha.length >= 3) {
    if (hayRaw.includes(invoiceTrimmed) || hayAlpha.includes(invoiceAlpha)) {
      return { matched: true, label: `invoice ${sb.invoiceNo.trim()} found in reference` };
    }
  }

  const sbAlpha = normalizeAlphaNum(sb.sbNumber);
  if (sbAlpha.length >= 6 && hayAlpha.includes(sbAlpha)) {
    return { matched: true, label: `SB ${sb.sbNumber.trim()} found in reference` };
  }

  return { matched: false, label: null };
}

function computeBankChargeLimit(billAmountMinor: number, config: MatchingEngineConfig): number {
  const pctAllowance = Math.round((billAmountMinor * config.bankChargeToleranceBps) / 10000);
  return Math.min(config.bankChargeMaxMinor, Math.max(25_00, pctAllowance));
}

function isWithinBankChargeTolerance(
  targetMinor: number,
  paymentMinor: number,
  config: MatchingEngineConfig
): { ok: boolean; diffMinor: number } {
  const diffMinor = targetMinor - paymentMinor;
  if (diffMinor === 0) return { ok: true, diffMinor: 0 };
  if (diffMinor < 0) return { ok: false, diffMinor };
  const limit = computeBankChargeLimit(targetMinor, config);
  return { ok: diffMinor <= limit, diffMinor };
}

function dateProximityScore(daysAfterSb: number): number {
  if (daysAfterSb <= 15) return 0.08;
  if (daysAfterSb <= 45) return 0.06;
  if (daysAfterSb <= 90) return 0.04;
  return 0.02;
}

function findMatchingSubsets<T extends { remaining: number }>(
  items: readonly T[],
  target: number,
  maxSize: number,
  toleranceFn: (sum: number, target: number) => boolean
): Array<T[]> {
  const results: Array<T[]> = [];
  const pool = items.slice(0, 12); // keep bounded to prevent combinatorial explosion

  function backtrack(start: number, chosen: T[], runningSum: number) {
    if (results.length >= 8) return;
    if (chosen.length >= 2 && toleranceFn(runningSum, target)) {
      results.push([...chosen]);
      return;
    }
    if (chosen.length >= maxSize) return;

    for (let i = start; i < pool.length; i += 1) {
      const candidate = pool[i]!;
      const nextSum = runningSum + candidate.remaining;
      if (nextSum > target + 100_00) continue;
      chosen.push(candidate);
      backtrack(i + 1, chosen, nextSum);
      chosen.pop();
    }
  }

  backtrack(0, [], 0);
  return results;
}

export function runMatchingEngine(params: {
  shippingBills: readonly MatchingShippingBillInput[];
  remittances: readonly MatchingRemittanceInput[];
  existingPairs?: ReadonlySet<string>; // `${shippingBillId}:${remittanceId}`
  rejectedPairs?: ReadonlySet<string>; // `${shippingBillId}:${remittanceId}`
  config?: Partial<MatchingEngineConfig>;
}): MatchingEngineResult {
  const config: MatchingEngineConfig = {
    ...DEFAULT_MATCHING_CONFIG,
    ...(params.config ?? {}),
  };

  const existingPairs = params.existingPairs ?? new Set<string>();
  const rejectedPairs = params.rejectedPairs ?? new Set<string>();

  const ineligibleShippingBillIds: string[] = [];
  const billRemaining = new Map<string, number>();
  const remRemaining = new Map<string, number>();

  for (const sb of params.shippingBills) {
    const remNeed = Math.max(0, sb.fobMinor - sb.alreadyMatchedMinor);
    billRemaining.set(sb.id, remNeed);
    if (!sb.calculationEligible || sb.status === "needs_review" || sb.status === "failed") {
      ineligibleShippingBillIds.push(sb.id);
    }
  }

  for (const rem of params.remittances) {
    remRemaining.set(rem.id, Math.max(0, rem.amountMinor - rem.utilisedMinor));
  }

  const eligibleOpenBills = params.shippingBills.filter(
    (sb) =>
      sb.calculationEligible &&
      sb.status !== "needs_review" &&
      sb.status !== "failed" &&
      (billRemaining.get(sb.id) ?? 0) > 0
  );

  // Detect duplicate open invoice numbers so ambiguous invoices never auto-confirm silently
  const invoiceCounts = new Map<string, number>();
  for (const sb of eligibleOpenBills) {
    const normInv = normalizeAlphaNum(sb.invoiceNo);
    if (normInv.length >= 3) {
      invoiceCounts.set(normInv, (invoiceCounts.get(normInv) ?? 0) + 1);
    }
  }

  const autoConfirmed: MatchCandidate[] = [];
  const reviewSuggestions: MatchCandidate[] = [];
  const claimedPairs = new Set<string>();
  const settledBills = new Set<string>();

  function markPairClaimed(sbId: string, remId: string) {
    claimedPairs.add(`${sbId}:${remId}`);
  }

  function isPairAvailable(sbId: string, remId: string): boolean {
    const key = `${sbId}:${remId}`;
    return !existingPairs.has(key) && !rejectedPairs.has(key) && !claimedPairs.has(key);
  }

  // Pass 1: 1-to-1 High-Confidence Auto-Confirmation (Exact & Near-Equal within bank charges)
  const sortedRems = [...params.remittances]
    .filter((r) => (remRemaining.get(r.id) ?? 0) > 0)
    .sort((a, b) => a.remittanceDate.localeCompare(b.remittanceDate));

  for (const rem of sortedRems) {
    const remBal = remRemaining.get(rem.id) ?? 0;
    if (remBal <= 0) continue;

    const remDay = parseIsoDayUtc(rem.remittanceDate);
    if (remDay === null) continue;

    const candidatesForRem: MatchCandidate[] = [];

    for (const sb of eligibleOpenBills) {
      const sbNeed = billRemaining.get(sb.id) ?? 0;
      if (sbNeed <= 0 || !isPairAvailable(sb.id, rem.id)) continue;

      // Hard Rule: same currency & payment date on or after SB date
      if (sb.currency.toUpperCase() !== rem.currency.toUpperCase()) continue;
      const sbDay = parseIsoDayUtc(sb.sbDate);
      if (sbDay === null || remDay < sbDay) continue;

      const tol = isWithinBankChargeTolerance(sbNeed, remBal, config);
      if (!tol.ok) continue;

      const ref = checkReferenceMatch(sb, rem);
      const normInv = normalizeAlphaNum(sb.invoiceNo);
      const invoiceAmbiguous = (invoiceCounts.get(normInv) ?? 0) > 1;
      const buyerSim = computeBuyerSimilarity(sb.buyerName, rem.remitterName);
      const daysAfterSb = remDay - sbDay;

      let score = 0;
      const reasons: string[] = [];

      if (tol.diffMinor === 0) {
        score += 0.4;
        reasons.push("Amount equal");
      } else {
        score += 0.36;
        reasons.push(
          `Near-equal amount within bank charges (${formatMinorSimple(tol.diffMinor, rem.currency)} diff)`
        );
      }

      if (ref.matched && ref.label) {
        score += invoiceAmbiguous ? 0.25 : 0.4;
        reasons.push(
          invoiceAmbiguous ? `${ref.label} (duplicate invoice across multiple bills)` : ref.label
        );
      }

      if (buyerSim >= 0.75) {
        score += 0.12;
        reasons.push("buyer name match");
      } else if (buyerSim >= 0.4) {
        score += 0.07;
        reasons.push("partial buyer name match");
      }

      score += dateProximityScore(daysAfterSb);
      reasons.push(`paid ${daysAfterSb}d after SB date`);

      const confidence = Number(Math.min(1, score).toFixed(4));
      const pattern: MatchPattern = tol.diffMinor === 0 ? "exact_1to1" : "near_equal_bank_charges";
      const canAutoConfirm =
        confidence >= config.autoConfirmThreshold && !invoiceAmbiguous && ref.matched;

      candidatesForRem.push({
        shippingBillId: sb.id,
        remittanceId: rem.id,
        sbNumber: sb.sbNumber,
        irmNumber: rem.irmNumber,
        currency: rem.currency.toUpperCase(),
        proposedMinor: Math.min(sbNeed, remBal),
        confidence,
        explanation: reasons.join("; "),
        signals: {
          invoiceMatched: ref.matched,
          invoiceAmbiguous,
          amountDiffMinor: tol.diffMinor,
          withinBankChargeTolerance: tol.ok,
          buyerSimilarity: buyerSim,
          daysAfterSb,
          pattern,
          groupPeerIds: [],
        },
        autoConfirmEligible: canAutoConfirm,
      });
    }

    candidatesForRem.sort((a, b) => b.confidence - a.confidence);
    const top = candidatesForRem[0];
    if (top && top.autoConfirmEligible) {
      // Check no close runner-up conflict
      const second = candidatesForRem[1];
      if (!second || top.confidence - second.confidence >= 0.08) {
        autoConfirmed.push(top);
        markPairClaimed(top.shippingBillId, top.remittanceId);
        settledBills.add(top.shippingBillId);
        billRemaining.set(
          top.shippingBillId,
          Math.max(0, (billRemaining.get(top.shippingBillId) ?? 0) - top.proposedMinor)
        );
        remRemaining.set(
          top.remittanceId,
          Math.max(0, (remRemaining.get(top.remittanceId) ?? 0) - top.proposedMinor)
        );
      }
    }
  }

  // Pass 2: 1 Payment -> Many Bills (Split payment exact/near-equal subset sum)
  for (const rem of sortedRems) {
    const remBal = remRemaining.get(rem.id) ?? 0;
    if (remBal <= 0) continue;
    const remDay = parseIsoDayUtc(rem.remittanceDate);
    if (remDay === null) continue;

    const sameCurrencyEligible = eligibleOpenBills
      .filter((sb) => {
        const need = billRemaining.get(sb.id) ?? 0;
        const sbDay = parseIsoDayUtc(sb.sbDate);
        return (
          need > 0 &&
          !settledBills.has(sb.id) &&
          need < remBal &&
          sb.currency.toUpperCase() === rem.currency.toUpperCase() &&
          sbDay !== null &&
          remDay >= sbDay &&
          isPairAvailable(sb.id, rem.id)
        );
      })
      .map((sb) => ({ sb, remaining: billRemaining.get(sb.id) ?? 0 }));

    if (sameCurrencyEligible.length < 2) continue;

    const subsets = findMatchingSubsets(sameCurrencyEligible, remBal, 4, (sum, target) => {
      const tol = isWithinBankChargeTolerance(sum, target, config);
      return tol.ok;
    });

    if (subsets.length > 0) {
      // Prefer subset where invoice refs, exact sum, smaller size, and buyer match best
      const ranked = subsets
        .map((group) => {
          const invoiceHits = group.filter((g) => checkReferenceMatch(g.sb, rem).matched).length;
          const groupTotal = group.reduce((s, g) => s + g.remaining, 0);
          const absDiff = Math.abs(groupTotal - remBal);
          const buyerAvg =
            group.reduce(
              (s, g) => s + computeBuyerSimilarity(g.sb.buyerName, rem.remitterName),
              0
            ) / group.length;
          return { group, invoiceHits, absDiff, buyerAvg };
        })
        .sort(
          (a, b) =>
            b.invoiceHits - a.invoiceHits ||
            a.absDiff - b.absDiff ||
            a.group.length - b.group.length ||
            b.buyerAvg - a.buyerAvg
        );

      const best = ranked[0]!;
      const groupSum = best.group.reduce((s, g) => s + g.remaining, 0);
      const allInvoicesMatched = best.invoiceHits === best.group.length;
      const anyAmbiguous = best.group.some(
        (g) => (invoiceCounts.get(normalizeAlphaNum(g.sb.invoiceNo)) ?? 0) > 1
      );
      const runnerUp = ranked[1];
      const uniqueBest =
        !runnerUp ||
        best.invoiceHits > runnerUp.invoiceHits ||
        best.absDiff < runnerUp.absDiff ||
        best.group.length < runnerUp.group.length;

      let availableRemForSplit = remBal;
      const groupCandidates: MatchCandidate[] = [];

      for (const item of best.group) {
        const sbDay = parseIsoDayUtc(item.sb.sbDate)!;
        const daysAfterSb = remDay - sbDay;
        const ref = checkReferenceMatch(item.sb, rem);
        const buyerSim = computeBuyerSimilarity(item.sb.buyerName, rem.remitterName);
        const alloc = Math.min(item.remaining, availableRemForSplit);
        availableRemForSplit -= alloc;

        const score =
          0.38 +
          (ref.matched ? (anyAmbiguous ? 0.25 : 0.4) : 0) +
          (buyerSim >= 0.75 ? 0.12 : buyerSim >= 0.4 ? 0.07 : 0) +
          dateProximityScore(daysAfterSb);
        const confidence = Number(Math.min(1, score).toFixed(4));
        const peerIds = best.group.filter((x) => x.sb.id !== item.sb.id).map((x) => x.sb.id);

        const canAuto =
          confidence >= config.autoConfirmThreshold &&
          allInvoicesMatched &&
          !anyAmbiguous &&
          uniqueBest;

        groupCandidates.push({
          shippingBillId: item.sb.id,
          remittanceId: rem.id,
          sbNumber: item.sb.sbNumber,
          irmNumber: rem.irmNumber,
          currency: rem.currency.toUpperCase(),
          proposedMinor: alloc,
          confidence,
          explanation: [
            `Split payment covers ${best.group.length} bills summing to ${formatMinorSimple(groupSum, rem.currency)}`,
            ref.label ?? null,
            buyerSim >= 0.75 ? "buyer name match" : null,
            `paid ${daysAfterSb}d after SB date`,
          ]
            .filter(Boolean)
            .join("; "),
          signals: {
            invoiceMatched: ref.matched,
            invoiceAmbiguous: anyAmbiguous,
            amountDiffMinor: groupSum - remBal,
            withinBankChargeTolerance: true,
            buyerSimilarity: buyerSim,
            daysAfterSb,
            pattern: "split_1_rem_to_many_sbs",
            groupPeerIds: peerIds,
          },
          autoConfirmEligible: canAuto,
        });
      }

      if (groupCandidates.every((c) => c.autoConfirmEligible && c.proposedMinor > 0)) {
        for (const c of groupCandidates) {
          autoConfirmed.push(c);
          markPairClaimed(c.shippingBillId, c.remittanceId);
          settledBills.add(c.shippingBillId);
          billRemaining.set(
            c.shippingBillId,
            Math.max(0, (billRemaining.get(c.shippingBillId) ?? 0) - c.proposedMinor)
          );
          remRemaining.set(
            c.remittanceId,
            Math.max(0, (remRemaining.get(c.remittanceId) ?? 0) - c.proposedMinor)
          );
        }
      } else {
        for (const c of groupCandidates) {
          if (c.confidence >= config.minSuggestConfidence && c.proposedMinor > 0) {
            reviewSuggestions.push(c);
            markPairClaimed(c.shippingBillId, c.remittanceId);
          }
        }
      }
    }
  }

  // Pass 3: Many Payments -> 1 Bill (Partial payments combining to settle 1 SB)
  for (const sb of eligibleOpenBills) {
    const sbNeed = billRemaining.get(sb.id) ?? 0;
    if (sbNeed <= 0 || settledBills.has(sb.id)) continue;
    const sbDay = parseIsoDayUtc(sb.sbDate);
    if (sbDay === null) continue;
    const normInv = normalizeAlphaNum(sb.invoiceNo);
    const invoiceAmbiguous = (invoiceCounts.get(normInv) ?? 0) > 1;

    const sameCurrencyPool = sortedRems
      .filter((rem) => {
        const bal = remRemaining.get(rem.id) ?? 0;
        const remDay = parseIsoDayUtc(rem.remittanceDate);
        return (
          bal > 0 &&
          bal < sbNeed &&
          rem.currency.toUpperCase() === sb.currency.toUpperCase() &&
          remDay !== null &&
          remDay >= sbDay &&
          isPairAvailable(sb.id, rem.id)
        );
      })
      .map((rem) => ({ rem, remaining: remRemaining.get(rem.id) ?? 0 }));

    if (sameCurrencyPool.length < 2) continue;

    const subsets = findMatchingSubsets(sameCurrencyPool, sbNeed, 4, (sum, target) => {
      const tol = isWithinBankChargeTolerance(target, sum, config);
      return tol.ok;
    });

    if (subsets.length > 0) {
      const ranked = subsets
        .map((group) => {
          const invoiceHits = group.filter((g) => checkReferenceMatch(sb, g.rem).matched).length;
          const buyerAvg =
            group.reduce(
              (s, g) => s + computeBuyerSimilarity(sb.buyerName, g.rem.remitterName),
              0
            ) / group.length;
          return { group, invoiceHits, buyerAvg };
        })
        .sort((a, b) => b.invoiceHits - a.invoiceHits || b.buyerAvg - a.buyerAvg);

      const best = ranked[0]!;
      const allInvoicesMatched = best.invoiceHits === best.group.length;
      const uniqueBest = ranked.length === 1 || best.invoiceHits > (ranked[1]?.invoiceHits ?? 0);

      let neededForBill = sbNeed;
      const groupCandidates: MatchCandidate[] = [];

      for (const item of best.group) {
        const remDay = parseIsoDayUtc(item.rem.remittanceDate)!;
        const daysAfterSb = remDay - sbDay;
        const ref = checkReferenceMatch(sb, item.rem);
        const buyerSim = computeBuyerSimilarity(sb.buyerName, item.rem.remitterName);
        const alloc = Math.min(item.remaining, neededForBill);
        neededForBill -= alloc;

        const score =
          0.38 +
          (ref.matched ? (invoiceAmbiguous ? 0.25 : 0.4) : 0) +
          (buyerSim >= 0.75 ? 0.12 : buyerSim >= 0.4 ? 0.07 : 0) +
          dateProximityScore(daysAfterSb);
        const confidence = Number(Math.min(1, score).toFixed(4));
        const peerIds = best.group.filter((x) => x.rem.id !== item.rem.id).map((x) => x.rem.id);

        const canAuto =
          confidence >= config.autoConfirmThreshold &&
          allInvoicesMatched &&
          !invoiceAmbiguous &&
          uniqueBest;

        groupCandidates.push({
          shippingBillId: sb.id,
          remittanceId: item.rem.id,
          sbNumber: sb.sbNumber,
          irmNumber: item.rem.irmNumber,
          currency: sb.currency.toUpperCase(),
          proposedMinor: alloc,
          confidence,
          explanation: [
            `Combined partial settlement (${best.group.length} IRMs cover SB #${sb.sbNumber})`,
            ref.label ?? null,
            buyerSim >= 0.75 ? "buyer name match" : null,
            `paid ${daysAfterSb}d after SB date`,
          ]
            .filter(Boolean)
            .join("; "),
          signals: {
            invoiceMatched: ref.matched,
            invoiceAmbiguous,
            amountDiffMinor: 0,
            withinBankChargeTolerance: true,
            buyerSimilarity: buyerSim,
            daysAfterSb,
            pattern: "partial_many_rems_to_1_sb",
            groupPeerIds: peerIds,
          },
          autoConfirmEligible: canAuto,
        });
      }

      if (groupCandidates.every((c) => c.autoConfirmEligible && c.proposedMinor > 0)) {
        for (const c of groupCandidates) {
          autoConfirmed.push(c);
          markPairClaimed(c.shippingBillId, c.remittanceId);
          settledBills.add(c.shippingBillId);
          billRemaining.set(
            c.shippingBillId,
            Math.max(0, (billRemaining.get(c.shippingBillId) ?? 0) - c.proposedMinor)
          );
          remRemaining.set(
            c.remittanceId,
            Math.max(0, (remRemaining.get(c.remittanceId) ?? 0) - c.proposedMinor)
          );
        }
      } else {
        for (const c of groupCandidates) {
          if (c.confidence >= config.minSuggestConfidence && c.proposedMinor > 0) {
            reviewSuggestions.push(c);
            markPairClaimed(c.shippingBillId, c.remittanceId);
          }
        }
      }
    }
  }

  // Pass 4: Remaining candidate suggestions for manual Review Matches (ambiguous, duplicate invoices, single partial installments, near-match candidates)
  for (const sb of eligibleOpenBills) {
    const sbNeed = billRemaining.get(sb.id) ?? 0;
    if (sbNeed <= 0 || settledBills.has(sb.id)) continue;
    const sbDay = parseIsoDayUtc(sb.sbDate);
    if (sbDay === null) continue;
    const normInv = normalizeAlphaNum(sb.invoiceNo);
    const invoiceAmbiguous = (invoiceCounts.get(normInv) ?? 0) > 1;

    for (const rem of sortedRems) {
      const remBal = remRemaining.get(rem.id) ?? 0;
      if (remBal <= 0 || !isPairAvailable(sb.id, rem.id)) continue;
      if (sb.currency.toUpperCase() !== rem.currency.toUpperCase()) continue;

      const remDay = parseIsoDayUtc(rem.remittanceDate);
      if (remDay === null || remDay < sbDay) continue;

      const ref = checkReferenceMatch(sb, rem);
      const tol = isWithinBankChargeTolerance(sbNeed, remBal, config);
      const buyerSim = computeBuyerSimilarity(sb.buyerName, rem.remitterName);
      const daysAfterSb = remDay - sbDay;

      let amountScore = 0;
      let amountReason: string | null = null;
      let pattern: MatchPattern = "partial_installment";

      if (tol.ok) {
        if (tol.diffMinor === 0) {
          amountScore = 0.4;
          amountReason = "Amount equal";
          pattern = "exact_1to1";
        } else {
          amountScore = 0.36;
          amountReason = `Near-equal amount within bank charges (${formatMinorSimple(tol.diffMinor, rem.currency)} diff)`;
          pattern = "near_equal_bank_charges";
        }
      } else if (remBal < sbNeed) {
        const pct = Math.round((remBal * 100) / sbNeed);
        amountScore = 0.18;
        amountReason = `Partial payment (${pct}% of remaining bill)`;
        pattern = "partial_installment";
      } else {
        const pct = Math.round((sbNeed * 100) / remBal);
        amountScore = 0.14;
        amountReason = `Remittance exceeds bill (${pct}% of IRM balance)`;
        pattern = "split_1_rem_to_many_sbs";
      }

      let score = amountScore;
      const reasons: string[] = [];
      if (amountReason) reasons.push(amountReason);

      if (ref.matched && ref.label) {
        score += invoiceAmbiguous ? 0.25 : 0.4;
        reasons.push(
          invoiceAmbiguous ? `${ref.label} (duplicate invoice across multiple bills)` : ref.label
        );
      }

      if (buyerSim >= 0.75) {
        score += 0.12;
        reasons.push("buyer name match");
      } else if (buyerSim >= 0.4) {
        score += 0.07;
        reasons.push("partial buyer name match");
      }

      score += dateProximityScore(daysAfterSb);
      reasons.push(`paid ${daysAfterSb}d after SB date`);

      const confidence = Number(Math.min(1, score).toFixed(4));
      if (confidence < config.minSuggestConfidence) continue;

      reviewSuggestions.push({
        shippingBillId: sb.id,
        remittanceId: rem.id,
        sbNumber: sb.sbNumber,
        irmNumber: rem.irmNumber,
        currency: rem.currency.toUpperCase(),
        proposedMinor: Math.min(sbNeed, remBal),
        confidence,
        explanation: reasons.join("; "),
        signals: {
          invoiceMatched: ref.matched,
          invoiceAmbiguous,
          amountDiffMinor: tol.diffMinor,
          withinBankChargeTolerance: tol.ok,
          buyerSimilarity: buyerSim,
          daysAfterSb,
          pattern,
          groupPeerIds: [],
        },
        autoConfirmEligible: false,
      });
    }
  }

  reviewSuggestions.sort((a, b) => b.confidence - a.confidence);

  const unmatchedBillRemainders: Record<string, number> = {};
  for (const [id, val] of billRemaining.entries()) {
    unmatchedBillRemainders[id] = val;
  }

  const unmatchedRemittanceRemainders: Record<string, number> = {};
  for (const [id, val] of remRemaining.entries()) {
    unmatchedRemittanceRemainders[id] = val;
  }

  return {
    autoConfirmed,
    reviewSuggestions,
    ineligibleShippingBillIds,
    unmatchedBillRemainders,
    unmatchedRemittanceRemainders,
  };
}

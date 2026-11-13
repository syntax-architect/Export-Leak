"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PaymentModalStep, PaymentStatusModal } from "@/components/billing/payment-status-modal";
import { UsageMeterCard } from "@/components/billing/usage-meter-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateText } from "@/components/ui/date-text";
import { APP_CONFIG } from "@/config/app";
import { PLANS, type PlanConfig, type PlanKey } from "@/config/plans";
import type { OrgUsageSnapshot } from "@/lib/billing/entitlements";
import { getTrialCountdown } from "@/lib/billing/trial-countdown";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BillingOverviewProps {
  orgName: string;
  usage: OrgUsageSnapshot;
  highlightedPlanKey?: string | null;
  userEmail?: string | null;
}

const PAID_PLAN_KEYS: readonly Exclude<PlanKey, "free" | "trial_pro">[] = [
  "exporter_monthly",
  "exporter_annual",
  "consultant_monthly",
  "consultant_annual",
];

function PlanFeatureList({ plan }: { plan: PlanConfig }) {
  const { entitlements } = plan;
  return (
    <ul className="space-y-2 text-xs text-text-muted">
      <li className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        <span>
          Up to {entitlements.maxIecs} IEC profile{entitlements.maxIecs === 1 ? "" : "s"}
        </span>
      </li>
      <li className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        <span>{entitlements.shippingBillsPerMonth} Shipping Bills per month</span>
      </li>
      <li className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        <span>Bulk eBRC Excel export &amp; leakage PDF/Excel reports</span>
      </li>
      <li className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        <span>{entitlements.teamSeats} team seats &amp; email alerts</span>
      </li>
    </ul>
  );
}

// Helper to dynamically load Razorpay checkout.js script
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function BillingOverview({
  orgName,
  usage,
  highlightedPlanKey,
  userEmail,
}: BillingOverviewProps) {
  const router = useRouter();
  const trial = getTrialCountdown(usage.trialEndsAt);
  const currentPlan = PLANS[usage.planKey];

  // Checkout modal state
  const [modalStep, setModalStep] = React.useState<PaymentModalStep>("idle");
  const [targetPlanKey, setTargetPlanKey] = React.useState<PlanKey | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Cancellation modal state
  const [isCancelModalOpen, setIsCancelModalOpen] = React.useState(false);
  const [isCanceling, setIsCanceling] = React.useState(false);
  const [cancelConfirmed, setCancelConfirmed] = React.useState(false);

  // Active polling reference
  const pollingRef = React.useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = React.useRef<number>(0);

  const stopPolling = React.useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  React.useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Handle polling for webhook plan activation
  const startPollingForActivation = React.useCallback(
    (orgId: string, expectedPlanKey: PlanKey) => {
      stopPolling();
      pollCountRef.current = 0;

      const checkStatus = async () => {
        try {
          pollCountRef.current += 1;
          const res = await fetch(`/api/billing/status?orgId=${encodeURIComponent(orgId)}`);
          if (res.ok) {
            const data = (await res.json()) as {
              planKey: PlanKey;
              isPaidPlanActive: boolean;
            };

            if (data.isPaidPlanActive && data.planKey === expectedPlanKey) {
              stopPolling();
              setModalStep("success");
              router.refresh();
              return;
            }
          }
        } catch {
          // Ignore transient polling fetch errors
        }

        // 90 seconds timeout (45 polls at 2 seconds each)
        if (pollCountRef.current >= 45) {
          stopPolling();
          setModalStep("delayed");
          // Continue gentle background polling every 10 seconds
          pollingRef.current = setInterval(async () => {
            try {
              const res = await fetch(`/api/billing/status?orgId=${encodeURIComponent(orgId)}`);
              if (res.ok) {
                const data = (await res.json()) as {
                  planKey: PlanKey;
                  isPaidPlanActive: boolean;
                };
                if (data.isPaidPlanActive && data.planKey === expectedPlanKey) {
                  stopPolling();
                  setModalStep("success");
                  router.refresh();
                }
              }
            } catch {
              // Ignore
            }
          }, 10_000);
        }
      };

      pollingRef.current = setInterval(checkStatus, 2000);
    },
    [router, stopPolling]
  );

  // Initiate Razorpay checkout
  const initiateSubscription = React.useCallback(
    async (planKey: PlanKey) => {
      const plan = PLANS[planKey];
      setTargetPlanKey(planKey);
      setErrorMessage(null);

      if (usage.planKey === planKey && usage.billingState === "active_subscription") {
        setErrorMessage("Your organization is already subscribed to this plan.");
        setModalStep("failed");
        return;
      }

      setModalStep("initiating");

      try {
        const [scriptLoaded, subRes] = await Promise.all([
          loadRazorpayScript(),
          fetch("/api/billing/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              planKey,
              orgId: usage.orgId,
            }),
          }),
        ]);

        if (!subRes.ok) {
          const errData = (await subRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error || "Failed to create subscription checkout.");
        }

        const subData = (await subRes.json()) as {
          subscriptionId: string;
          keyId: string;
          planKey: PlanKey;
          isPlanChange: boolean;
        };

        if (!scriptLoaded) {
          throw new Error(
            "Could not load Razorpay checkout script. Please check your internet connection."
          );
        }

        const RazorpayConstructor = (
          window as unknown as {
            Razorpay: new (opts: unknown) => {
              open: () => void;
              on: (event: string, cb: (data: unknown) => void) => void;
            };
          }
        ).Razorpay;

        if (!RazorpayConstructor) {
          throw new Error("Razorpay SDK not initialized.");
        }

        const options = {
          key: subData.keyId,
          subscription_id: subData.subscriptionId,
          name: APP_CONFIG.name,
          description: `${plan.displayName} subscription`,
          theme: {
            color: "#0A2540",
          },
          prefill: {
            name: orgName,
            email: userEmail || undefined,
          },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_subscription_id: string;
            razorpay_signature: string;
          }) => {
            setModalStep("verifying");

            try {
              // Server-side signature verification (HMAC-SHA256 over payment_id|subscription_id)
              // Note: this verification updates UI status only; it NEVER activates the plan on the server.
              await fetch("/api/billing/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_subscription_id: response.razorpay_subscription_id,
                  razorpay_signature: response.razorpay_signature,
                  orgId: usage.orgId,
                }),
              });
            } catch {
              // Non-blocking for polling
            }

            setModalStep("activating");
            startPollingForActivation(usage.orgId, planKey);
          },
          modal: {
            ondismiss: () => {
              setModalStep("dismissed");
            },
          },
        };

        const rzp = new RazorpayConstructor(options);
        rzp.on("payment.failed", (failedData: unknown) => {
          const resp = failedData as { error?: { description?: string } };
          setErrorMessage(
            resp.error?.description ||
              "Payment could not be completed. Please check your payment details or try another payment method."
          );
          setModalStep("failed");
        });

        rzp.open();
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "An unexpected error occurred during checkout."
        );
        setModalStep("failed");
      }
    },
    [orgName, startPollingForActivation, usage.billingState, usage.orgId, usage.planKey, userEmail]
  );

  const handleSelectPlan = (planKey: PlanKey) => {
    if (usage.billingState === "active_subscription" && usage.planKey !== planKey) {
      setTargetPlanKey(planKey);
      setModalStep("confirming_plan_change");
    } else {
      initiateSubscription(planKey);
    }
  };

  const handleCancelSubscription = async () => {
    setIsCanceling(true);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: usage.orgId }),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || "Failed to cancel subscription.");
      }

      setCancelConfirmed(true);
      setIsCancelModalOpen(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Cancellation failed.");
    } finally {
      setIsCanceling(false);
    }
  };

  const isPaidActive = usage.billingState === "active_subscription";
  const targetPlan = targetPlanKey ? PLANS[targetPlanKey] : currentPlan;

  return (
    <div className="flex flex-col gap-6" data-testid="billing-overview-root">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Plans &amp; Usage</h1>
          <p className="mt-1 text-sm text-text-muted">
            Current plan, monthly entitlements, and transparent INR recurring subscriptions for{" "}
            {orgName}.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm" className="min-h-11">
          <Link href="/app">Back to workspace</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span>Current plan: {currentPlan.displayName}</span>
              <Badge
                variant={
                  usage.billingState === "active_trial"
                    ? "accent"
                    : usage.billingState === "grace_period"
                      ? "warning"
                      : usage.billingState === "active_subscription"
                        ? "success"
                        : "neutral"
                }
              >
                {usage.billingState === "active_trial"
                  ? trial.label || "Trial active"
                  : usage.billingState === "grace_period"
                    ? "Grace period"
                    : usage.billingState === "active_subscription"
                      ? "Active subscription"
                      : "Free tier"}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              {usage.billingState === "active_trial" && usage.trialEndsAt ? (
                <>
                  Your card-free 7-day Pro trial ends on <DateText date={usage.trialEndsAt} /> and
                  will move gently to Free with all uploaded data kept readable.
                </>
              ) : usage.billingState === "active_subscription" ? (
                <>
                  Subscription active. Recurring billing is managed automatically via Razorpay.
                  {cancelConfirmed && (
                    <span className="ml-2 font-medium text-warning">
                      (Cancels at cycle end. You retain full access until then.)
                    </span>
                  )}
                </>
              ) : (
                "Existing uploaded PDFs, parsed Shipping Bills, and matched records remain readable regardless of plan tier."
              )}
            </CardDescription>
          </div>

          {isPaidActive && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-text-muted hover:text-danger"
                onClick={() => setIsCancelModalOpen(true)}
                data-testid="cancel-subscription-trigger"
              >
                Cancel subscription
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <UsageMeterCard
            caption="Monthly Shipping Bills"
            used={usage.shippingBillsUsed}
            limit={usage.shippingBillsLimit}
            unitLabel="SBs this month"
            planDisplayName={usage.planDisplayName}
            secondaryText="Resets on the 1st of every month (Asia/Kolkata)."
            testId="billing-usage-sb"
          />
          <UsageMeterCard
            caption="IEC Profiles"
            used={usage.iecsUsed}
            limit={usage.maxIecs}
            unitLabel="IECs used"
            planDisplayName={usage.planDisplayName}
            secondaryText="All existing IEC data remains readable even after downgrade."
            testId="billing-usage-iec"
          />
          <UsageMeterCard
            caption="Team Seats"
            used={usage.seatsUsed}
            limit={usage.teamSeatsLimit}
            unitLabel="seats used"
            planDisplayName={usage.planDisplayName}
            secondaryText="Includes active members and pending email invitations."
            testId="billing-usage-seats"
          />
        </CardContent>
      </Card>

      <section aria-labelledby="paid-plans-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="paid-plans-heading" className="text-lg font-semibold text-text">
              Choose a plan
            </h2>
            <p className="text-xs text-text-muted">
              Recurring INR subscriptions via Razorpay. Secure UPI Autopay, Netbanking &amp; Cards.
              No DSC or portal passwords ever required.
            </p>
          </div>
          <div className="inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-pill)] border border-border-subtle bg-surface-muted px-3 py-1 text-xs font-medium text-text">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span>No DSC or portal passwords ever required</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {PAID_PLAN_KEYS.map((key) => {
            const plan = PLANS[key];
            const isHighlighted = highlightedPlanKey === key;
            const isCurrent = usage.planKey === key;
            const formattedPrice = formatMoney(plan.pricePaise, "INR", {
              showCode: false,
              showDecimals: "never",
            });
            const periodLabel = plan.billingPeriod === "annual" ? "/ year" : "/ month";

            return (
              <Card
                key={plan.key}
                data-testid={`plan-card-${plan.key}`}
                className={cn(
                  "flex flex-col justify-between transition-shadow",
                  isHighlighted && "border-accent ring-2 ring-accent/30 shadow-[var(--shadow-md)]"
                )}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{plan.displayName}</CardTitle>
                    {isHighlighted ? (
                      <Badge variant="accent">
                        <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
                        Recommended
                      </Badge>
                    ) : isCurrent ? (
                      <Badge variant="success">Current plan</Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tabular-nums text-text">
                      {formattedPrice}
                    </span>
                    <span className="text-xs text-text-muted">{periodLabel}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <PlanFeatureList plan={plan} />
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        <span>Active plan</span>
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant={isHighlighted ? "primary" : "secondary"}
                        size="sm"
                        className="min-h-11"
                        onClick={() => handleSelectPlan(plan.key)}
                        data-testid={`subscribe-btn-${plan.key}`}
                      >
                        <CreditCard className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        <span>{isPaidActive ? "Switch to this plan" : "Subscribe now"}</span>
                      </Button>
                    )}

                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{APP_CONFIG.whatsappNumber}</span>
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Payment status modal (verifying, activating, success, delayed, plan-change) */}
      <PaymentStatusModal
        step={modalStep}
        targetPlanName={targetPlan.displayName}
        errorMessage={errorMessage}
        orgName={orgName}
        onClose={() => setModalStep("idle")}
        onSuccessDone={() => {
          setModalStep("idle");
          router.push("/app");
        }}
        onProceedWithPlanChange={() => {
          if (targetPlanKey) {
            initiateSubscription(targetPlanKey);
          }
        }}
      />

      {/* Cancel subscription confirmation dialog */}
      <Dialog open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
        <DialogContent data-testid="cancel-subscription-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
              <span>Cancel subscription?</span>
            </DialogTitle>
            <DialogDescription>
              Your subscription will cancel at the end of your current billing period. You will
              retain full access to all {currentPlan.displayName} entitlements until then.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted p-3 text-xs text-text-muted">
            <p className="font-semibold text-text">What happens next:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>No further charges will be made to your payment method.</li>
              <li>Your workspace will transition gently to the Free plan when the cycle ends.</li>
              <li>
                All existing shipment records, parsed PDFs, and matches remain permanently readable.
              </li>
            </ul>
          </div>

          <DialogFooter className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsCancelModalOpen(false)}
              disabled={isCanceling}
            >
              Keep subscription
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancelSubscription}
              disabled={isCanceling}
              data-testid="confirm-cancel-subscription-btn"
            >
              {isCanceling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Canceling...</span>
                </>
              ) : (
                "Confirm cancellation"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_CONFIG } from "@/config/app";

export type PaymentModalStep =
  | "idle"
  | "confirming_plan_change"
  | "initiating"
  | "verifying"
  | "activating"
  | "success"
  | "delayed"
  | "failed"
  | "dismissed";

export interface PaymentStatusModalProps {
  step: PaymentModalStep;
  targetPlanName: string;
  errorMessage?: string | null;
  orgName?: string;
  onClose: () => void;
  onSuccessDone?: () => void;
  onProceedWithPlanChange?: () => void;
}

export function PaymentStatusModal({
  step,
  targetPlanName,
  errorMessage,
  orgName = "Your organization",
  onClose,
  onSuccessDone,
  onProceedWithPlanChange,
}: PaymentStatusModalProps) {
  const isOpen = step !== "idle";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (
          !open &&
          (step === "success" ||
            step === "failed" ||
            step === "delayed" ||
            step === "dismissed" ||
            step === "confirming_plan_change")
        ) {
          onClose();
        }
      }}
    >
      <DialogContent data-testid="payment-status-modal" className="sm:max-w-md" aria-live="polite">
        {step === "confirming_plan_change" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-text">
                <Clock className="h-5 w-5 text-accent" aria-hidden="true" />
                <span>Change subscription plan</span>
              </DialogTitle>
              <DialogDescription>
                You already have an active subscription. Changing your plan will create a new
                subscription for <span className="font-semibold text-text">{targetPlanName}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted p-4 text-xs text-text-muted">
              <p className="font-medium text-text">
                Your new plan starts today; your old plan will not renew.
              </p>
              <p>
                Your previous subscription will remain active until the end of its current billing
                cycle, after which you will only be charged for the new plan.
              </p>
            </div>

            <DialogFooter className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="ghost" onClick={onClose}>
                Keep current plan
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={onProceedWithPlanChange}
                data-testid="confirm-plan-change-button"
              >
                Proceed to checkout
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "initiating" && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-accent" aria-hidden="true" />
            <DialogTitle className="mt-4 text-lg font-semibold text-text">
              Preparing secure checkout...
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-text-muted">
              Initializing Razorpay checkout for {targetPlanName}.
            </DialogDescription>
          </div>
        )}

        {(step === "verifying" || step === "activating") && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
              <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden="true" />
            </div>
            <DialogTitle className="mt-4 text-lg font-semibold text-text">
              Confirming your payment...
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-text-muted">
              We received your authorization from Razorpay and are waiting for the server activation
              webhook.
            </DialogDescription>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-border-subtle bg-surface-muted px-3 py-1 text-xs text-text-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              <span>Please keep this window open</span>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success shadow-[var(--shadow-sm)]">
              <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
            </div>
            <DialogTitle className="mt-4 text-xl font-bold text-text">
              Welcome to {targetPlanName}!
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-text-muted">
              Your subscription is active. All entitlements, higher monthly limits, and bulk eBRC
              exports are now unlocked.
            </DialogDescription>
            <DialogFooter className="mt-6 w-full">
              <Button
                type="button"
                variant="primary"
                className="w-full"
                onClick={onSuccessDone ?? onClose}
                data-testid="payment-success-done-button"
              >
                Go to workspace
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "delayed" && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning-soft text-warning">
              <AlertTriangle className="h-9 w-9" aria-hidden="true" />
            </div>
            <DialogTitle className="mt-4 text-lg font-semibold text-text">
              Payment received, activation is taking longer than usual
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-text-muted">
              Your payment signature was verified, but Razorpay’s webhook activation is taking a
              moment to confirm. Your account will update automatically once the webhook arrives.
            </DialogDescription>
            <div className="mt-6 flex w-full flex-col gap-2">
              <Button asChild variant="primary" className="w-full">
                <a
                  href={`mailto:${APP_CONFIG.supportEmail}?subject=${encodeURIComponent(
                    `Payment activation taking longer for ${orgName} (${targetPlanName})`
                  )}`}
                >
                  <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                  <span>Contact support</span>
                </a>
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={onClose}>
                Keep waiting in background
              </Button>
            </div>
          </div>
        )}

        {step === "failed" && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft text-danger">
              <XCircle className="h-9 w-9" aria-hidden="true" />
            </div>
            <DialogTitle className="mt-4 text-lg font-semibold text-text">
              Payment could not be completed
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-text-muted">
              {errorMessage || "The checkout attempt was interrupted or declined by your bank."}
            </DialogDescription>
            <DialogFooter className="mt-6 w-full">
              <Button type="button" variant="primary" className="w-full" onClick={onClose}>
                Try again
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "dismissed" && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <DialogTitle className="text-lg font-semibold text-text">
              Checkout dismissed
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-text-muted">
              You closed the Razorpay checkout window before completing your subscription. No
              charges were made.
            </DialogDescription>
            <DialogFooter className="mt-6 w-full">
              <Button type="button" variant="primary" className="w-full" onClick={onClose}>
                Return to plans
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

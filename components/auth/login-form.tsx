"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Mail, ShieldCheck, Zap } from "lucide-react";
import { APP_CONFIG } from "@/config/app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface LoginFormProps {
  nextPath: string;
  initialError?: string;
  supabaseEnabled: boolean;
  pgliteTestMode: boolean;
  devMode?: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  expired_link:
    "That sign-in link has expired or was already used. Enter your email below for a fresh link.",
  auth_failed: "We could not complete sign-in. Please try again.",
  auth_unconfigured:
    "Supabase Auth keys are not configured yet. You can click 'Force Login' below to bypass login and test the app.",
};

export function LoginForm({
  nextPath,
  initialError,
  supabaseEnabled,
  pgliteTestMode,
  devMode = false,
}: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [otpCode, setOtpCode] = React.useState("");
  const [step, setStep] = React.useState<"email" | "otp_sent">("email");
  const [loading, setLoading] = React.useState(false);
  const [forceLoading, setForceLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(
    initialError ? (ERROR_MESSAGES[initialError] ?? ERROR_MESSAGES.auth_failed ?? null) : null
  );

  async function handleForceLogin(targetEmail?: string) {
    setErrorMessage(null);
    setForceLoading(true);

    try {
      const res = await fetch("/api/auth/force-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: targetEmail?.trim() || undefined,
          nextPath,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        setErrorMessage(body.error?.message ?? "Force login failed.");
        setForceLoading(false);
        return;
      }

      const body = (await res.json()) as { redirectTo?: string };
      window.location.href = body.redirectTo || nextPath || "/app";
    } catch {
      setErrorMessage("Could not complete force login. Please try again.");
      setForceLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setErrorMessage(null);
    if (!supabaseEnabled) {
      setErrorMessage(ERROR_MESSAGES.auth_unconfigured ?? null);
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", nextPath);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });
      if (error) {
        setErrorMessage(error.message);
        setLoading(false);
      }
    } catch {
      setErrorMessage("Could not start Google sign-in.");
      setLoading(false);
    }
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setErrorMessage("Enter your email address.");
      return;
    }

    setLoading(true);
    try {
      if (pgliteTestMode) {
        const res = await fetch("/api/auth/test-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: { message?: string } };
          setErrorMessage(body.error?.message ?? "Sign-in failed.");
          setLoading(false);
          return;
        }
        const [orgsRes, onboardingRes] = await Promise.all([
          fetch("/api/orgs"),
          fetch("/api/onboarding"),
        ]);
        const orgsJson = (await orgsRes.json()) as { organizations?: Array<{ orgId: string }> };
        const onboardingJson = onboardingRes.ok
          ? ((await onboardingRes.json()) as {
              profile?: { completedAt?: string | null; skippedAt?: string | null };
            })
          : null;
        const onboardingDone = Boolean(
          onboardingJson?.profile?.completedAt || onboardingJson?.profile?.skippedAt
        );

        if (nextPath.startsWith("/invite/")) {
          router.push(nextPath);
        } else if (
          !orgsJson.organizations ||
          orgsJson.organizations.length === 0 ||
          !onboardingDone
        ) {
          router.push("/onboarding");
        } else {
          router.push(nextPath);
        }
        return;
      }

      if (!supabaseEnabled) {
        setErrorMessage(ERROR_MESSAGES.auth_unconfigured ?? null);
        setLoading(false);
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", nextPath);

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: callbackUrl.toString(),
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      setStep("otp_sent");
    } catch {
      setErrorMessage("Could not send sign-in email. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    if (!supabaseEnabled) return;

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otpCode.trim(),
        type: "email",
      });
      if (error) {
        setErrorMessage("Invalid or expired 6-digit code. Request a new one.");
        setLoading(false);
        return;
      }
      router.push(nextPath.startsWith("/invite/") ? nextPath : "/app");
    } catch {
      setErrorMessage("Could not verify code.");
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-primary-fg">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <Badge variant="accent">No passwords needed</Badge>
        </div>
        <CardTitle className="text-xl font-bold">Sign in to {APP_CONFIG.name}</CardTitle>
        <CardDescription>
          Quick sign-in with Google or an email magic link / one-time code.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {devMode && (
          <div className="flex flex-col gap-2.5 rounded-[var(--radius-sm)] border-2 border-dashed border-amber-500/50 bg-amber-500/10 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <Zap className="h-4 w-4" aria-hidden="true" />
                Dev Mode &bull; Force Login
              </span>
              <Badge variant="warning">Bypass Auth</Badge>
            </div>
            <p className="text-xs text-text-muted">
              Supabase Auth setup is pending. Click below to immediately log in and explore the full
              workspace.
            </p>
            <Button
              type="button"
              variant="primary"
              className="w-full bg-amber-600 hover:bg-amber-700 text-white shadow-sm font-semibold"
              onClick={() => handleForceLogin(email)}
              loading={forceLoading}
              loadingText="Bypassing authentication..."
              data-testid="force-login-btn"
            >
              <Zap className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {email.trim() ? `Force Login as ${email.trim()}` : "⚡ Force Login (Demo Account)"}
              </span>
            </Button>
            {email.trim() ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-xs text-text-muted hover:text-text"
                onClick={() => handleForceLogin("demo-exporter@example.invalid")}
                disabled={forceLoading}
              >
                Or Force Login with Default Demo Account
              </Button>
            ) : null}
          </div>
        )}

        {errorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-danger/30 bg-danger-soft p-3 text-sm text-danger-soft-fg"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <Button
          variant="secondary"
          className="w-full"
          onClick={handleGoogleLogin}
          disabled={loading || pgliteTestMode}
        >
          Continue with Google
        </Button>

        <div className="relative flex items-center py-1">
          <span className="h-px flex-1 bg-border-subtle" />
          <span className="px-3 text-xs font-medium uppercase tracking-wide text-text-muted">
            or email
          </span>
          <span className="h-px flex-1 bg-border-subtle" />
        </div>

        {step === "email" ? (
          <form onSubmit={handleSendEmail} className="flex flex-col gap-3">
            <Input
              label="Work email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="accounts@company.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={loading}
              loadingText="Sending link..."
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              <span>Send magic link</span>
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3">
            <div className="rounded-[var(--radius-sm)] bg-accent-soft p-3 text-xs text-accent-soft-fg">
              Check <strong>{email}</strong> for your magic link, or enter the 6-digit code below.
            </div>
            <Input
              label="6-digit email code"
              inputMode="numeric"
              maxLength={8}
              placeholder="123456"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              required
            />
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={loading}
              loadingText="Verifying..."
            >
              Verify code
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep("email");
                setOtpCode("");
              }}
            >
              Use another email or resend link
            </Button>
          </form>
        )}

        <p className="border-t border-border-subtle pt-3 text-center text-xs font-medium text-text-muted">
          We never ask for your DSC or portal passwords.
        </p>
      </CardContent>
    </Card>
  );
}

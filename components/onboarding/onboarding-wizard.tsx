"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  FileSpreadsheet,
  FileText,
  Landmark,
  ListChecks,
  Sparkles,
  Upload,
} from "lucide-react";
import { DashboardSummaryView } from "@/components/dashboard/dashboard-summary-view";
import { TrustFooterBar } from "@/components/trust/trust-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { useToast } from "@/components/ui/toast";
import type { IecWithAlertCount, UserOrganizationSummary } from "@/lib/auth/repository";
import type { DashboardSummary, OnboardingProfileState } from "@/lib/onboarding/repository";
import { cn } from "@/lib/utils";
import type { OnboardingPreferences } from "@/lib/validation/onboarding";

const WIZARD_STEPS: readonly StepperStep[] = [
  { id: "who", label: "Who are you?", description: "Role, firm & IEC" },
  { id: "checks", label: "What to check", description: "RoDTEP, deadlines, eBRC" },
  { id: "files", label: "Add your files", description: "Upload or demo" },
  { id: "result", label: "Your first result", description: "Leakage overview" },
];

type RoleChoice = "exporter" | "exim_consultant" | "ca_firm";

const ROLE_OPTIONS: Array<{
  choice: RoleChoice;
  title: string;
  description: string;
}> = [
  {
    choice: "exporter",
    title: "Exporter",
    description: "Owner or accounts team managing one exporter IEC.",
  },
  {
    choice: "exim_consultant",
    title: "EXIM consultant or CHA",
    description: "Manage shipping bills and eBRCs for multiple exporter IECs.",
  },
  {
    choice: "ca_firm",
    title: "CA firm",
    description: "Audit incentive claims, IRM reconciliations, and compliance.",
  },
];

const CHECK_CARDS: Array<{
  key: keyof OnboardingPreferences;
  title: string;
  description: string;
  icon: typeof Sparkles;
}> = [
  {
    key: "checkRodtep",
    title: "RoDTEP & Duty Drawback money",
    description: "Compare expected scheme credits against customs scrolls and spot shortfalls.",
    icon: Sparkles,
  },
  {
    key: "checkDeadlines",
    title: "FEMA payment deadlines",
    description: "Track approaching realisation dates and scrip expiry windows.",
    icon: Landmark,
  },
  {
    key: "checkEbrc",
    title: "Bulk eBRC Excel generator",
    description: "Match bank IRMs to shipping bills and prepare DGFT-format uploads.",
    icon: FileSpreadsheet,
  },
];

export interface OnboardingWizardProps {
  initialProfile: OnboardingProfileState;
  initialOrg: UserOrganizationSummary | null;
  initialIecs: readonly IecWithAlertCount[];
  initialSummary: DashboardSummary | null;
}

export function OnboardingWizard({
  initialProfile,
  initialOrg,
  initialIecs,
  initialSummary,
}: OnboardingWizardProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = React.useState<number>(initialProfile.currentStep || 1);
  const [org, setOrg] = React.useState<UserOrganizationSummary | null>(initialOrg);
  const [iecs, setIecs] = React.useState<readonly IecWithAlertCount[]>(initialIecs);
  const [summary, setSummary] = React.useState<DashboardSummary | null>(initialSummary);

  const [roleChoice, setRoleChoice] = React.useState<RoleChoice>(
    initialOrg?.type === "consultant" ? "exim_consultant" : "exporter"
  );
  const [companyName, setCompanyName] = React.useState(initialOrg?.name ?? "");
  const [iecCode, setIecCode] = React.useState(initialIecs.find((i) => !i.isDemo)?.iecCode ?? "");
  const [gstin, setGstin] = React.useState(initialIecs.find((i) => !i.isDemo)?.gstin ?? "");
  const [preferences, setPreferences] = React.useState<OnboardingPreferences>(
    initialProfile.preferences
  );

  const [uploadFilename, setUploadFilename] = React.useState("");
  const [loadingAction, setLoadingAction] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "step_viewed", eventStep: step }),
    });
  }, [step]);

  async function refreshOrgSummary(orgId: string) {
    const res = await fetch(`/api/orgs/${orgId}/iecs`);
    if (res.ok) {
      const json = (await res.json()) as { iecs?: IecWithAlertCount[] };
      if (json.iecs) setIecs(json.iecs);
    }
  }

  async function handleStepOneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoadingAction("step1");

    try {
      const res = await fetch("/api/onboarding/step1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleChoice,
          name: companyName,
          iecCode,
          gstin,
        }),
      });
      const body = (await res.json()) as {
        organization?: UserOrganizationSummary;
        error?: { message?: string };
      };

      if (!res.ok || !body.organization) {
        setError(body.error?.message ?? "Could not save organization details.");
        return;
      }

      setOrg(body.organization);
      await refreshOrgSummary(body.organization.orgId);
      setStep(2);
    } catch {
      setError("Network error while saving your organization.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleStepTwoContinue() {
    setError(null);
    setLoadingAction("step2");
    try {
      const res = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStep: 3,
          preferences,
          eventType: "step_completed",
          eventStep: 2,
        }),
      });
      if (!res.ok) {
        setError("Could not save preferences.");
        return;
      }
      setStep(3);
    } catch {
      setError("Network error while saving preferences.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function goToStep(nextStep: number, skippedFrom?: number) {
    setError(null);
    if (skippedFrom) {
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStep: nextStep,
          eventType: "step_skipped",
          eventStep: skippedFrom,
        }),
      });
    } else {
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStep: nextStep }),
      });
    }
    setStep(nextStep);
  }

  async function handleTrySampleData() {
    if (!org) {
      setError("Finish Step 1 with your company name first.");
      setStep(1);
      return;
    }

    setError(null);
    setLoadingAction("demo");
    try {
      const res = await fetch(`/api/orgs/${org.orgId}/demo`, {
        method: "POST",
      });
      const body = (await res.json()) as {
        summary?: DashboardSummary;
        error?: { message?: string };
      };

      if (!res.ok || !body.summary) {
        setError(body.error?.message ?? "Could not create sample demo workspace.");
        return;
      }

      setSummary(body.summary);
      toast({
        title: "Sample workspace ready",
        description: "Synthetic demo shipments and unclaimed RoDTEP items loaded.",
        variant: "success",
      });
      setStep(4);
    } catch {
      setError("Network error while creating sample workspace.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleQuickUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setError(null);

    const targetIec = iecs.find((i) => !i.isDemo) ?? iecs[0];
    if (!targetIec) {
      setError("Add a valid 10-character IEC code in Step 1 first, or try sample data below.");
      return;
    }

    setLoadingAction("upload");
    try {
      const res = await fetch(`/api/orgs/${org.orgId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iecId: targetIec.id,
          kind: "shipping_bill",
          originalName: uploadFilename,
        }),
      });
      const body = (await res.json()) as {
        trialStarted?: boolean;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(body.error?.message ?? "Could not queue uploaded file.");
        return;
      }

      toast({
        title: body.trialStarted ? "7-day Pro trial started!" : "File queued for parsing",
        description: body.trialStarted
          ? "Your first file upload unlocked full 7-day Pro access without a card."
          : "Your upload is queued.",
        variant: "success",
      });

      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStep: 4, eventType: "step_completed", eventStep: 3 }),
      });

      const dashRes = await fetch(`/api/orgs/${org.orgId}/dashboard`);
      if (dashRes.ok) {
        const dashJson = (await dashRes.json()) as { summary?: DashboardSummary };
        if (dashJson.summary) {
          setSummary(dashJson.summary);
        }
      }

      setStep(4);
    } catch {
      setError("Network error while queueing file.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleFinishWizard(skipped = false) {
    setLoadingAction(skipped ? "skip_all" : "finish");
    try {
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          skipped
            ? { markSkipped: true, eventType: "wizard_skipped", eventStep: step }
            : { markCompleted: true, eventType: "wizard_completed", eventStep: step }
        ),
      });
      router.push(skipped ? "/app" : "/app?tour=1");
    } finally {
      setLoadingAction(null);
    }
  }

  const progressPercent = Math.round((step / WIZARD_STEPS.length) * 100);

  return (
    <main
      className="flex min-h-dvh w-full flex-col bg-bg sm:items-center sm:justify-center sm:px-4 sm:py-8"
      data-testid="onboarding-wizard"
    >
      <div className="flex min-h-dvh w-full max-w-4xl flex-col justify-between bg-surface sm:min-h-0 sm:rounded-[var(--radius-card)] sm:border sm:border-border-subtle sm:shadow-[var(--shadow-lg)]">
        {/* Top Progress Header */}
        <header className="border-b border-border-subtle px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="accent">Step {step} of 4</Badge>
              <span className="text-xs font-medium text-text-muted">Guided Setup</span>
            </div>
            <div className="flex items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="sm:hidden">
                    <ListChecks className="h-4 w-4" aria-hidden="true" />
                    <span>Steps</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom">
                  <SheetHeader>
                    <SheetTitle>Setup progress</SheetTitle>
                    <SheetDescription>Four quick steps to see your first result.</SheetDescription>
                  </SheetHeader>
                  <Stepper steps={WIZARD_STEPS} currentStep={step - 1} />
                </SheetContent>
              </Sheet>
              {org ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFinishWizard(true)}
                  loading={loadingAction === "skip_all"}
                  data-testid="wizard-skip-all-btn"
                >
                  Skip wizard
                </Button>
              ) : null}
            </div>
          </div>

          <div
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Onboarding progress"
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
          >
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-4 hidden sm:block">
            <Stepper steps={WIZARD_STEPS} currentStep={step - 1} />
          </div>
        </header>

        {/* Step Body */}
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-[var(--radius-sm)] border border-danger/30 bg-danger-soft p-3 text-sm text-danger-soft-fg"
            >
              {error}
            </div>
          ) : null}

          {step === 1 ? (
            <form
              id="onboarding-step-1-form"
              onSubmit={handleStepOneSubmit}
              className="flex flex-col gap-5"
            >
              <div>
                <h1 className="text-xl font-bold text-text sm:text-2xl">Who are you?</h1>
                <p className="mt-1 text-sm text-text-muted">
                  Confirm your role and company details. Add your IEC now or skip straight to sample
                  data on step 3.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {ROLE_OPTIONS.map((opt) => {
                  const selected = roleChoice === opt.choice;
                  return (
                    <button
                      key={opt.choice}
                      type="button"
                      onClick={() => setRoleChoice(opt.choice)}
                      aria-pressed={selected}
                      data-testid={`role-card-${opt.choice}`}
                      className={cn(
                        "flex min-h-11 flex-col items-start gap-1.5 rounded-[var(--radius-card)] border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                        selected
                          ? "border-accent bg-accent-soft/50 text-text"
                          : "border-border-subtle bg-surface hover:bg-surface-muted/50"
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <Building2
                          className={cn("h-4 w-4", selected ? "text-accent" : "text-text-muted")}
                          aria-hidden="true"
                        />
                        {selected ? <Badge variant="accent">Selected</Badge> : null}
                      </div>
                      <span className="text-sm font-semibold text-text">{opt.title}</span>
                      <span className="text-xs text-text-muted">{opt.description}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label={
                    roleChoice === "exporter"
                      ? "Company / Exporter name"
                      : "Firm / Organization name"
                  }
                  name="companyName"
                  placeholder={
                    roleChoice === "exporter"
                      ? "e.g. Kaveri Garments Pvt Ltd"
                      : "e.g. Horizon EXIM Advisors"
                  }
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
                <Input
                  label="IEC Code (optional now)"
                  name="iecCode"
                  placeholder="AAACH1234K"
                  maxLength={10}
                  value={iecCode}
                  onChange={(e) => setIecCode(e.target.value.toUpperCase())}
                  hint="10-character alphanumeric code"
                />
              </div>

              <Input
                label="GSTIN (optional)"
                name="gstin"
                placeholder="33AAACH1234K1Z5"
                maxLength={15}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
              />
            </form>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-5">
              <div>
                <h1 className="text-xl font-bold text-text sm:text-2xl">
                  What do you want to check?
                </h1>
                <p className="mt-1 text-sm text-text-muted">
                  Choose what matters most right now. You can adjust preferences anytime.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {CHECK_CARDS.map((card) => {
                  const Icon = card.icon;
                  const active = preferences[card.key];
                  return (
                    <button
                      key={card.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setPreferences((prev) => ({ ...prev, [card.key]: !prev[card.key] }))
                      }
                      className={cn(
                        "flex min-h-11 flex-col items-start gap-2 rounded-[var(--radius-card)] border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                        active
                          ? "border-accent bg-accent-soft/50 text-text"
                          : "border-border-subtle bg-surface hover:bg-surface-muted/50"
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <Icon
                          className={cn("h-5 w-5", active ? "text-accent" : "text-text-muted")}
                          aria-hidden="true"
                        />
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full border",
                            active
                              ? "border-accent bg-accent text-accent-fg"
                              : "border-border text-transparent"
                          )}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-text">{card.title}</span>
                      <span className="text-xs leading-relaxed text-text-muted">
                        {card.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-5">
              <div>
                <h1 className="text-xl font-bold text-text sm:text-2xl">Add your files</h1>
                <p className="mt-1 text-sm text-text-muted">
                  You stay in full control: download your own files from the official portals or try
                  our sanitised demo workspace first.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-accent" aria-hidden="true" />
                      <span>1. Shipping Bill PDFs</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs leading-relaxed text-text-muted">
                    Where to download: <strong>ICEGATE</strong> (Public Enquiry / Document Download)
                    or request the PDF copies directly from your CHA.
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Landmark className="h-4 w-4 text-accent" aria-hidden="true" />
                      <span>2. Bank IRM Export</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs leading-relaxed text-text-muted">
                    Where to download: <strong>DGFT portal</strong> (Services &rarr; e-BRC &rarr;
                    View / Manage IRM) or your AD bank&apos;s inward remittance CSV/Excel.
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
                      <span>3. Customs Incentive Scroll</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs leading-relaxed text-text-muted">
                    Where to download: <strong>ICEGATE</strong> (RoDTEP Scrip / Drawback Status
                    export) showing amounts customs actually credited.
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card className="border-accent/40 bg-accent-soft/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
                      <span>Explore instantly with sample data</span>
                    </CardTitle>
                    <CardDescription>
                      Creates a clearly labelled <strong>DEMO000101</strong> IEC with synthetic
                      shipping bills, IRM remittances, and unclaimed RoDTEP items. Deletable in one
                      click.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      type="button"
                      variant="primary"
                      className="w-full"
                      onClick={handleTrySampleData}
                      loading={loadingAction === "demo"}
                      loadingText="Creating sample workspace..."
                      data-testid="try-sample-data-btn"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      <span>Try with sample data</span>
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Upload className="h-4 w-4 text-accent" aria-hidden="true" />
                      <span>Or queue your first file</span>
                    </CardTitle>
                    <CardDescription>
                      Uploading your first real file automatically activates your free 7-day Pro
                      trial.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleQuickUpload} className="flex flex-col gap-3">
                      <Input
                        label="Shipping Bill filename"
                        placeholder="e.g. sb-8492014.pdf"
                        value={uploadFilename}
                        onChange={(e) => setUploadFilename(e.target.value)}
                        required
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        loading={loadingAction === "upload"}
                        loadingText="Queueing..."
                      >
                        Upload &amp; see result
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="flex flex-col gap-4" data-testid="onboarding-first-result">
              <div>
                <h1 className="text-xl font-bold text-text sm:text-2xl">Your first result</h1>
                <p className="mt-1 text-sm text-text-muted">
                  Here is your workspace summary. Continue to the full dashboard to inspect details
                  and start the 5-step guided tour.
                </p>
              </div>

              {summary && org ? (
                <DashboardSummaryView
                  summary={summary}
                  orgName={org.name}
                  role={org.role}
                  embeddedInWizard
                  onDemoDeleted={() => {
                    setSummary(null);
                    setStep(3);
                  }}
                />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Workspace ready</CardTitle>
                    <CardDescription>
                      Your organization is ready. Upload your first Shipping Bill PDF or load sample
                      data to populate your metrics.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button type="button" variant="secondary" onClick={handleTrySampleData}>
                      Load sample demo data
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </div>

        {/* Sticky Bottom Footer */}
        <footer className="flex flex-col gap-3 border-t border-border-subtle bg-surface px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => goToStep(step - 1)}
                  data-testid="wizard-back-btn"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Back</span>
                </Button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {step === 1 ? (
                <Button
                  type="submit"
                  form="onboarding-step-1-form"
                  variant="primary"
                  loading={loadingAction === "step1"}
                  loadingText="Saving..."
                  data-testid="wizard-step1-submit"
                >
                  <span>Continue</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}

              {step === 2 ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => goToStep(3, 2)}
                    data-testid="wizard-skip-step-btn"
                  >
                    Skip
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleStepTwoContinue}
                    loading={loadingAction === "step2"}
                    loadingText="Saving..."
                    data-testid="wizard-step2-submit"
                  >
                    <span>Continue</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </>
              ) : null}

              {step === 3 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleFinishWizard(true)}
                  data-testid="wizard-skip-step-btn"
                >
                  Skip to workspace
                </Button>
              ) : null}

              {step === 4 ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => handleFinishWizard(false)}
                  loading={loadingAction === "finish"}
                  loadingText="Opening..."
                  data-testid="finish-onboarding-btn"
                >
                  <span>Open dashboard</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </div>

          <TrustFooterBar />
        </footer>
      </div>
    </main>
  );
}

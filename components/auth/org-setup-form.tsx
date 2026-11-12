"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Building2, CheckCircle2, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type RoleChoice = "exporter" | "exim_consultant" | "ca_firm";

const ROLE_OPTIONS: ReadonlyArray<{
  value: RoleChoice;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}> = [
  {
    value: "exporter",
    title: "Exporter",
    subtitle: "Owner or accounts team managing 1 IEC",
    icon: <Building2 className="h-5 w-5" aria-hidden="true" />,
  },
  {
    value: "exim_consultant",
    title: "EXIM consultant or CHA",
    subtitle: "Managing multiple client exporter IECs",
    icon: <Briefcase className="h-5 w-5" aria-hidden="true" />,
  },
  {
    value: "ca_firm",
    title: "CA firm",
    subtitle: "Advisory & GST/DGFT reconciliation for clients",
    icon: <FileCheck2 className="h-5 w-5" aria-hidden="true" />,
  },
];

export function OrgSetupForm() {
  const router = useRouter();
  const [roleChoice, setRoleChoice] = React.useState<RoleChoice>("exporter");
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleChoice, name }),
      });

      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? "Could not create organization.");
        setLoading(false);
        return;
      }

      router.refresh();
    } catch {
      setError("Network error while creating organization.");
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-xl font-bold">Tell us who you are</CardTitle>
        <CardDescription>
          This sets up your workspace. Exporters get a single-IEC view; consultants &amp; CA firms
          can manage up to 25 client IECs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-1 text-sm font-medium text-text">I am an...</legend>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {ROLE_OPTIONS.map((option) => {
                const selected = roleChoice === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setRoleChoice(option.value)}
                    className={cn(
                      "flex min-h-11 flex-col items-start gap-2 rounded-[var(--radius-card)] border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                      selected
                        ? "border-accent bg-accent-soft/50 text-text"
                        : "border-border-subtle bg-surface hover:bg-surface-muted/50"
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-accent">{option.icon}</span>
                      {selected ? (
                        <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" />
                      ) : null}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text">{option.title}</p>
                      <p className="mt-0.5 text-xs text-text-muted">{option.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Input
            label={roleChoice === "exporter" ? "Company / Exporter name" : "Practice / Firm name"}
            placeholder={
              roleChoice === "exporter" ? "Kaveri Garments Pvt Ltd" : "Horizon EXIM Advisors"
            }
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          {error ? (
            <p role="alert" className="text-sm font-medium text-danger-soft-fg">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" loading={loading} loadingText="Creating...">
            Create organization &amp; continue
          </Button>

          <p className="text-center text-xs text-text-muted">
            We never ask for your DSC or portal passwords.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

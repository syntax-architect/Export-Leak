"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { IecWithAlertCount } from "@/lib/auth/repository";
import type { MembershipRole, OrganizationType } from "@/lib/database.types";

export interface IecManagerProps {
  orgId: string;
  orgType: OrganizationType;
  role: MembershipRole;
  initialIecs: readonly IecWithAlertCount[];
}

export function IecManager({ orgId, orgType, role, initialIecs }: IecManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [iecCode, setIecCode] = React.useState("");
  const [legalName, setLegalName] = React.useState("");
  const [gstin, setGstin] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canWrite = role !== "viewer";

  async function handleAddIec(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/orgs/${orgId}/iecs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iecCode, legalName, gstin }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? "Could not add IEC profile.");
        setLoading(false);
        return;
      }

      setIecCode("");
      setLegalName("");
      setGstin("");
      toast({ title: "IEC profile added", variant: "success" });
      router.refresh();
    } catch {
      setError("Network error while adding IEC.");
    } finally {
      setLoading(false);
    }
  }

  const columns: readonly DataTableColumn<IecWithAlertCount>[] = [
    {
      id: "iecCode",
      header: "IEC Code",
      cell: (row) => <span className="font-semibold tabular-nums-money">{row.iecCode}</span>,
    },
    {
      id: "legalName",
      header: "Legal Name",
      cell: (row) => row.legalName,
    },
    {
      id: "gstin",
      header: "GSTIN",
      cell: (row) => row.gstin ?? "—",
    },
    {
      id: "alerts",
      header: "Open Alerts",
      align: "right",
      cell: (row) => (
        <Badge variant={row.openAlertsCount > 0 ? "warning" : "neutral"}>
          {row.openAlertsCount}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">
          {orgType === "consultant" ? "Client IEC Profiles" : "IEC Profile"}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          IEC codes must be exactly 10 alphanumeric characters.
        </p>
      </div>

      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>{orgType === "consultant" ? "Add client IEC" : "Add IEC profile"}</CardTitle>
            <CardDescription>
              Register an exporter IEC profile for tracking Shipping Bills and eBRC readiness.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddIec} className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input
                label="IEC Code"
                placeholder="AAACH1234K"
                maxLength={10}
                value={iecCode}
                onChange={(e) => setIecCode(e.target.value.toUpperCase())}
                required
              />
              <Input
                label="Legal Name"
                placeholder="Kaveri Textiles Pvt Ltd"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                required
              />
              <Input
                label="GSTIN (optional)"
                placeholder="33AAACH1234K1Z5"
                maxLength={15}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
              />
              {error ? (
                <p role="alert" className="text-sm font-medium text-danger-soft-fg md:col-span-3">
                  {error}
                </p>
              ) : null}
              <div className="md:col-span-3">
                <Button type="submit" variant="primary" loading={loading} loadingText="Saving...">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>{orgType === "consultant" ? "Add client IEC" : "Save IEC profile"}</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4 text-sm text-text-muted sm:pt-6">
            You have <strong>viewer</strong> access (read-only) and cannot add IEC profiles.
          </CardContent>
        </Card>
      )}

      <DataTable
        data={initialIecs}
        columns={columns}
        keyExtractor={(row) => row.id}
        mobileTitle={(row) => row.legalName}
        mobileSubtitle={(row) => `IEC: ${row.iecCode}`}
        caption="Organization IEC profiles"
        emptyState={
          <EmptyState
            icon={<Building2 className="h-6 w-6" aria-hidden="true" />}
            title="No IEC profiles yet"
            description="Add an IEC profile above to start uploading documents."
          />
        }
      />
    </div>
  );
}

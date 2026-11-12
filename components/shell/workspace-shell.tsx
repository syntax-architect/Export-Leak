"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  BadgeIndianRupee,
  Building2,
  Check,
  ChevronsUpDown,
  Compass,
  FileCheck2,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { AppShell, type AppNavItem, type OrgSwitcherOption } from "@/components/shell/app-shell";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { TrustGuaranteesList } from "@/components/trust/trust-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { IecWithAlertCount, UserOrganizationSummary } from "@/lib/auth/repository";
import { cn } from "@/lib/utils";

export interface WorkspaceShellProps {
  userEmail: string | null;
  organizations: readonly UserOrganizationSummary[];
  activeOrg: UserOrganizationSummary;
  iecs: readonly IecWithAlertCount[];
  activeIecId: string | null;
  children: React.ReactNode;
}

export function WorkspaceShell({
  userEmail,
  organizations,
  activeOrg,
  iecs,
  activeIecId,
  children,
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [iecSearch, setIecSearch] = React.useState("");
  const [iecSheetOpen, setIecSheetOpen] = React.useState(false);
  const [helpSheetOpen, setHelpSheetOpen] = React.useState(false);

  const activeIec = iecs.find((i) => i.id === activeIecId) ?? iecs[0] ?? null;
  const totalOpenAlerts = iecs.reduce((sum, item) => sum + item.openAlertsCount, 0);

  const filteredIecs = React.useMemo(() => {
    const q = iecSearch.trim().toLowerCase();
    if (!q) return iecs;
    return iecs.filter(
      (item) => item.legalName.toLowerCase().includes(q) || item.iecCode.toLowerCase().includes(q)
    );
  }, [iecs, iecSearch]);

  const navItems: readonly AppNavItem[] = React.useMemo(
    () => [
      {
        id: "overview",
        label: "Overview",
        href: "/app",
        icon: <LayoutDashboard className="h-5 w-5" />,
      },
      {
        id: "documents",
        label: "Documents",
        href: "/app/documents",
        icon: <FileText className="h-5 w-5" />,
      },
      {
        id: "shipping-bills",
        label: "Shipping Bills",
        href: "/app/shipping-bills",
        icon: <FileCheck2 className="h-5 w-5" />,
      },
      {
        id: "matches",
        label: "IRM & Matching",
        href: "/app/matches",
        icon: <ArrowLeftRight className="h-5 w-5" />,
      },
      {
        id: "incentives",
        label: "Incentives",
        href: "/app/incentives",
        icon: <BadgeIndianRupee className="h-5 w-5" />,
      },
      {
        id: "iecs",
        label: activeOrg.type === "consultant" ? "Client IECs" : "IEC Profile",
        href: "/app/iecs",
        icon: <Building2 className="h-5 w-5" />,
        badgeCount: totalOpenAlerts > 0 ? totalOpenAlerts : undefined,
      },
      {
        id: "team",
        label: "Team",
        href: "/app/team",
        icon: <Users className="h-5 w-5" />,
      },
      {
        id: "onboarding",
        label: "Onboarding",
        href: "/onboarding",
        icon: <Sparkles className="h-5 w-5" />,
      },
    ],
    [activeOrg.type, totalOpenAlerts]
  );

  const activeNavId = pathname.startsWith("/app/documents")
    ? "documents"
    : pathname.startsWith("/app/shipping-bills")
      ? "shipping-bills"
      : pathname.startsWith("/app/matches")
        ? "matches"
        : pathname.startsWith("/app/incentives")
          ? "incentives"
          : pathname.startsWith("/app/iecs")
            ? "iecs"
            : pathname.startsWith("/app/team")
              ? "team"
              : "overview";

  const orgOptions: readonly OrgSwitcherOption[] = organizations.map((org) => ({
    id: org.orgId,
    name: org.name,
    iecCode: org.type === "consultant" ? "Consultant" : "Exporter",
  }));

  async function switchOrg(orgId: string) {
    await fetch("/api/orgs/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId }),
    });
    router.refresh();
  }

  async function switchIec(iecId: string) {
    await fetch("/api/orgs/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: activeOrg.orgId, iecId }),
    });
    setIecSheetOpen(false);
    router.refresh();
  }

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
  }

  function handleReplayTour() {
    setHelpSheetOpen(false);
    if (pathname === "/app") {
      window.dispatchEvent(new CustomEvent("exportleak:replay-tour"));
    } else {
      router.push("/app?tour=1");
    }
  }

  const helpMenuControl = (
    <Sheet open={helpSheetOpen} onOpenChange={setHelpSheetOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          data-testid="help-menu-trigger"
          data-tour-id="tour-help"
          aria-label="Help menu"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        >
          <HelpCircle className="h-5 w-5" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent side="responsive">
        <SheetHeader>
          <SheetTitle>Help &amp; Trust</SheetTitle>
          <SheetDescription>
            Guided walkthroughs, setup checklist, and how ExportLeak keeps your files safe.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={handleReplayTour}
            data-testid="help-replay-tour-btn"
          >
            <Compass className="h-4 w-4" aria-hidden="true" />
            <span>Replay product tour</span>
          </Button>
          <Button asChild variant="secondary" onClick={() => setHelpSheetOpen(false)}>
            <Link href="/onboarding">Open onboarding wizard</Link>
          </Button>
        </div>
        <div className="border-t border-border-subtle pt-4">
          <TrustGuaranteesList />
        </div>
        <div className="border-t border-border-subtle pt-3 text-xs">
          <Link
            href="/privacy"
            onClick={() => setHelpSheetOpen(false)}
            className="font-medium text-accent underline underline-offset-4"
          >
            Read full Privacy Policy
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );

  const iecSwitcherControl =
    activeOrg.type === "consultant" || iecs.length > 1 ? (
      <Sheet open={iecSheetOpen} onOpenChange={setIecSheetOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            data-testid="consultant-iec-switcher"
            aria-label="Switch client IEC"
            className="inline-flex min-h-11 max-w-[140px] items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-2.5 text-xs font-medium text-text hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[220px] sm:text-sm cursor-pointer"
          >
            <span className="truncate">{activeIec ? activeIec.iecCode : "Select IEC"}</span>
            {activeIec && activeIec.openAlertsCount > 0 ? (
              <Badge variant="warning">{activeIec.openAlertsCount}</Badge>
            ) : null}
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          </button>
        </SheetTrigger>
        <SheetContent side="responsive">
          <SheetHeader>
            <SheetTitle>Switch client IEC</SheetTitle>
            <SheetDescription>
              Search by legal name or 10-character IEC code. Shows open alerts per client.
            </SheetDescription>
          </SheetHeader>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-text-muted"
              aria-hidden="true"
            />
            <Input
              aria-label="Search client IECs"
              placeholder="Search IEC code or company name..."
              value={iecSearch}
              onChange={(e) => setIecSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-col gap-2">
            {filteredIecs.length > 0 ? (
              filteredIecs.map((iec) => {
                const selected = iec.id === activeIec?.id;
                return (
                  <button
                    key={iec.id}
                    type="button"
                    onClick={() => switchIec(iec.id)}
                    className={cn(
                      "flex min-h-11 items-center justify-between gap-2 rounded-[var(--radius-sm)] border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                      selected
                        ? "border-accent bg-accent-soft/40"
                        : "border-border-subtle bg-surface hover:bg-surface-muted"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">{iec.legalName}</p>
                      <p className="truncate text-xs text-text-muted">IEC: {iec.iecCode}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={iec.openAlertsCount > 0 ? "warning" : "neutral"}>
                        {iec.openAlertsCount} alerts
                      </Badge>
                      {selected ? (
                        <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                      ) : null}
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="py-4 text-center text-sm text-text-muted">
                No matching IEC profiles found.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    ) : null;

  return (
    <AppShell
      navItems={navItems}
      activeNavId={activeNavId}
      orgs={orgOptions}
      selectedOrgId={activeOrg.orgId}
      onSelectOrg={switchOrg}
      unreadNotifications={totalOpenAlerts}
      user={{
        name: userEmail ?? "Member",
        email: userEmail ?? undefined,
        roleLabel: `Role: ${activeOrg.role}`,
      }}
      onSignOut={handleSignOut}
      headerExtra={
        <>
          {iecSwitcherControl}
          {helpMenuControl}
          <ThemeToggle />
        </>
      }
    >
      {children}
    </AppShell>
  );
}

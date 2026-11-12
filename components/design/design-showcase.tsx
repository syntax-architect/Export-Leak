"use client";

import * as React from "react";
import {
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  LayoutDashboard,
  ReceiptIndianRupee,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { AppShell, type AppNavItem, type OrgSwitcherOption } from "@/components/shell/app-shell";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DateText } from "@/components/ui/date-text";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { ProgressRing } from "@/components/ui/progress-ring";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/ui/stat";
import { Stepper } from "@/components/ui/stepper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

interface DesignShipmentRow {
  id: string;
  sbNumber: string;
  sbDate: string;
  buyer: string;
  fobPaise: number;
  expectedPaise: number;
  status: "matched" | "review" | "missing";
}

const DESIGN_SHIPMENTS: readonly DesignShipmentRow[] = [
  {
    id: "sb-1",
    sbNumber: "8492014",
    sbDate: "2026-10-12T06:00:00Z",
    buyer: "Nordic Knitwear AB",
    fobPaise: 124500000,
    expectedPaise: 4357500,
    status: "matched",
  },
  {
    id: "sb-2",
    sbNumber: "8492199",
    sbDate: "2026-10-28T06:00:00Z",
    buyer: "Thames Apparel Ltd",
    fobPaise: 87250050,
    expectedPaise: 3053752,
    status: "review",
  },
  {
    id: "sb-3",
    sbNumber: "8493041",
    sbDate: "2026-11-05T06:00:00Z",
    buyer: "Pacific Cotton Co",
    fobPaise: 41000000,
    expectedPaise: 1435000,
    status: "missing",
  },
];

const NAV_ITEMS: readonly AppNavItem[] = [
  {
    id: "overview",
    label: "Overview",
    href: "#tokens",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    id: "shipments",
    label: "Shipments",
    href: "#table",
    icon: <FileText className="h-5 w-5" />,
    badgeCount: 2,
  },
  {
    id: "incentives",
    label: "Incentives",
    href: "#stats",
    icon: <ReceiptIndianRupee className="h-5 w-5" />,
  },
  {
    id: "ebrc",
    label: "eBRC",
    href: "#overlays",
    icon: <FileSpreadsheet className="h-5 w-5" />,
  },
  {
    id: "alerts",
    label: "Alerts",
    href: "#badges",
    icon: <AlertTriangle className="h-5 w-5" />,
    badgeCount: 3,
  },
  {
    id: "settings",
    label: "Settings",
    href: "#forms",
    icon: <Settings className="h-5 w-5" />,
  },
];

const DEMO_ORGS: readonly OrgSwitcherOption[] = [
  { id: "org-1", name: "Kaveri Textiles Pvt Ltd", iecCode: "DEMO000123", alertCount: 2 },
  { id: "org-2", name: "Deccan Spices LLP", iecCode: "DEMO000456", alertCount: 1 },
];

const STEPPER_STEPS = [
  { id: "role", label: "Organization", description: "Exporter or consultant" },
  { id: "upload", label: "Upload files", description: "SB PDF, IRM, Scroll" },
  { id: "review", label: "Verify fields", description: "Confirm low confidence" },
  { id: "export", label: "Bulk eBRC", description: "Download DGFT Excel" },
] as const;

const TOKEN_SWATCHES = [
  { name: "Primary Navy", bgClass: "bg-primary text-primary-fg", hexNote: "--primary" },
  { name: "Accent Teal", bgClass: "bg-accent text-accent-fg", hexNote: "--accent" },
  { name: "Success Green", bgClass: "bg-success text-success-fg", hexNote: "--success" },
  { name: "Warning Amber", bgClass: "bg-warning text-warning-fg", hexNote: "--warning" },
  { name: "Danger Red", bgClass: "bg-danger text-danger-fg", hexNote: "--danger" },
  { name: "Surface Muted", bgClass: "bg-surface-muted text-text", hexNote: "--surface-muted" },
] as const;

export function DesignShowcase() {
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [selectedOrgId, setSelectedOrgId] = React.useState(DEMO_ORGS[0]?.id ?? "org-1");
  const [selectedScheme, setSelectedScheme] = React.useState("rodtep");
  const [currentStep, setCurrentStep] = React.useState(1);
  const [inputValue, setInputValue] = React.useState("0512345678");
  const [loadingDemo, setLoadingDemo] = React.useState(false);

  const columns = React.useMemo<readonly DataTableColumn<DesignShipmentRow>[]>(
    () => [
      {
        id: "sbNumber",
        header: "Shipping Bill",
        cell: (row) => <span className="font-semibold tabular-nums-money">#{row.sbNumber}</span>,
      },
      {
        id: "sbDate",
        header: "SB Date",
        cell: (row) => <DateText date={row.sbDate} />,
      },
      {
        id: "buyer",
        header: "Buyer",
        cell: (row) => <span className="truncate">{row.buyer}</span>,
      },
      {
        id: "fob",
        header: "FOB Value",
        align: "right",
        cell: (row) => <MoneyText minorUnits={row.fobPaise} currency="INR" />,
      },
      {
        id: "expected",
        header: "Expected",
        align: "right",
        cell: (row) => <MoneyText minorUnits={row.expectedPaise} currency="INR" />,
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => {
          if (row.status === "matched") return <Badge variant="success">Matched</Badge>;
          if (row.status === "review") return <Badge variant="warning">Needs Review</Badge>;
          return <Badge variant="danger">Unclaimed</Badge>;
        },
      },
    ],
    []
  );

  return (
    <AppShell
      navItems={NAV_ITEMS}
      activeNavId="overview"
      orgs={DEMO_ORGS}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
      unreadNotifications={3}
      onNotificationClick={() =>
        toast({
          title: "3 open alerts",
          description: "2 shipping bills approaching realisation deadline.",
          variant: "warning",
        })
      }
      user={{ name: "Dev Preview", email: "preview@exportleak.example", roleLabel: "Design Mode" }}
      headerExtra={<ThemeToggle />}
    >
      <div className="flex flex-col gap-8">
        {/* Header Banner */}
        <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent">Dev Only</Badge>
              <Badge variant="neutral">Mode: {theme}</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-text">
              Design System Showcase
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Verified at 360px and 1280px across light and dark modes with WCAG AA contrast.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={toggleTheme} data-testid="design-theme-switch">
              Toggle {theme === "dark" ? "Light" : "Dark"} Mode
            </Button>
          </div>
        </section>

        {/* Tokens */}
        <section id="tokens" className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-text">Color &amp; Typography Tokens</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {TOKEN_SWATCHES.map((swatch) => (
              <div
                key={swatch.name}
                className="overflow-hidden rounded-[var(--radius-card)] border border-border-subtle bg-surface shadow-[var(--shadow-sm)]"
              >
                <div
                  className={`flex h-16 items-end p-2.5 text-xs font-semibold ${swatch.bgClass}`}
                >
                  Aa 4.5:1+
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-semibold text-text">{swatch.name}</p>
                  <p className="text-[11px] text-text-muted">{swatch.hexNote}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Stats & Money/Date */}
        <section id="stats" className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-text">Stats, MoneyText &amp; DateText</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Unclaimed Incentive"
              minorUnits={100000000}
              currency="INR"
              trend={{ label: "12 bills", direction: "up", tone: "warning" }}
            />
            <Stat
              label="Matched & Closed"
              minorUnits={245689050}
              currency="INR"
              trend={{ label: "+18% MoM", direction: "up", tone: "success" }}
            />
            <Stat
              label="Foreign Realisation"
              minorUnits={4825000}
              currency="USD"
              trend={{ label: "On track", direction: "neutral", tone: "neutral" }}
            />
            <Stat
              label="Open Deadlines"
              count={14}
              trend={{ label: "3 due < 30d", direction: "down", tone: "danger" }}
            />
          </div>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4 text-sm sm:pt-6">
              <div>
                <span className="text-text-muted">INR Grouping: </span>
                <MoneyText minorUnits={100000000} currency="INR" className="font-semibold" />
              </div>
              <div>
                <span className="text-text-muted">With Paise: </span>
                <MoneyText minorUnits={123456789} currency="INR" className="font-semibold" />
              </div>
              <div>
                <span className="text-text-muted">IST Date: </span>
                <DateText date="2026-11-12T18:30:00Z" className="font-semibold" />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ProgressRing & Stepper */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>ProgressRing</CardTitle>
              <CardDescription>Realisation deadline &amp; allowance rings</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-5">
              <ProgressRing value={85} tone="success" label="> 90 days" centerText="142d" />
              <ProgressRing value={55} tone="warning" label="30-90 days" centerText="48d" />
              <ProgressRing value={20} tone="danger" label="< 30 days" centerText="12d" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stepper</CardTitle>
              <CardDescription>Responsive multi-step onboarding progress</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Stepper steps={STEPPER_STEPS} currentStep={currentStep} />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setCurrentStep((s) => Math.min(STEPPER_STEPS.length, s + 1))}
                >
                  Next Step
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Buttons & Badges */}
        <section id="badges" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Buttons</CardTitle>
              <CardDescription>Minimum 44px tap targets &amp; 0.98 press scale</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2.5">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button
                variant="primary"
                loading={loadingDemo}
                loadingText="Parsing..."
                onClick={() => setLoadingDemo((v) => !v)}
              >
                {loadingDemo ? "Parsing" : "Toggle Loading"}
              </Button>
              <Button variant="secondary" loading loadingText="Syncing...">
                Syncing
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Badges &amp; Skeletons</CardTitle>
              <CardDescription>Status badges and skeleton loading states</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="neutral">Neutral</Badge>
                <Badge variant="primary">Primary</Badge>
                <Badge variant="accent">RoDTEP</Badge>
                <Badge variant="success">Matched</Badge>
                <Badge variant="warning">Due Soon</Badge>
                <Badge variant="danger">Overdue</Badge>
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Forms & Tabs */}
        <section id="forms" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Inputs &amp; Select</CardTitle>
              <CardDescription>Accessible labels, hints, and error states</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Input
                label="IEC Code"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                hint="10-character alphanumeric code"
              />
              <Input label="HS Code" defaultValue="6109" error="HS code must be exactly 8 digits" />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text">Incentive Scheme</span>
                <Select value={selectedScheme} onValueChange={setSelectedScheme}>
                  <SelectTrigger aria-label="Incentive Scheme">
                    <SelectValue placeholder="Choose scheme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rodtep">RoDTEP</SelectItem>
                    <SelectItem value="drawback">Duty Drawback</SelectItem>
                    <SelectItem value="rosctl">RoSCTL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card id="overlays">
            <CardHeader>
              <CardTitle>Tabs, Dialog, Sheet &amp; Toasts</CardTitle>
              <CardDescription>
                Dialog on all viewports; Sheet acts as a bottom sheet under 768px
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Tabs defaultValue="summary">
                <TabsList>
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="audit">Audit Trail</TabsTrigger>
                  <TabsTrigger value="rules">Rules</TabsTrigger>
                </TabsList>
                <TabsContent value="summary" className="text-sm text-text-muted">
                  Summary metrics and confirmation checkpoints appear here.
                </TabsContent>
                <TabsContent value="audit" className="text-sm text-text-muted">
                  Every edit and billing event writes an immutable audit log entry.
                </TabsContent>
                <TabsContent value="rules" className="text-sm text-text-muted">
                  Effective-dated compliance rules control deadlines without code edits.
                </TabsContent>
              </Tabs>

              <div className="flex flex-wrap gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="primary">Open Dialog</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Confirm low-confidence HS Code</DialogTitle>
                      <DialogDescription>
                        Field confidence is 74% on page 2. Confirm before computing RoDTEP.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="secondary">Cancel</Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button variant="primary">Confirm Value</Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="secondary">Open Sheet</Button>
                  </SheetTrigger>
                  <SheetContent side="responsive">
                    <SheetHeader>
                      <SheetTitle>Source Preview</SheetTitle>
                      <SheetDescription>
                        Renders as a bottom sheet on mobile and side panel on desktop.
                      </SheetDescription>
                    </SheetHeader>
                    <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted p-3 text-sm text-text">
                      <div className="flex items-center gap-2 font-medium">
                        <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
                        <span>Page 1 · Extracted Span</span>
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        FOB Value: INR 12,45,000.00 · Port Code: INTUT6
                      </p>
                    </div>
                    <SheetClose asChild>
                      <Button variant="primary">Done</Button>
                    </SheetClose>
                  </SheetContent>
                </Sheet>

                <Button
                  variant="ghost"
                  onClick={() =>
                    toast({
                      title: "Saved confirmation",
                      description: "Audit log entry recorded in Asia/Kolkata time.",
                      variant: "success",
                    })
                  }
                >
                  Trigger Toast
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* DataTable / CardList */}
        <section id="table" className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text">Responsive DataTable</h2>
            <p className="text-sm text-text-muted">
              Renders as a table at &gt;= 768px and automatically switches to a CardList below
              768px.
            </p>
          </div>
          <DataTable
            data={DESIGN_SHIPMENTS}
            columns={columns}
            keyExtractor={(row) => row.id}
            caption="Sample shipments reconciliation list"
            mobileTitle={(row) => `SB #${row.sbNumber}`}
            mobileSubtitle={(row) => row.buyer}
            onRowClick={(row) =>
              toast({
                title: `Selected SB #${row.sbNumber}`,
                description: row.buyer,
              })
            }
          />
        </section>

        {/* Empty State */}
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-text">EmptyState</h2>
          <EmptyState
            icon={<FolderOpen className="h-6 w-6" aria-hidden="true" />}
            title="No documents uploaded yet"
            description="Upload your Shipping Bill PDFs, bank IRM sheet, and customs scroll to start matching."
            action={<Button variant="primary">Upload Documents</Button>}
          />
        </section>

        {/* Card Footer example */}
        <Card>
          <CardHeader>
            <CardTitle>Trust &amp; Privacy Guarantee</CardTitle>
            <CardDescription>Consistent card spacing and footer alignment</CardDescription>
          </CardHeader>
          <CardFooter className="justify-between border-t border-border-subtle pt-4">
            <span className="text-xs text-text-muted">Asia/Kolkata · DD MMM YYYY</span>
            <Badge variant="success">Ready</Badge>
          </CardFooter>
        </Card>
      </div>
    </AppShell>
  );
}

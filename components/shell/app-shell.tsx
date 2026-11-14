"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import {
  Bell,
  Building2,
  Check,
  ChevronsUpDown,
  Loader2,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
  User,
} from "lucide-react";
import { APP_CONFIG } from "@/config/app";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PageTransition } from "@/components/shell/page-transition";
import { NavigationProgressBar } from "@/components/shell/nav-progress-bar";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { cn } from "@/lib/utils";

export interface AppNavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  badgeCount?: number;
}

export interface OrgSwitcherOption {
  id: string;
  name: string;
  iecCode?: string;
  alertCount?: number;
}

export interface AppShellUser {
  name: string;
  email?: string;
  roleLabel?: string;
}

export interface AppShellProps {
  appName?: string;
  navItems: readonly AppNavItem[];
  activeNavId?: string;
  orgs?: readonly OrgSwitcherOption[];
  selectedOrgId?: string;
  onSelectOrg?: (orgId: string) => void;
  unreadNotifications?: number;
  onNotificationClick?: () => void;
  user?: AppShellUser;
  onSignOut?: () => void;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  appName = APP_CONFIG.name,
  navItems,
  activeNavId,
  orgs = [],
  selectedOrgId,
  onSelectOrg,
  unreadNotifications = 0,
  onNotificationClick,
  user,
  onSignOut,
  headerExtra,
  children,
}: AppShellProps) {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [navigatingId, setNavigatingId] = React.useState<string | null>(null);
  const [prevActiveNavId, setPrevActiveNavId] = React.useState(activeNavId);
  if (prevActiveNavId !== activeNavId) {
    setPrevActiveNavId(activeNavId);
    setNavigatingId(null);
  }
  const lastNavTapRef = React.useRef<{ id: string; time: number }>({ id: "", time: 0 });

  const handleNavClick = React.useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, item: AppNavItem) => {
      const now = Date.now();
      // Rapid-tap & duplicate destination protection
      if (
        (lastNavTapRef.current.id === item.id && now - lastNavTapRef.current.time < 350) ||
        item.id === activeNavId
      ) {
        if (item.id === activeNavId) {
          e.preventDefault();
        }
        return;
      }

      lastNavTapRef.current = { id: item.id, time: now };
      setNavigatingId(item.id);
      window.dispatchEvent(new CustomEvent("exportleak:navigation-start", { detail: item.href }));
    },
    [activeNavId]
  );

  const warmRoute = React.useCallback(
    (href: string) => {
      try {
        router.prefetch(href);
      } catch {
        // Safe noop
      }
    },
    [router]
  );

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId) ?? orgs[0];
  const primaryMobileItems = navItems.slice(0, 4);
  const overflowMobileItems = navItems.slice(4);
  const isOverflowActive = overflowMobileItems.some((item) => item.id === activeNavId);

  return (
    <div className="flex min-h-dvh w-full bg-bg text-text">
      <NavigationProgressBar />
      {/* Desktop Sidebar */}
      <aside
        aria-label="Primary sidebar navigation"
        className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-border-subtle md:bg-surface"
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-border-subtle px-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-primary-fg">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold tracking-tight text-text">{appName}</p>
            <p className="truncate text-xs text-text-muted">Incentive &amp; eBRC Tracker</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Workspace sections">
          {navItems.map((item) => {
            const isActive = item.id === activeNavId;
            const isNavigating = navigatingId === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                prefetch={true}
                onClick={(e) => handleNavClick(e, item)}
                onPointerDown={() => warmRoute(item.href)}
                onTouchStart={() => warmRoute(item.href)}
                onMouseEnter={() => warmRoute(item.href)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-primary text-primary-fg shadow-[var(--shadow-sm)]"
                    : isNavigating
                      ? "bg-surface-muted text-accent font-semibold"
                      : "text-text hover:bg-surface-muted"
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0" aria-hidden="true">
                    {isNavigating ? (
                      <Loader2 className="h-5 w-5 animate-spin text-accent" />
                    ) : (
                      item.icon
                    )}
                  </span>
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badgeCount === "number" && item.badgeCount > 0 ? (
                  <Badge variant={isActive ? "accent" : "warning"}>{item.badgeCount}</Badge>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border-subtle p-4">
          <p className="text-xs leading-relaxed text-text-muted">
            We never ask for your DSC or portal passwords.
          </p>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-surface/95 px-3 backdrop-blur-sm pt-safe sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-primary-fg md:hidden">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>

            {orgs.length > 0 && selectedOrg ? (
              <DropdownMenuPrimitive.Root>
                <DropdownMenuPrimitive.Trigger asChild>
                  <button
                    type="button"
                    aria-label="Switch organization or IEC"
                    className="inline-flex min-h-11 max-w-[175px] items-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-2.5 py-1.5 text-left text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[280px] sm:px-3 cursor-pointer"
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-text">
                        {selectedOrg.name}
                      </span>
                      {selectedOrg.iecCode ? (
                        <span className="block truncate text-[11px] text-text-muted">
                          IEC: {selectedOrg.iecCode}
                        </span>
                      ) : null}
                    </span>
                    <ChevronsUpDown
                      className="h-4 w-4 shrink-0 text-text-muted"
                      aria-hidden="true"
                    />
                  </button>
                </DropdownMenuPrimitive.Trigger>
                <DropdownMenuPrimitive.Portal>
                  <DropdownMenuPrimitive.Content
                    align="start"
                    sideOffset={6}
                    className="z-50 min-w-[240px] max-w-[90vw] rounded-[var(--radius-card)] border border-border-subtle bg-surface p-1.5 text-text shadow-[var(--shadow-lg)]"
                  >
                    <DropdownMenuPrimitive.Label className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Organizations / IECs
                    </DropdownMenuPrimitive.Label>
                    {orgs.map((org) => {
                      const isSelected = org.id === selectedOrg.id;
                      return (
                        <DropdownMenuPrimitive.Item
                          key={org.id}
                          onSelect={() => onSelectOrg?.(org.id)}
                          className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm outline-none focus:bg-surface-muted"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-text">{org.name}</p>
                            {org.iecCode ? (
                              <p className="truncate text-xs text-text-muted">{org.iecCode}</p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            {typeof org.alertCount === "number" && org.alertCount > 0 ? (
                              <Badge variant="warning">{org.alertCount}</Badge>
                            ) : null}
                            {isSelected ? (
                              <Check className="h-4 w-4 text-accent" aria-hidden="true" />
                            ) : null}
                          </div>
                        </DropdownMenuPrimitive.Item>
                      );
                    })}
                  </DropdownMenuPrimitive.Content>
                </DropdownMenuPrimitive.Portal>
              </DropdownMenuPrimitive.Root>
            ) : (
              <span className="truncate text-sm font-semibold text-text md:hidden">{appName}</span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {headerExtra}

            <button
              type="button"
              onClick={onNotificationClick}
              aria-label={
                unreadNotifications > 0
                  ? `Notifications (${unreadNotifications} unread)`
                  : "Notifications"
              }
              className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border border-border-subtle bg-surface text-text hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unreadNotifications > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-danger-fg"
                >
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              ) : null}
            </button>

            <DropdownMenuPrimitive.Root>
              <DropdownMenuPrimitive.Trigger asChild>
                <button
                  type="button"
                  aria-label="Open user menu"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-2.5 text-sm font-medium text-text hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                >
                  <User className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {user?.name ? (
                    <span className="hidden max-w-[120px] truncate sm:inline">{user.name}</span>
                  ) : null}
                </button>
              </DropdownMenuPrimitive.Trigger>
              <DropdownMenuPrimitive.Portal>
                <DropdownMenuPrimitive.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 min-w-[220px] max-w-[90vw] rounded-[var(--radius-card)] border border-border-subtle bg-surface p-1.5 text-text shadow-[var(--shadow-lg)]"
                >
                  {user ? (
                    <div className="border-b border-border-subtle px-2.5 py-2">
                      <p className="truncate text-sm font-semibold text-text">{user.name}</p>
                      {user.email ? (
                        <p className="truncate text-xs text-text-muted">{user.email}</p>
                      ) : null}
                      {user.roleLabel ? (
                        <Badge variant="neutral" className="mt-1.5">
                          {user.roleLabel}
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                  {onSignOut ? (
                    <DropdownMenuPrimitive.Item
                      onSelect={onSignOut}
                      className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm text-danger-soft-fg outline-none focus:bg-danger-soft"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                      <span>Sign out</span>
                    </DropdownMenuPrimitive.Item>
                  ) : (
                    <DropdownMenuPrimitive.Item
                      disabled
                      className="mt-1 flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm text-text-muted"
                    >
                      <User className="h-4 w-4" aria-hidden="true" />
                      <span>Workspace member</span>
                    </DropdownMenuPrimitive.Item>
                  )}
                </DropdownMenuPrimitive.Content>
              </DropdownMenuPrimitive.Portal>
            </DropdownMenuPrimitive.Root>
          </div>
        </header>

        {/* Page Content */}
        <main
          id="main-content"
          className="mx-auto w-full max-w-6xl flex-1 px-3 py-5 pb-24 sm:px-6 md:py-8 md:pb-8"
        >
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (4 items + More) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface/95 backdrop-blur-sm pb-safe md:hidden"
      >
        <div className="grid grid-cols-5">
          {primaryMobileItems.map((item) => {
            const isActive = item.id === activeNavId;
            const isNavigating = navigatingId === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                prefetch={true}
                onClick={(e) => handleNavClick(e, item)}
                onPointerDown={() => warmRoute(item.href)}
                onTouchStart={() => warmRoute(item.href)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:scale-95",
                  isActive
                    ? "text-primary font-semibold"
                    : isNavigating
                      ? "text-accent font-semibold"
                      : "text-text-muted hover:text-text"
                )}
              >
                <span className="relative" aria-hidden="true">
                  {isNavigating ? (
                    <Loader2 className="h-5 w-5 animate-spin text-accent" />
                  ) : (
                    item.icon
                  )}
                  {typeof item.badgeCount === "number" && item.badgeCount > 0 ? (
                    <span className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-warning" />
                  ) : null}
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="More navigation items"
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring cursor-pointer",
                  isOverflowActive
                    ? "text-primary font-semibold"
                    : "text-text-muted hover:text-text"
                )}
              >
                <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                <span>More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle>More sections</SheetTitle>
                <SheetDescription>Additional workspace tools and settings</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-1.5">
                {overflowMobileItems.length > 0 ? (
                  overflowMobileItems.map((item) => {
                    const isActive = item.id === activeNavId;
                    const isNavigating = navigatingId === item.id;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        prefetch={true}
                        onClick={(e) => {
                          setMoreOpen(false);
                          handleNavClick(e, item);
                        }}
                        onPointerDown={() => warmRoute(item.href)}
                        onTouchStart={() => warmRoute(item.href)}
                        className={cn(
                          "flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium",
                          isActive
                            ? "bg-primary text-primary-fg"
                            : isNavigating
                              ? "bg-surface-muted text-accent font-semibold"
                              : "bg-surface-muted/50 text-text hover:bg-surface-muted"
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <span aria-hidden="true">
                            {isNavigating ? (
                              <Loader2 className="h-5 w-5 animate-spin text-accent" />
                            ) : (
                              item.icon
                            )}
                          </span>
                          <span>{item.label}</span>
                        </span>
                        {typeof item.badgeCount === "number" && item.badgeCount > 0 ? (
                          <Badge variant="warning">{item.badgeCount}</Badge>
                        ) : null}
                      </Link>
                    );
                  })
                ) : (
                  <p className="py-2 text-sm text-text-muted">No extra sections configured yet.</p>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  );
}

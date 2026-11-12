"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateText } from "@/components/ui/date-text";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { OrgInviteItem, OrgMemberItem } from "@/lib/auth/repository";
import type { InviteRole, MembershipRole } from "@/lib/database.types";

export interface TeamManagerProps {
  orgId: string;
  currentUserId: string;
  currentRole: MembershipRole;
  members: readonly OrgMemberItem[];
  invites: readonly OrgInviteItem[];
}

export function TeamManager({
  orgId,
  currentUserId,
  currentRole,
  members,
  invites,
}: TeamManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<InviteRole>("viewer");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [latestInviteUrl, setLatestInviteUrl] = React.useState<string | null>(null);

  const canInvite = currentRole === "owner" || currentRole === "admin";
  const isOwner = currentRole === "owner";

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLatestInviteUrl(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/orgs/${orgId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const body = (await res.json()) as {
        inviteUrl?: string;
        error?: { message?: string };
      };

      if (!res.ok) {
        setError(body.error?.message ?? "Could not send invite.");
        setLoading(false);
        return;
      }

      setEmail("");
      setLatestInviteUrl(body.inviteUrl ?? null);
      toast({ title: "Team invitation created", variant: "success" });
      router.refresh();
    } catch {
      setError("Network error while creating invite.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/members/${memberId}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? "Could not remove member.");
        return;
      }
      toast({ title: "Membership updated", variant: "success" });
      router.refresh();
    } catch {
      setError("Network error while updating membership.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">Team &amp; Permissions</h1>
        <p className="mt-1 text-sm text-text-muted">
          Invite admins, members, or read-only viewers. Viewers cannot upload or delete data.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-[var(--radius-sm)] border border-danger/30 bg-danger-soft p-3 text-sm text-danger-soft-fg"
        >
          {error}
        </div>
      ) : null}

      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite team member</CardTitle>
            <CardDescription>
              Works for both new accounts and people who already belong to another organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form onSubmit={handleInvite} className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input
                label="Email address"
                type="email"
                placeholder="colleague@company.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text">Role</span>
                <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
                  <SelectTrigger aria-label="Invite role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={loading}
                  loadingText="Inviting..."
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  <span>Send invite</span>
                </Button>
              </div>
            </form>

            {latestInviteUrl ? (
              <div
                data-testid="latest-invite-link"
                className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-accent/40 bg-accent-soft/40 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-accent-soft-fg">Invitation link</p>
                  <p className="truncate text-xs text-text">{latestInviteUrl}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(latestInviteUrl);
                    toast({ title: "Invite link copied", variant: "success" });
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  <span>Copy link</span>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border-subtle">
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            const canRemove = isSelf || isOwner;
            return (
              <div
                key={m.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {m.email ?? m.userId} {isSelf ? "(you)" : ""}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant={m.role === "viewer" ? "neutral" : "accent"}>{m.role}</Badge>
                    <span className="text-xs text-text-muted">
                      Joined <DateText date={m.createdAt} />
                    </span>
                  </div>
                </div>
                {canRemove ? (
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(m.id)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span>{isSelf ? "Leave" : "Remove"}</span>
                  </Button>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {invites.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invites ({invites.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border-subtle">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="truncate text-sm font-medium text-text">{inv.email}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="warning">{inv.role}</Badge>
                  <span className="text-xs text-text-muted">
                    Expires <DateText date={inv.expiresAt} />
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

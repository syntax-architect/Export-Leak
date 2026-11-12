"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface AcceptInviteCardProps {
  token: string;
  orgName: string;
  invitedEmail: string;
  role: string;
  status: "valid" | "expired" | "accepted" | "revoked" | "not_found";
  signedInEmail: string | null;
}

export function AcceptInviteCard({
  token,
  orgName,
  invitedEmail,
  role,
  status,
  signedInEmail,
}: AcceptInviteCardProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleAccept() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? "Could not accept invitation.");
        setLoading(false);
        return;
      }
      router.push("/app");
    } catch {
      setError("Network error while accepting invitation.");
      setLoading(false);
    }
  }

  if (status !== "valid") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <AlertCircle className="h-5 w-5 text-warning" aria-hidden="true" />
            <span>Invitation unavailable</span>
          </CardTitle>
          <CardDescription>
            {status === "expired"
              ? "This invitation has expired. Ask your organization admin to send a fresh invite."
              : status === "accepted"
                ? "This invitation has already been accepted."
                : status === "revoked"
                  ? "This invitation was revoked by an administrator."
                  : "We could not find this invitation."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="primary" className="w-full">
            <Link href={signedInEmail ? "/app" : "/login"}>
              {signedInEmail ? "Go to workspace" : "Go to sign in"}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-accent" aria-hidden="true" />
          <Badge variant="accent">Role: {role}</Badge>
        </div>
        <CardTitle className="text-xl font-bold">Join {orgName}</CardTitle>
        <CardDescription>
          Invitation for <strong>{invitedEmail}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <div
            role="alert"
            className="rounded-[var(--radius-sm)] border border-danger/30 bg-danger-soft p-3 text-sm text-danger-soft-fg"
          >
            {error}
          </div>
        ) : null}

        {signedInEmail ? (
          <>
            <p className="text-sm text-text-muted">
              Signed in as <strong>{signedInEmail}</strong>.
            </p>
            <Button
              variant="primary"
              className="w-full"
              loading={loading}
              loadingText="Joining..."
              onClick={handleAccept}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>Accept invitation</span>
            </Button>
          </>
        ) : (
          <Button asChild variant="primary" className="w-full">
            <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
              Sign in with {invitedEmail} to accept
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OfflineRetryButton() {
  const [retrying, setRetrying] = React.useState(false);

  function handleRetry() {
    setRetrying(true);
    window.location.reload();
  }

  return (
    <Button
      type="button"
      variant="primary"
      className="flex-1 min-h-11"
      onClick={handleRetry}
      disabled={retrying}
    >
      <RotateCcw className={`mr-2 h-4 w-4 ${retrying ? "animate-spin" : ""}`} aria-hidden="true" />
      <span>{retrying ? "Reconnecting..." : "Retry Connection"}</span>
    </Button>
  );
}

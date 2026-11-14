"use client";

import * as React from "react";

interface AnnouncerState {
  politeMessage: string;
  assertiveMessage: string;
}

let announceListener: ((msg: string, mode: "polite" | "assertive") => void) | null = null;

export function announce(message: string, mode: "polite" | "assertive" = "polite") {
  if (announceListener) {
    announceListener(message, mode);
  }
}

export function AriaAnnouncer() {
  const [messages, setMessages] = React.useState<AnnouncerState>({
    politeMessage: "",
    assertiveMessage: "",
  });

  React.useEffect(() => {
    announceListener = (msg: string, mode: "polite" | "assertive") => {
      setMessages((prev) =>
        mode === "assertive" ? { ...prev, assertiveMessage: msg } : { ...prev, politeMessage: msg }
      );
    };

    return () => {
      announceListener = null;
    };
  }, []);

  return (
    <div className="sr-only">
      <div role="status" aria-live="polite" aria-atomic="true">
        {messages.politeMessage}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {messages.assertiveMessage}
      </div>
    </div>
  );
}

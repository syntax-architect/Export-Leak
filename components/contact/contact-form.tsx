"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { APP_CONFIG } from "@/config/app";

export function ContactForm() {
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    window.location.href = `mailto:${APP_CONFIG.supportEmail}?subject=ExportLeak Support Inquiry`;
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <label htmlFor="contact-name" className="text-xs font-medium text-text">
          Your Name / Company
        </label>
        <input
          id="contact-name"
          type="text"
          required
          placeholder="e.g. Salem Silks Export"
          className="w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-2 text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none min-h-11"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="contact-email" className="text-xs font-medium text-text">
          Email Address
        </label>
        <input
          id="contact-email"
          type="email"
          required
          placeholder="you@company.com"
          className="w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-2 text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none min-h-11"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="contact-topic" className="text-xs font-medium text-text">
          Inquiry Topic
        </label>
        <select
          id="contact-topic"
          className="w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-2 text-xs text-text focus:border-accent focus:outline-none min-h-11"
        >
          <option>General Product Question</option>
          <option>Bulk eBRC / DGFT Export Question</option>
          <option>Billing / Subscription Question</option>
          <option>Custom Consultant Volume (25+ IECs)</option>
          <option>Security / Privacy Inquiry</option>
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="contact-message" className="text-xs font-medium text-text">
          Message
        </label>
        <textarea
          id="contact-message"
          rows={3}
          placeholder="How can we help your export business?"
          className="w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-2 text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
      </div>

      <Button type="submit" variant="primary" className="w-full min-h-11">
        {submitted ? "Redirecting to email..." : "Send inquiry via email"}
      </Button>
    </form>
  );
}

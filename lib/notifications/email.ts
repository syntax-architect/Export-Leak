import { APP_CONFIG } from "@/config/app";

export interface SendTransactionalEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendTransactionalEmailResult {
  status: "sent" | "queued" | "failed";
  providerMessageId: string | null;
  error: string | null;
}

export type EmailTransportOverride = (
  input: SendTransactionalEmailInput
) => Promise<SendTransactionalEmailResult>;

let transportOverride: EmailTransportOverride | null = null;

export function setEmailTransportForTests(override: EmailTransportOverride | null): void {
  transportOverride = override;
}

export function getAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return "http://localhost:3000";
  return configured.replace(/\/+$/, "");
}

function getConfiguredResendKey(): string | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey || apiKey === "re_placeholder" || apiKey.startsWith("re_your")) {
    return null;
  }
  return apiKey;
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput
): Promise<SendTransactionalEmailResult> {
  if (transportOverride) {
    return transportOverride(input);
  }

  const apiKey = getConfiguredResendKey();
  if (!apiKey || process.env.NODE_ENV === "test") {
    return {
      status: "queued",
      providerMessageId: null,
      error: null,
    };
  }

  const from = process.env.EMAIL_FROM?.trim() || `${APP_CONFIG.name} <notifications@example.com>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Resend request failed.");
      return {
        status: "failed",
        providerMessageId: null,
        error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
      };
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return {
      status: "sent",
      providerMessageId: body.id ?? null,
      error: null,
    };
  } catch (error) {
    return {
      status: "failed",
      providerMessageId: null,
      error: error instanceof Error ? error.message.slice(0, 200) : "Unknown email delivery error",
    };
  }
}

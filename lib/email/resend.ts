import { APP_CONFIG } from "@/config/app";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  unsubscribeUrl?: string;
}

export interface SendEmailResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface TestSentEmail {
  id: string;
  to: string[];
  from: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  sentAt: string;
}

const testSentEmailsLog: TestSentEmail[] = [];

/**
 * In-memory test helper for assertions in Vitest/e2e.
 */
export function getTestSentEmails(): readonly TestSentEmail[] {
  return [...testSentEmailsLog];
}

export function clearTestSentEmails(): void {
  testSentEmailsLog.length = 0;
}

/**
 * Sends an email using Resend API, with automatic List-Unsubscribe headers
 * and a test-mode fallback that records messages in memory.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const from = options.from ?? `${APP_CONFIG.name} Alerts <alerts@exportleak.example>`;
  const apiKey = process.env.RESEND_API_KEY?.trim();

  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };

  if (options.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${options.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const isTestEnvironment =
    process.env.NODE_ENV === "test" ||
    !apiKey ||
    apiKey.startsWith("re_placeholder") ||
    apiKey.startsWith("re_test");

  if (isTestEnvironment) {
    const id = `mock_email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    testSentEmailsLog.push({
      id,
      to: recipients,
      from,
      subject: options.subject,
      text: options.text,
      html: options.html,
      headers,
      sentAt: new Date().toISOString(),
    });

    return {
      id,
      success: true,
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: options.subject,
        text: options.text,
        html: options.html ?? `<pre style="font-family: sans-serif;">${options.text}</pre>`,
        reply_to: options.replyTo ?? APP_CONFIG.supportEmail,
        headers,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        id: "",
        success: false,
        error: `Resend HTTP ${response.status}: ${errorText}`,
      };
    }

    const json = (await response.json()) as { id?: string };
    return {
      id: json.id ?? `sent_${Date.now()}`,
      success: true,
    };
  } catch (err) {
    return {
      id: "",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

import { APP_CONFIG } from "@/config/app";
import { formatMoney } from "@/lib/format";

export interface WhatsAppTemplatePayload {
  templateKey: string;
  parameters: string[];
}

export function formatWhatsAppMessage(bodyTemplate: string, parameters: string[]): string {
  let result = bodyTemplate;
  parameters.forEach((param, index) => {
    const placeholder = new RegExp(`\\{\\{${index + 1}\\}\\}`, "g");
    result = result.replace(placeholder, param);
  });
  return result;
}

export function buildDeadlineEmail(params: {
  name: string;
  sbNumber: string;
  portCode: string;
  fobPaise: number;
  fobCurrency: string;
  dueDate: string;
  daysRemaining: number;
  appUrl: string;
  unsubscribeUrl: string;
}): { subject: string; text: string; html: string } {
  const isOverdue = params.daysRemaining <= 0;
  const timeDesc = isOverdue
    ? `OVERDUE (due on ${params.dueDate})`
    : `due in ${params.daysRemaining} days on ${params.dueDate}`;
  const subject = isOverdue
    ? `URGENT: FEMA Realisation Overdue for Shipping Bill #${params.sbNumber}`
    : `Action Required: FEMA Realisation Deadline in ${params.daysRemaining} Days (SB #${params.sbNumber})`;

  const fobFormatted = formatMoney(params.fobPaise, params.fobCurrency, { showCode: true });

  const text = `Hello ${params.name},

Shipping Bill #${params.sbNumber} (Port: ${params.portCode}, FOB: ${fobFormatted}) is ${timeDesc}.

Under FEMA regulations, export proceeds must be realised within the statutory period.
Action required: Upload your bank Inward Remittance Message (IRM) or reconcile your eBRC in ExportLeak.

Review shipment: ${params.appUrl}

---
${APP_CONFIG.name} Alerts | Export Incentive & Compliance Tracker
You received this automated compliance alert because email notifications are enabled in your ExportLeak workspace.
To unsubscribe from deadline alerts with 1 click: ${params.unsubscribeUrl}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background-color: ${isOverdue ? "#991b1b" : "#0f172a"}; padding: 20px 24px; color: #ffffff;">
      <h1 style="font-size: 18px; margin: 0; font-weight: 600;">${APP_CONFIG.name} Compliance Alert</h1>
    </div>
    <div style="padding: 24px;">
      <p style="font-size: 15px; margin-top: 0;">Hello ${params.name},</p>
      <div style="background-color: ${isOverdue ? "#fee2e2" : "#fef3c7"}; border-left: 4px solid ${isOverdue ? "#dc2626" : "#f59e0b"}; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <p style="margin: 0; font-weight: 600; font-size: 15px; color: ${isOverdue ? "#991b1b" : "#92400e"};">
          ${isOverdue ? "FEMA Realisation Overdue" : `Deadline in ${params.daysRemaining} days`}
        </p>
        <p style="margin: 4px 0 0 0; font-size: 14px; color: #334155;">
          Shipping Bill #${params.sbNumber} &bull; Port: ${params.portCode} &bull; FOB: ${fobFormatted}
        </p>
      </div>
      <p style="font-size: 14px; line-height: 1.5; color: #334155;">
        Statutory realisation due date: <strong>${params.dueDate}</strong>.
      </p>
      <p style="font-size: 14px; line-height: 1.5; color: #334155;">
        Action required: Upload your bank Inward Remittance Message (IRM) or reconcile your payment in ExportLeak to avoid RBI cautionary listing.
      </p>
      <div style="margin: 24px 0;">
        <a href="${params.appUrl}" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-weight: 600; font-size: 14px;">
          Review Shipping Bill &rarr;
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #64748b; line-height: 1.4; margin: 0;">
        We never ask for your DSC or portal passwords. You received this email because deadline alerts are enabled for your organization.<br />
        <a href="${params.unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe from compliance alerts with 1 click</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

export function buildScripEmail(params: {
  name: string;
  scripNumber: string;
  scheme: string;
  faceValuePaise: number;
  expiresOn: string;
  daysRemaining: number;
  appUrl: string;
  unsubscribeUrl: string;
}): { subject: string; text: string; html: string } {
  const isOverdue = params.daysRemaining <= 0;
  const timeDesc = isOverdue
    ? `EXPIRED on ${params.expiresOn}`
    : `expiring in ${params.daysRemaining} days on ${params.expiresOn}`;
  const subject = isOverdue
    ? `URGENT: Export Scrip #${params.scripNumber} Has Expired`
    : `Action Required: Duty Scrip #${params.scripNumber} Expiring in ${params.daysRemaining} Days`;

  const amountFormatted = formatMoney(params.faceValuePaise, "INR", { showCode: false });

  const text = `Hello ${params.name},

Your ${params.scheme} duty scrip #${params.scripNumber} of face value ${amountFormatted} is ${timeDesc}.

Action required: Utilise this scrip against customs duty payments before it lapses.

Review scrip details: ${params.appUrl}

---
${APP_CONFIG.name} Alerts
To unsubscribe from scrip alerts with 1 click: ${params.unsubscribeUrl}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background-color: #0f172a; padding: 20px 24px; color: #ffffff;">
      <h1 style="font-size: 18px; margin: 0; font-weight: 600;">${APP_CONFIG.name} Scrip Expiry Alert</h1>
    </div>
    <div style="padding: 24px;">
      <p style="font-size: 15px; margin-top: 0;">Hello ${params.name},</p>
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <p style="margin: 0; font-weight: 600; font-size: 15px; color: #92400e;">
          ${params.scheme} Scrip #${params.scripNumber}
        </p>
        <p style="margin: 4px 0 0 0; font-size: 14px; color: #334155;">
          Face value: <strong>${amountFormatted}</strong> &bull; Expires: <strong>${params.expiresOn}</strong> (${params.daysRemaining} days left)
        </p>
      </div>
      <p style="font-size: 14px; line-height: 1.5; color: #334155;">
        Action required: Duty credit scrips cannot be re-issued after expiration. Utilise this balance against basic customs duty.
      </p>
      <div style="margin: 24px 0;">
        <a href="${params.appUrl}" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-weight: 600; font-size: 14px;">
          View Scrips &rarr;
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #64748b; line-height: 1.4; margin: 0;">
        <a href="${params.unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe from scrip alerts with 1 click</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

export function buildWeeklyDigestEmail(params: {
  name: string;
  activeAlertsCount: number;
  deadlinesCount: number;
  scripsCount: number;
  unclaimedPaise: number;
  unmatchedCount: number;
  appUrl: string;
  unsubscribeUrl: string;
}): { subject: string; text: string; html: string } {
  const unclaimedFormatted = formatMoney(params.unclaimedPaise, "INR", { showCode: false });
  const subject = `Your ExportLeak Weekly Digest: ${params.activeAlertsCount} open compliance items`;

  const text = `Hello ${params.name},

Here is your weekly export compliance digest from ${APP_CONFIG.name}:

- Realisation deadlines approaching or overdue: ${params.deadlinesCount}
- Duty credit scrips expiring soon: ${params.scripsCount}
- Unclaimed export incentives: ${unclaimedFormatted}
- Unmatched inward remittances (IRMs): ${params.unmatchedCount}

Review all open items in your dashboard: ${params.appUrl}

---
${APP_CONFIG.name}
To adjust digest frequency or unsubscribe with 1 click: ${params.unsubscribeUrl}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background-color: #0f172a; padding: 20px 24px; color: #ffffff;">
      <h1 style="font-size: 18px; margin: 0; font-weight: 600;">${APP_CONFIG.name} Weekly Digest</h1>
    </div>
    <div style="padding: 24px;">
      <p style="font-size: 15px; margin-top: 0;">Hello ${params.name},</p>
      <p style="font-size: 14px; color: #334155;">Here is the compliance status across your export shipments for this week:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #334155;">Approaching Deadlines</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; text-align: right;">${params.deadlinesCount}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #334155;">Expiring Scrips</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; text-align: right;">${params.scripsCount}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #334155;">Unclaimed Incentives</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; text-align: right; color: #0d9488;">${unclaimedFormatted}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #334155;">Unmatched Remittances</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; text-align: right;">${params.unmatchedCount}</td>
        </tr>
      </table>
      <div style="margin: 24px 0;">
        <a href="${params.appUrl}" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-weight: 600; font-size: 14px;">
          Open ExportLeak Dashboard &rarr;
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #64748b; line-height: 1.4; margin: 0;">
        <a href="${params.unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Change frequency or unsubscribe with 1 click</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

export function buildPaymentProblemEmail(params: {
  name: string;
  planName: string;
  billingUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = `Urgent: Subscription Renewal Issue for ${APP_CONFIG.name}`;
  const text = `Hello ${params.name},

A scheduled renewal payment for your ${APP_CONFIG.name} (${params.planName}) subscription could not be completed.

Your account is currently in a 3-day grace period with full features active.
Please update your payment method to ensure uninterrupted access: ${params.billingUrl}

---
${APP_CONFIG.name} Billing Team
Note: This is an essential billing and security notification required for account maintenance.`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background-color: #b91c1c; padding: 20px 24px; color: #ffffff;">
      <h1 style="font-size: 18px; margin: 0; font-weight: 600;">${APP_CONFIG.name} Payment Notice</h1>
    </div>
    <div style="padding: 24px;">
      <p style="font-size: 15px; margin-top: 0;">Hello ${params.name},</p>
      <p style="font-size: 14px; color: #334155; line-height: 1.5;">
        A scheduled renewal payment for your <strong>${params.planName}</strong> plan could not be processed.
      </p>
      <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <p style="margin: 0; font-weight: 600; font-size: 14px; color: #991b1b;">
          3-Day Grace Period Active
        </p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #7f1d1d;">
          Your features remain fully accessible during this period. Please update your payment method to avoid automatic downgrade to the Free plan.
        </p>
      </div>
      <div style="margin: 24px 0;">
        <a href="${params.billingUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-weight: 600; font-size: 14px;">
          Update Payment Method &rarr;
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #64748b; line-height: 1.4; margin: 0;">
        Essential account and billing notifications are sent regardless of marketing preference settings.
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

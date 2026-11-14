import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/org-access";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { PLANS, type PlanKey } from "@/config/plans";
import { formatMoney } from "@/lib/format";
import { APP_CONFIG } from "@/config/app";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { eventId } = await context.params;

    let eventRow: {
      id: string;
      provider_event_id: string;
      event_type: string;
      org_id: string | null;
      payload: Record<string, unknown>;
      created_at: string;
    } | null = null;

    let orgName = "Exporter";

    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();

      const res = await db.query<{
        id: string;
        provider_event_id: string;
        event_type: string;
        org_id: string | null;
        payload: Record<string, unknown>;
        created_at: string;
      }>(`select * from public.payment_events where id = $1 limit 1`, [eventId]);

      eventRow = res.rows[0] ?? null;

      if (eventRow?.org_id) {
        const orgRes = await db.query<{ name: string }>(
          `select name from public.organizations where id = $1 limit 1`,
          [eventRow.org_id]
        );
        orgName = orgRes.rows[0]?.name ?? orgName;
      }
    } else {
      const service = createSupabaseServiceRoleClient();
      const { data } = await service
        .from("payment_events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle();

      if (data) {
        eventRow = {
          id: data.id,
          provider_event_id: data.provider_event_id,
          event_type: data.event_type,
          org_id: data.org_id,
          payload: (data.payload ?? {}) as Record<string, unknown>,
          created_at: data.created_at,
        };
      }

      if (eventRow?.org_id) {
        const { data: orgData } = await service
          .from("organizations")
          .select("name")
          .eq("id", eventRow.org_id)
          .maybeSingle();
        orgName = orgData?.name ?? orgName;
      }
    }

    if (!eventRow) {
      return new NextResponse("Receipt not found", { status: 404 });
    }

    const payload = (eventRow.payload ?? {}) as {
      payload?: {
        payment?: { entity?: { amount?: number; id?: string; method?: string } };
        subscription?: { entity?: { notes?: { plan_key?: string }; id?: string } };
      };
    };

    const targetPlanKey = (payload.payload?.subscription?.entity?.notes?.plan_key ||
      "exporter_monthly") as PlanKey;
    const planConfig = PLANS[targetPlanKey] ?? PLANS.exporter_monthly;
    const amountPaise = Number(payload.payload?.payment?.entity?.amount ?? planConfig.pricePaise);
    const formattedAmount = formatMoney(amountPaise, "INR");
    const paymentId =
      payload.payload?.payment?.entity?.id || eventRow.provider_event_id || "pay_mock";
    const receiptDate = new Date(eventRow.created_at).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const receiptHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Receipt ${eventRow.id.slice(0, 8).toUpperCase()} - ${APP_CONFIG.name}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1a202c;
      background: #f7fafc;
      margin: 0;
      padding: 24px;
    }
    .receipt-card {
      max-width: 640px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #edf2f7;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .brand-title {
      font-size: 20px;
      font-weight: 700;
      color: #0A2540;
      margin: 0;
    }
    .brand-sub {
      font-size: 12px;
      color: #718096;
      margin-top: 4px;
    }
    .receipt-badge {
      background: #e6fffa;
      color: #234e52;
      border: 1px solid #b2f5ea;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
      font-size: 13px;
    }
    .meta-label {
      color: #718096;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .meta-value {
      font-weight: 600;
      color: #2d3748;
      margin-top: 2px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 13px;
    }
    .items-table th {
      text-align: left;
      padding: 8px;
      background: #f7fafc;
      border-bottom: 1px solid #e2e8f0;
      color: #4a5568;
      font-size: 11px;
      text-transform: uppercase;
    }
    .items-table td {
      padding: 12px 8px;
      border-bottom: 1px solid #edf2f7;
    }
    .total-row td {
      border-bottom: none;
      font-size: 16px;
      font-weight: 700;
      color: #0A2540;
      padding-top: 16px;
    }
    .disclaimer {
      border-top: 1px solid #edf2f7;
      padding-top: 16px;
      font-size: 11px;
      color: #718096;
      line-height: 1.5;
    }
    .print-btn {
      display: inline-block;
      margin-top: 20px;
      background: #0A2540;
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      border: none;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .receipt-card { box-shadow: none; border: none; padding: 0; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <div class="receipt-card">
    <div class="header">
      <div>
        <h1 class="brand-title">${APP_CONFIG.name}</h1>
        <div class="brand-sub">Export Incentive &amp; Payment Tracker</div>
        <div class="brand-sub">ExportLeak Solutions Private Limited (in-formation)</div>
      </div>
      <div>
        <span class="receipt-badge">PAID</span>
      </div>
    </div>

    <div class="meta-grid">
      <div>
        <div class="meta-label">Billed To</div>
        <div class="meta-value">${orgName}</div>
        <div style="font-size: 12px; color: #718096;">${user.email}</div>
      </div>
      <div>
        <div class="meta-label">Receipt Number</div>
        <div class="meta-value">REC-${eventRow.id.slice(0, 8).toUpperCase()}</div>
        <div class="meta-label" style="margin-top: 8px;">Date</div>
        <div class="meta-value">${receiptDate}</div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Period</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>${planConfig.displayName}</strong><br />
            <span style="font-size: 11px; color: #718096;">Recurring export incentive tracking &amp; bulk eBRC generator</span>
          </td>
          <td>${planConfig.billingPeriod === "annual" ? "Annual" : "Monthly"}</td>
          <td style="text-align: right; font-weight: 600;">${formattedAmount}</td>
        </tr>
        <tr class="total-row">
          <td colspan="2" style="text-align: right;">Total Paid:</td>
          <td style="text-align: right;">${formattedAmount}</td>
        </tr>
      </tbody>
    </table>

    <div class="meta-grid" style="font-size: 12px; margin-bottom: 16px;">
      <div>
        <span class="meta-label">Payment Gateway:</span> Razorpay (RBI Regulated)<br />
        <span class="meta-label">Reference ID:</span> ${paymentId}
      </div>
      <div>
        <span class="meta-label">Payment Status:</span> Confirmed via Webhook
      </div>
    </div>

    <div class="disclaimer">
      <strong>Receipt Notice:</strong> This is a computer-generated electronic payment receipt. A formal GST Tax Invoice will be issued separately once our CA completes GST formalization.
    </div>

    <div style="text-align: right;">
      <button class="print-btn" onclick="window.print()">Print Receipt</button>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(receiptHtml, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Receipt load failed";
    return new NextResponse(errorMsg, { status: 400 });
  }
}

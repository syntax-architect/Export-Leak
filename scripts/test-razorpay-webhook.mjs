#!/usr/bin/env node

/**
 * Local testing script for ExportLeak Razorpay Webhooks.
 * Generates HMAC-SHA256 signatures over sample payloads and submits them
 * to the webhook endpoint (default: http://localhost:3000/api/webhooks/razorpay).
 */

import crypto from "node:crypto";

const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3000/api/webhooks/razorpay";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "test_webhook_secret_67890";

function signPayload(body, secret) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function sendWebhook(testName, payloadObj, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(payloadObj);
  const signature = signPayload(body, secret);

  console.log(`\n--- Running Test: ${testName} ---`);
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Razorpay-Signature": signature,
        "X-Razorpay-Event-Id": payloadObj.id,
      },
      body,
    });

    const status = res.status;
    const json = await res.json().catch(() => ({}));
    console.log(`HTTP ${status}:`, json);
    return { status, json };
  } catch (err) {
    console.error("Request failed:", err.message);
    return { status: 0, error: err.message };
  }
}

async function runAll() {
  console.log(`Starting Razorpay Webhook Test Suite -> ${WEBHOOK_URL}`);

  const sampleSubId = `sub_cli_${Date.now()}`;
  const sampleEventId = `evt_cli_${Date.now()}`;

  // 1. Valid subscription.activated
  const activatedPayload = {
    entity: "event",
    id: sampleEventId,
    event: "subscription.activated",
    payload: {
      subscription: {
        entity: {
          id: sampleSubId,
          plan_id: "plan_exporter_monthly",
          status: "active",
          current_start: Math.floor(Date.now() / 1000),
          current_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
          paid_count: 1,
          total_count: 120,
          notes: {
            plan_key: "exporter_monthly",
          },
        },
      },
      payment: {
        entity: {
          id: `pay_cli_${Date.now()}`,
          amount: 99900,
          currency: "INR",
          status: "captured",
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };

  await sendWebhook("1. subscription.activated", activatedPayload);

  // 2. Duplicate detection (resend exact same event ID)
  await sendWebhook("2. Duplicate Event (Idempotent 200)", activatedPayload);

  // 3. Invalid signature (fail closed 400)
  await sendWebhook("3. Invalid Signature", activatedPayload, "wrong_secret");

  // 4. subscription.charged (renewal)
  const chargedPayload = {
    entity: "event",
    id: `evt_cli_charged_${Date.now()}`,
    event: "subscription.charged",
    payload: {
      subscription: {
        entity: {
          id: sampleSubId,
          status: "active",
          paid_count: 2,
        },
      },
      payment: {
        entity: {
          id: `pay_cli_2_${Date.now()}`,
          amount: 99900,
          currency: "INR",
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000) + 10,
  };
  await sendWebhook("4. subscription.charged", chargedPayload);

  // 5. subscription.pending (3-day grace period)
  const pendingPayload = {
    entity: "event",
    id: `evt_cli_pending_${Date.now()}`,
    event: "subscription.pending",
    payload: {
      subscription: {
        entity: {
          id: sampleSubId,
          status: "pending",
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000) + 20,
  };
  await sendWebhook("5. subscription.pending", pendingPayload);

  // 6. Out-of-order check: older subscription.authenticated after active
  const olderAuthPayload = {
    entity: "event",
    id: `evt_cli_old_${Date.now()}`,
    event: "subscription.authenticated",
    payload: {
      subscription: {
        entity: {
          id: sampleSubId,
          status: "authenticated",
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000) - 1000,
  };
  await sendWebhook("6. Out-of-order older authenticated event", olderAuthPayload);

  // 7. subscription.halted (grace ended -> downgrade)
  const haltedPayload = {
    entity: "event",
    id: `evt_cli_halted_${Date.now()}`,
    event: "subscription.halted",
    payload: {
      subscription: {
        entity: {
          id: sampleSubId,
          status: "halted",
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000) + 50,
  };
  await sendWebhook("7. subscription.halted", haltedPayload);

  console.log("\nFinished Razorpay Webhook Test Suite.");
}

runAll();

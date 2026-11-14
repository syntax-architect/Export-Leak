import { NextResponse } from "next/server";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { APP_CONFIG } from "@/config/app";

const startTime = Date.now();

export const dynamic = "force-dynamic";

export async function GET() {
  let dbStatus = "unreachable";
  let dbLatencyMs = 0;

  const dbStart = Date.now();
  try {
    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();
      await db.query("SELECT 1");
      dbStatus = "connected";
    } else {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("compliance_rules").select("key").limit(1);
      if (!error) {
        dbStatus = "connected";
      }
    }
  } catch {
    dbStatus = "error";
  }
  dbLatencyMs = Date.now() - dbStart;

  const healthy = dbStatus === "connected";

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      app: {
        name: APP_CONFIG.name,
        version: "0.1.0",
        environment: process.env.NODE_ENV || "development",
      },
      checks: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
      },
    },
    { status: healthy ? 200 : 503 }
  );
}

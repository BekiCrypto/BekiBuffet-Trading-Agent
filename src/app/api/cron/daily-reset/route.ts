import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron job: Daily agent state reset
// Resets dayStartEquity, consecutiveLosses for all agent states
// Runs daily at midnight UTC via Vercel Cron
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Reset daily loss tracking for all agent states
    const result = await db.agentState.updateMany({
      where: {},
      data: {
        dayStartEquity: undefined, // Will be set on next tick
        consecutiveLosses: 0,
      },
    });

    logger.info("Cron: daily-reset complete", { reset: result.count });

    return NextResponse.json({ ok: true, reset: result.count });
  } catch (e: any) {
    logger.error("Cron daily-reset failed", { error: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET agent state for current user (optional: by broker)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const agents = await db.agentState.findMany({
    where: { userId: session.user.id },
    include: { user: { select: { name: true, email: true } } },
  });
  return NextResponse.json({ agents });
}

// Persist agent state from the live terminal
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const brokerAccountId = body.brokerAccountId ?? "PAPER";
    const agent = await db.agentState.upsert({
      where: {
        userId_brokerAccountId: {
          userId: session.user.id,
          brokerAccountId,
        },
      },
      create: {
        userId: session.user.id,
        brokerAccountId,
        mode: body.mode ?? "PAUSED",
        equity: body.equity ?? 100000,
        balance: body.balance ?? 100000,
        floatingPnl: body.floatingPnl ?? 0,
        dayStartEquity: body.dayStartEquity ?? 100000,
        consecutiveLosses: body.consecutiveLosses ?? 0,
        ticksProcessed: body.ticksProcessed ?? 0,
        decisionsTaken: body.decisionsTaken ?? 0,
        decisionsRejected: body.decisionsRejected ?? 0,
        decisionsWaiting: body.decisionsWaiting ?? 0,
        campaignsActive: body.campaignsActive ?? 0,
        selfLearningJson: body.selfLearningJson ?? null,
        activeAssets: body.activeAssets ?? null,
        lastTickAt: body.lastTickAt ?? new Date(),
      },
      // M11 FIX: Filter out undefined fields so partial updates don't null out columns
      update: Object.fromEntries(
        Object.entries({
          mode: body.mode,
          equity: body.equity,
          balance: body.balance,
          floatingPnl: body.floatingPnl,
          dayStartEquity: body.dayStartEquity,
          consecutiveLosses: body.consecutiveLosses,
          ticksProcessed: body.ticksProcessed,
          decisionsTaken: body.decisionsTaken,
          decisionsRejected: body.decisionsRejected,
          decisionsWaiting: body.decisionsWaiting,
          campaignsActive: body.campaignsActive,
          selfLearningJson: body.selfLearningJson,
          activeAssets: body.activeAssets,
          lastTickAt: new Date(),
        }).filter(([_, v]) => v !== undefined)
      ),
    });
    return NextResponse.json({ ok: true, agent });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

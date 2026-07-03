import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { BrokerType } from "@/lib/saas";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const brokers = await db.brokerAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ brokers });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
    if (!sub) return NextResponse.json({ error: "No subscription" }, { status: 400 });
    const count = await db.brokerAccount.count({ where: { userId: session.user.id } });
    if (count >= sub.seats) {
      return NextResponse.json({ error: `Tier ${sub.tier} allows ${sub.seats} broker connections` }, { status: 403 });
    }
    const broker = await db.brokerAccount.create({
      data: {
        userId: session.user.id,
        brokerType: body.brokerType as BrokerType,
        accountName: body.accountName,
        accountId: body.accountId,
        apiKey: body.apiKey ?? null,
        apiSecret: body.apiSecret ?? null,
        server: body.server ?? null,
        balance: body.initialCapital ?? 100000,
        equity: body.initialCapital ?? 100000,
        isConnected: true,
        lastSyncAt: new Date(),
      },
    });
    await db.activityLog.create({
      data: {
        userId: session.user.id,
        type: "BROKER",
        action: "CONNECTED",
        detail: `Connected ${body.brokerType} account ${body.accountName}`,
      },
    });
    return NextResponse.json({ ok: true, broker });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await db.brokerAccount.deleteMany({ where: { id, userId: session.user.id } });
    await db.activityLog.create({
      data: {
        userId: session.user.id,
        type: "BROKER",
        action: "DISCONNECTED",
        detail: `Disconnected broker ${id}`,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

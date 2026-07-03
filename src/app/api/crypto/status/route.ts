import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger, sanitizeError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Get status of a crypto payment
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get("paymentId");

    if (paymentId) {
      // Get specific payment
      const payment = await db.cryptoPayment.findFirst({
        where: { paymentId, userId: session.user.id },
      });
      if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
      return NextResponse.json({ payment });
    }

    // Get all user's payments
    const payments = await db.cryptoPayment.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ payments });
  } catch (e: any) {
    logger.error("Failed to fetch payment status", { error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendTemplatedEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron job: Check for expiring/expired trials and subscriptions
// Runs daily via Vercel Cron (see vercel.json)
export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized execution
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // 1. Expire trials past their end date
    const expiredTrials = await db.subscription.findMany({
      where: {
        status: "TRIALING",
        trialEndsAt: { lt: now },
      },
    });

    for (const trial of expiredTrials) {
      await db.subscription.update({
        where: { id: trial.id },
        data: {
          status: "ACTIVE",
          tier: "FREE",
          seats: 1,
          maxCapitalUsd: 10000,
          backtestCredits: 10,
          aiAgentEnabled: false,
          edgeDiscoveryEnabled: false,
        },
      });

      const user = await db.user.findUnique({ where: { id: trial.userId } });
      if (user?.email) {
        await sendTemplatedEmail(user.email, "subscription_canceled", {
          periodEnd: now.toLocaleDateString(),
        });
      }

      await db.activityLog.create({
        data: {
          userId: trial.userId,
          type: "SUBSCRIPTION",
          action: "TRIAL_EXPIRED",
          detail: "Trial expired — downgraded to Free tier",
        },
      });

      logger.info("Trial expired", { userId: trial.userId });
    }

    // 2. Send trial expiring warnings (3 days before)
    const expiringTrials = await db.subscription.findMany({
      where: {
        status: "TRIALING",
        trialEndsAt: { lt: threeDaysFromNow, gt: now },
      },
    });

    for (const trial of expiringTrials) {
      const daysLeft = Math.ceil((trial.trialEndsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      if (daysLeft <= 0) continue;

      const user = await db.user.findUnique({ where: { id: trial.userId } });
      if (user?.email) {
        await sendTemplatedEmail(user.email, "trial_expiring", {
          daysLeft,
          expiryDate: trial.trialEndsAt!.toLocaleDateString(),
          upgradeUrl: `${process.env.NEXTAUTH_URL || ""}/?view=subscription`,
        });
      }
    }

    // 3. Check past-due subscriptions (payment failed > 7 days ago)
    const pastDueSubs = await db.subscription.findMany({
      where: {
        status: "PAST_DUE",
      },
    });

    for (const sub of pastDueSubs) {
      // If past-due for more than 7 days, downgrade to FREE
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (sub.currentPeriodEnd && sub.currentPeriodEnd < sevenDaysAgo) {
        await db.subscription.update({
          where: { id: sub.id },
          data: {
            status: "CANCELED",
            tier: "FREE",
            seats: 1,
            maxCapitalUsd: 10000,
            backtestCredits: 10,
            aiAgentEnabled: false,
            edgeDiscoveryEnabled: false,
          },
        });
        logger.info("Past-due subscription downgraded", { userId: sub.userId });
      }
    }

    // 4. Reset backtest credits monthly (for active subscriptions)
    // Find subscriptions whose currentPeriodEnd is in the past (needs renewal)
    const needCreditReset = await db.subscription.findMany({
      where: {
        status: "ACTIVE",
        currentPeriodEnd: { lt: now },
        tier: { not: "FREE" },
      },
    });

    for (const sub of needCreditReset) {
      const credits = sub.tier === "PRO" ? 100 : sub.tier === "ELITE" ? 1000 : 100000;
      await db.subscription.update({
        where: { id: sub.id },
        data: {
          backtestCredits: credits,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      logger.info("Credits reset", { userId: sub.userId, credits });
    }

    logger.info("Cron: trial-expiry complete", {
      expired: expiredTrials.length,
      expiring: expiringTrials.length,
      pastDue: pastDueSubs.length,
      creditReset: needCreditReset.length,
    });

    return NextResponse.json({
      ok: true,
      expired: expiredTrials.length,
      expiring: expiringTrials.length,
      pastDue: pastDueSubs.length,
      creditReset: needCreditReset.length,
    });
  } catch (e: any) {
    logger.error("Cron trial-expiry failed", { error: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

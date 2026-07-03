// ============================================================================
// BekiBuffet SaaS — Crypto Payment System (USDT BEP-20, Self-Custody)
// ============================================================================
// Accepts subscription payments in USDT on Binance Smart Chain (BEP-20).
//
// This is a SELF-CUSTODY system — no third-party payment processor.
// Users send USDT BEP-20 directly to your wallet. The system verifies
// incoming transfers on the BSC blockchain using viem.
//
// Required environment variable:
//   CRYPTO_RECEIVING_WALLET=0xYourBscWalletAddress
//
// The wallet is fully under your control. No NOWPayments, no gateway,
// no intermediary. Funds go directly to your wallet.
// ============================================================================

import { createPublicClient, http, parseAbiItem, formatUnits, type Hash } from "viem";
import { bsc } from "viem/chains";
import { db } from "./db";
import { logger } from "./logger";
import { sendTemplatedEmail } from "./email";
import type { Tier } from "./saas";

// USDT BEP-20 contract on BSC mainnet
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955" as const;
const USDT_DECIMALS = 18;

// Minimum confirmations required (12 blocks ≈ 36 seconds on BSC)
const MIN_CONFIRMATIONS = 12;

// Tier pricing in USD (monthly). USDT is pegged 1:1 to USD.
const TIER_PRICES_USD: Record<Tier, number> = {
  FREE: 0,
  PRO: 149,
  ELITE: 499,
  INSTITUTIONAL: 2500,
};

const TIER_CONFIG: Record<Tier, { seats: number; capital: number; risk: number; credits: number }> = {
  FREE: { seats: 1, capital: 10000, risk: 0.5, credits: 10 },
  PRO: { seats: 3, capital: 100000, risk: 1.5, credits: 100 },
  ELITE: { seats: 10, capital: 1000000, risk: 2.0, credits: 1000 },
  INSTITUTIONAL: { seats: 100, capital: 100000000, risk: 3.0, credits: 100000 },
};

// BSC public client for blockchain verification (singleton)
let bscClient: ReturnType<typeof createPublicClient> | null = null;

function getBscClient() {
  if (!bscClient) {
    bscClient = createPublicClient({
      chain: bsc,
      transport: http(process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org"),
    });
  }
  return bscClient;
}

/**
 * Check if crypto payments are configured.
 * Returns true when CRYPTO_RECEIVING_WALLET is set.
 */
export function isCryptoPaymentEnabled(): boolean {
  return !!process.env.CRYPTO_RECEIVING_WALLET && process.env.CRYPTO_RECEIVING_WALLET.startsWith("0x");
}

/**
 * Get the receiving wallet address (self-custody — your wallet).
 */
export function getReceivingWallet(): string | null {
  return process.env.CRYPTO_RECEIVING_WALLET || null;
}

/**
 * Create a crypto payment request.
 * Returns payment instructions for the user to send USDT BEP-20.
 */
export async function createCryptoPayment(
  userId: string,
  userEmail: string,
  tier: Tier,
  billingCycle: "monthly" | "annual" = "monthly"
): Promise<{
  paymentId: string;
  amount: number;
  amountUsdt: number;
  receivingAddress: string;
  currency: string;
  network: string;
  expiresAt: Date;
  error?: string;
}> {
  const priceUsd = TIER_PRICES_USD[tier] * (billingCycle === "annual" ? 10 : 1); // Annual = 10 months (2 months free)
  const amountUsdt = priceUsd; // USDT pegged 1:1 to USD
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour to pay

  const receivingAddress = process.env.CRYPTO_RECEIVING_WALLET;

  if (!receivingAddress) {
    return {
      paymentId: "",
      amount: priceUsd,
      amountUsdt,
      receivingAddress: "",
      currency: "USDT",
      network: "BSC",
      expiresAt,
      error: "Crypto payments are not configured. Set CRYPTO_RECEIVING_WALLET environment variable.",
    };
  }

  // Generate a unique payment ID for tracking
  const paymentId = `bsc-${userId}-${Date.now()}`;

  // Persist payment record
  const payment = await db.cryptoPayment.create({
    data: {
      userId,
      tier,
      amount: amountUsdt,
      amountUsdt,
      currency: "USDT",
      network: "BSC",
      status: "PENDING",
      paymentId,
      toAddress: receivingAddress,
      expiresAt,
    },
  });

  // Link to subscription
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (sub) {
    await db.cryptoPayment.update({
      where: { id: payment.id },
      data: { subscriptionId: sub.id },
    });
  }

  logger.info("Self-custody crypto payment created", {
    userId,
    tier,
    paymentId,
    amount: amountUsdt,
    receivingAddress,
  });

  return {
    paymentId,
    amount: priceUsd,
    amountUsdt,
    receivingAddress,
    currency: "USDT",
    network: "BSC (BEP-20)",
    expiresAt,
  };
}

/**
 * Verify a self-custody blockchain payment by checking BSC for incoming USDT.
 *
 * Two modes:
 *   1. User submits a txHash — verify that specific transaction
 *   2. No txHash — scan recent Transfer events to our wallet for matching amount
 */
export async function verifyDirectPayment(
  paymentId: string,
  txHash?: string
): Promise<{
  confirmed: boolean;
  amountReceived: number;
  confirmations: number;
  txHash?: string;
  error?: string;
}> {
  const payment = await db.cryptoPayment.findFirst({
    where: { paymentId, status: "PENDING" },
  });

  if (!payment) {
    return { confirmed: false, amountReceived: 0, confirmations: 0, error: "Payment not found or already processed" };
  }

  // Check expiry
  if (payment.expiresAt && Date.now() > payment.expiresAt.getTime()) {
    await db.cryptoPayment.update({
      where: { id: payment.id },
      data: { status: "EXPIRED" },
    });
    return { confirmed: false, amountReceived: 0, confirmations: 0, error: "Payment expired — please create a new payment" };
  }

  const client = getBscClient();
  const receivingAddress = payment.toAddress as `0x${string}`;

  try {
    let txHashToCheck: Hash | undefined = txHash as Hash;

    // If no txHash provided, scan recent Transfer events to our address
    if (!txHashToCheck) {
      const currentBlock = await client.getBlockNumber();
      const fromBlock = currentBlock > 1000n ? currentBlock - 1000n : 0n;

      logger.info("Scanning BSC for incoming USDT transfers", {
        paymentId,
        receivingAddress,
        fromBlock: fromBlock.toString(),
        toBlock: currentBlock.toString(),
      });

      const logs = await client.getLogs({
        address: USDT_CONTRACT,
        event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
        args: { to: receivingAddress },
        fromBlock,
        toBlock: currentBlock,
      });

      // Check if any transfer matches the expected amount
      for (const log of logs) {
        const value = log.args.value;
        if (!value) continue;
        const amount = parseFloat(formatUnits(value, USDT_DECIMALS));

        // Allow small slippage (0.5%) for gas/fees
        if (amount >= payment.amountUsdt * 0.995) {
          txHashToCheck = log.transactionHash;
          logger.info("Matching transfer found", { paymentId, txHash: txHashToCheck, amount });
          break;
        }
      }

      if (!txHashToCheck) {
        return {
          confirmed: false,
          amountReceived: 0,
          confirmations: 0,
          error: "No matching USDT transfer found yet. Send the payment and try again, or submit the transaction hash manually.",
        };
      }
    }

    // Get transaction receipt for confirmation count
    const receipt = await client.getTransactionReceipt({ hash: txHashToCheck });
    const currentBlock = await client.getBlockNumber();
    const confirmations = Number(currentBlock - receipt.blockNumber);

    // Parse transfer amount from receipt logs
    let amountReceived = 0;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === USDT_CONTRACT.toLowerCase()) {
        // Transfer event: topic 0 = Transfer, topic 1 = from, topic 2 = to, data = value
        const toAddress = "0x" + (log.topics[2]?.slice(26) || "");
        if (toAddress.toLowerCase() === receivingAddress.toLowerCase()) {
          amountReceived = parseFloat(formatUnits(BigInt(log.data), USDT_DECIMALS));
        }
      }
    }

    // Require minimum confirmations and correct amount
    const isConfirmed = confirmations >= MIN_CONFIRMATIONS && amountReceived >= payment.amountUsdt * 0.995;

    if (isConfirmed) {
      // Confirm payment
      await db.cryptoPayment.update({
        where: { id: payment.id },
        data: {
          status: "CONFIRMED",
          txHash: txHashToCheck,
          fromAddress: receipt.from,
          confirmations,
          blockNumber: receipt.blockNumber,
          confirmedAt: new Date(),
        },
      });

      // Activate subscription
      await activateCryptoSubscription(payment.userId, payment.tier as Tier, amountReceived, txHashToCheck);

      logger.info("Self-custody payment confirmed", {
        paymentId,
        txHash: txHashToCheck,
        amount: amountReceived,
        confirmations,
      });

      return { confirmed: true, amountReceived, confirmations, txHash: txHashToCheck };
    }

    // Update confirmations but not yet confirmed
    await db.cryptoPayment.update({
      where: { id: payment.id },
      data: {
        txHash: txHashToCheck,
        confirmations,
        fromAddress: receipt.from,
        blockNumber: receipt.blockNumber,
      },
    });

    return {
      confirmed: false,
      amountReceived,
      confirmations,
      txHash: txHashToCheck,
      error: `Waiting for block confirmations (${confirmations}/${MIN_CONFIRMATIONS})`,
    };
  } catch (e: any) {
    logger.error("Payment verification failed", { paymentId, error: e.message });

    // If the tx hash is invalid, return a clear error
    if (e.message?.includes("hash") || e.message?.includes("transaction")) {
      return { confirmed: false, amountReceived: 0, confirmations: 0, error: "Invalid transaction hash — please check and try again" };
    }

    return { confirmed: false, amountReceived: 0, confirmations: 0, error: `Verification failed: ${e.message}` };
  }
}

/**
 * Activate subscription after confirmed crypto payment.
 */
async function activateCryptoSubscription(
  userId: string,
  tier: Tier,
  amountPaid: number,
  txHash: string
): Promise<void> {
  const config = TIER_CONFIG[tier];
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.subscription.upsert({
    where: { userId },
    create: {
      userId,
      tier,
      status: "ACTIVE",
      lastPaymentTxHash: txHash,
      seats: config.seats,
      maxCapitalUsd: config.capital,
      riskLimitPct: config.risk,
      backtestCredits: config.credits,
      aiAgentEnabled: tier !== "FREE",
      edgeDiscoveryEnabled: tier !== "FREE",
      currentPeriodEnd: periodEnd,
    },
    update: {
      tier,
      status: "ACTIVE",
      lastPaymentTxHash: txHash,
      seats: config.seats,
      maxCapitalUsd: config.capital,
      riskLimitPct: config.risk,
      backtestCredits: config.credits,
      aiAgentEnabled: tier !== "FREE",
      edgeDiscoveryEnabled: tier !== "FREE",
      currentPeriodEnd: periodEnd,
    },
  });

  // Send confirmation email
  const user = await db.user.findUnique({ where: { id: userId } });
  if (user?.email) {
    await sendTemplatedEmail(user.email, "subscription_activated", {
      tier,
      seats: config.seats,
      maxCapital: config.capital,
      backtestCredits: config.credits,
      renewalDate: periodEnd.toLocaleDateString(),
    });
  }

  await db.activityLog.create({
    data: {
      userId,
      type: "SUBSCRIPTION",
      action: "CRYPTO_PAYMENT_CONFIRMED",
      detail: `${tier} subscription activated via USDT BEP-20 payment (tx: ${txHash}, amount: ${amountPaid} USDT)`,
    },
  });

  logger.info("Crypto subscription activated", { userId, tier, txHash, amountPaid });
}

/**
 * Get USDT price for a tier.
 */
export function getTierPrice(tier: Tier, billingCycle: "monthly" | "annual" = "monthly"): number {
  return TIER_PRICES_USD[tier] * (billingCycle === "annual" ? 10 : 1);
}

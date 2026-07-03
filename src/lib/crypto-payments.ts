// ============================================================================
// BekiBuffet SaaS — Crypto Payment System (USDT BEP-20)
// ============================================================================
// Accepts subscription payments in USDT on Binance Smart Chain (BEP-20).
//
// Two payment modes:
//   1. NOWPayments Gateway — third-party payment processor
//      (easiest, handles wallet generation + webhooks)
//   2. Direct Blockchain — monitor BSC for incoming USDT transfers
//      (more decentralized, no third party)
//
// The system auto-detects which mode to use based on environment variables:
//   - NOWPAYMENTS_API_KEY set → use NOWPayments gateway
//   - CRYPTO_RECEIVING_WALLET set → use direct blockchain verification
// ============================================================================

import { createPublicClient, http, parseAbiItem, formatUnits, type Hash } from "viem";
import { bsc } from "viem/chains";
import crypto from "crypto";
import { db } from "./db";
import { logger } from "./logger";
import { sendTemplatedEmail } from "./email";
import type { Tier } from "./saas";

// USDT BEP-20 contract on BSC mainnet
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955" as const;
const USDT_DECIMALS = 18;

// Tier pricing in USD (monthly)
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

// BSC public client for blockchain verification
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
 * Check which crypto payment mode is active.
 */
export function getCryptoPaymentMode(): "nowpayments" | "direct" | "none" {
  if (process.env.NOWPAYMENTS_API_KEY) return "nowpayments";
  if (process.env.CRYPTO_RECEIVING_WALLET) return "direct";
  return "none";
}

export function isCryptoPaymentEnabled(): boolean {
  return getCryptoPaymentMode() !== "none";
}

/**
 * Get the receiving wallet address for direct payments.
 */
export function getReceivingWallet(): string | null {
  return process.env.CRYPTO_RECEIVING_WALLET || null;
}

/**
 * Create a crypto payment request.
 * Returns payment instructions for the user.
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
  checkoutUrl?: string;
  qrCode?: string;
  error?: string;
}> {
  const priceUsd = TIER_PRICES_USD[tier] * (billingCycle === "annual" ? 10 : 1); // Annual = 10 months (2 months free)
  // USDT is pegged 1:1 to USD
  const amountUsdt = priceUsd;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour to pay

  const mode = getCryptoPaymentMode();

  if (mode === "nowpayments") {
    return createNowPaymentsPayment(userId, userEmail, tier, amountUsdt, expiresAt, billingCycle);
  } else if (mode === "direct") {
    return createDirectPayment(userId, tier, amountUsdt, expiresAt, billingCycle);
  }

  return {
    paymentId: "",
    amount: priceUsd,
    amountUsdt,
    receivingAddress: "",
    currency: "USDT",
    network: "BSC",
    expiresAt,
    error: "Crypto payments are not configured. Set NOWPAYMENTS_API_KEY or CRYPTO_RECEIVING_WALLET.",
  };
}

/**
 * NOWPayments gateway integration.
 */
async function createNowPaymentsPayment(
  userId: string,
  userEmail: string,
  tier: Tier,
  amountUsdt: number,
  expiresAt: Date,
  billingCycle: string
) {
  const apiKey = process.env.NOWPAYMENTS_API_KEY!;
  const baseUrl = process.env.NOWPAYMENTS_API_URL || "https://api.nowpayments.io";

  try {
    const resp = await fetch(`${baseUrl}/v1/payment`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: amountUsdt,
        price_currency: "usd",
        pay_currency: "usdt",
        pay_network: "bsc",
        order_id: `${userId}-${tier}-${Date.now()}`,
        order_description: `BekiBuffet ${tier} subscription (${billingCycle})`,
        ipn_callback_url: `${process.env.NEXTAUTH_URL}/api/crypto/webhook`,
        success_url: `${process.env.NEXTAUTH_URL}/?payment=success`,
        cancel_url: `${process.env.NEXTAUTH_URL}/?payment=canceled`,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      logger.error("NOWPayments API error", { status: resp.status, error: err });
      throw new Error(`NOWPayments API error: ${resp.status}`);
    }

    const data = await resp.json();

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
        paymentId: data.payment_id,
        toAddress: data.pay_address,
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

    logger.info("NOWPayments payment created", {
      userId,
      tier,
      paymentId: data.payment_id,
      amount: amountUsdt,
    });

    return {
      paymentId: data.payment_id,
      amount: amountUsdt,
      amountUsdt,
      receivingAddress: data.pay_address,
      currency: "USDT",
      network: "BSC",
      expiresAt,
      checkoutUrl: data.invoice_url,
      qrCode: data.qr_code,
    };
  } catch (e: any) {
    logger.error("NOWPayments payment creation failed", { error: e.message });
    return {
      paymentId: "",
      amount: amountUsdt,
      amountUsdt,
      receivingAddress: "",
      currency: "USDT",
      network: "BSC",
      expiresAt,
      error: e.message,
    };
  }
}

/**
 * Direct blockchain payment — user sends USDT to our wallet, we verify on-chain.
 */
async function createDirectPayment(
  userId: string,
  tier: Tier,
  amountUsdt: number,
  expiresAt: Date,
  billingCycle: string
) {
  const receivingAddress = process.env.CRYPTO_RECEIVING_WALLET!;

  // Generate a unique payment ID for tracking
  const paymentId = `direct-${userId}-${Date.now()}`;

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

  logger.info("Direct crypto payment created", {
    userId,
    tier,
    paymentId,
    amount: amountUsdt,
    receivingAddress,
  });

  return {
    paymentId,
    amount: amountUsdt,
    amountUsdt,
    receivingAddress,
    currency: "USDT",
    network: "BSC (BEP-20)",
    expiresAt,
  };
}

/**
 * Verify a direct blockchain payment by checking BSC for incoming USDT transfers.
 */
export async function verifyDirectPayment(
  paymentId: string,
  txHash?: string
): Promise<{
  confirmed: boolean;
  amountReceived: number;
  confirmations: number;
  error?: string;
}> {
  const payment = await db.cryptoPayment.findFirst({
    where: { paymentId, status: "PENDING" },
  });

  if (!payment) {
    return { confirmed: false, amountReceived: 0, confirmations: 0, error: "Payment not found or already processed" };
  }

  if (payment.expiresAt && Date.now() > payment.expiresAt.getTime()) {
    await db.cryptoPayment.update({
      where: { id: payment.id },
      data: { status: "EXPIRED" },
    });
    return { confirmed: false, amountReceived: 0, confirmations: 0, error: "Payment expired" };
  }

  const client = getBscClient();
  const receivingAddress = payment.toAddress as `0x${string}`;

  try {
    let txHashToCheck: Hash | undefined = txHash as Hash;

    // If no txHash provided, scan recent Transfer events to our address
    if (!txHashToCheck) {
      const currentBlock = await client.getBlockNumber();
      const fromBlock = currentBlock > 1000n ? currentBlock - 1000n : 0n;

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

        // Allow small slippage (0.5%)
        if (amount >= payment.amountUsdt * 0.995) {
          txHashToCheck = log.transactionHash;
          break;
        }
      }

      if (!txHashToCheck) {
        return { confirmed: false, amountReceived: 0, confirmations: 0, error: "No matching transfer found yet" };
      }
    }

    // Get transaction receipt for confirmations
    const receipt = await client.getTransactionReceipt({ hash: txHashToCheck });
    const currentBlock = await client.getBlockNumber();
    const confirmations = Number(currentBlock - receipt.blockNumber);

    // Parse transfer amount from logs
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

    // Require at least 12 confirmations (~36 seconds on BSC)
    const MIN_CONFIRMATIONS = 12;
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
      await activateCryptoSubscription(payment.userId, payment.tier as Tier, payment.amountUsdt, txHashToCheck);

      logger.info("Direct crypto payment confirmed", {
        paymentId,
        txHash: txHashToCheck,
        amount: amountReceived,
        confirmations,
      });

      return { confirmed: true, amountReceived, confirmations };
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
      error: `Waiting for confirmations (${confirmations}/${MIN_CONFIRMATIONS})`,
    };
  } catch (e: any) {
    logger.error("Direct payment verification failed", { paymentId, error: e.message });
    return { confirmed: false, amountReceived: 0, confirmations: 0, error: e.message };
  }
}

/**
 * Handle NOWPayments webhook.
 */
export async function handleNowPaymentsWebhook(payload: any): Promise<void> {
  const { payment_id, payment_status, pay_address, pay_amount, order_id, tx_hash } = payload;

  logger.info("NOWPayments webhook received", { paymentId: payment_id, status: payment_status });

  const payment = await db.cryptoPayment.findFirst({
    where: { paymentId: String(payment_id) },
  });

  if (!payment) {
    logger.warn("NOWPayments webhook: payment not found", { paymentId: payment_id });
    return;
  }

  if (payment_status === "finished" || payment_status === "confirmed") {
    // Payment confirmed
    await db.cryptoPayment.update({
      where: { id: payment.id },
      data: {
        status: "CONFIRMED",
        txHash: tx_hash,
        fromAddress: pay_address,
        confirmations: 100,
        confirmedAt: new Date(),
      },
    });

    await activateCryptoSubscription(payment.userId, payment.tier as Tier, parseFloat(pay_amount), tx_hash);
  } else if (payment_status === "failed" || payment_status === "expired") {
    await db.cryptoPayment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
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
      detail: `${tier} subscription activated via USDT BEP-20 payment (tx: ${txHash})`,
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

/**
 * Verify NOWPayments webhook signature.
 */
export function verifyNowPaymentsSignature(
  payload: string,
  signature: string
): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) return true; // Skip verification if no secret configured (not recommended for production)

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return expected === signature;
}

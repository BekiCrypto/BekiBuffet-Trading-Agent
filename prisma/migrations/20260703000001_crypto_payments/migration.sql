-- CreateTable
CREATE TABLE "CryptoPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "tier" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "amountUsdt" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "network" TEXT NOT NULL DEFAULT 'BSC',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "paymentId" TEXT,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "blockNumber" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "CryptoPayment_pkey" PRIMARY KEY ("id")
);

-- Add crypto payment fields to Subscription
ALTER TABLE "Subscription" ADD COLUMN "walletAddress" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "paymentId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "lastPaymentTxHash" TEXT;

-- Remove Stripe fields from Subscription
ALTER TABLE "Subscription" DROP COLUMN "stripeCustomerId";
ALTER TABLE "Subscription" DROP COLUMN "stripeSubId";

-- CreateIndex
CREATE INDEX "CryptoPayment_userId_createdAt_idx" ON "CryptoPayment"("userId", "createdAt");
CREATE INDEX "CryptoPayment_status_idx" ON "CryptoPayment"("status");
CREATE INDEX "CryptoPayment_txHash_idx" ON "CryptoPayment"("txHash");

-- AddForeignKey
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

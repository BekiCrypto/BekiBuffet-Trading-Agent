# BekiBuffet — Autonomous AI Trading Agent SaaS

> Journal-trained autonomous AI trading system. Subscribe, connect your broker, and let BekiBuffet trade for you — multi-timeframe analysis, Ichimoku intelligence, confluence scoring, campaign management, and continuous self-learning.

![BekiBuffet](https://img.shields.io/badge/BekiBuffet-SaaS-blue) ![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Prisma](https://img.shields.io/badge/Prisma-6-indigo) ![License](https://img.shields.io/badge/License-Proprietary-red)

---

## Overview

BekiBuffet is a complete autonomous AI trading decision engine built as a multi-tenant SaaS platform. It's not an indicator robot — it's a transparent, modular AI agent where every decision is auditable. The system analyzes 5 assets across 4 timeframes, scores confluence in real time, builds campaign positions, refuses bad trades via 9 do-not-trade rules, and continuously optimizes its edge through self-learning.

## Architecture

### 5 AI Modules + Do-Not-Trade Engine + Self-Learning

| Module | Purpose |
|--------|---------|
| **Market Structure Engine** | Pure price-action detection (Trend/Pullback/Compression/Breakout/Reversal/Range, BoS, CHoCH, liquidity sweeps) |
| **Ichimoku Intelligence** | Cloud thickness/slope, future cloud, Chikou clearance, Tenkan/Kijun angles, composite -100..+100 score |
| **Price Action Intelligence** | 11 candlestick patterns each with historical win rates |
| **Risk Commander** | Auto position sizing, ATR stops, daily DD limits, max exposure, consecutive loss ladder, break-even, partial closes, trailing |
| **Campaign Manager** | Scale-in up to 3 entries (2 for BTC), aggregate stop, campaign-level close, MFE/MAE tracking |
| **Do-Not-Trade Engine** | 9 refusal rules (flat cloud, low ATR, S/R too close, HTF disagreement, price extension, news, correlation, DD, consecutive losses) |
| **Confluence Scoring** | 6 weighted factors (Trend 25 + Cloud 20 + HTF 20 + PA 20 + Vol 10 + Session 5 = 100) |
| **Self-Learning Module** | Records every trade; tunes weights every 200 trades within [0.5×, 1.5×] — never alters core strategy |
| **AI Agent Decision Layer** | LLM-powered meta-decisioning on top of the rule-based engine |

### SaaS Platform

- **Authentication**: Google OAuth + demo credentials (NextAuth.js v4)
- **Subscriptions**: 4 tiers (Free / Pro / Elite / Institutional) with feature gating
- **Broker Connections**: MT5, OANDA, Binance, Interactive Brokers, Demo
- **Backtesting Engine**: 4 strategies × 5 assets × 2 timeframes with walk-forward validation
- **Edge Discovery**: Autonomous parameter search across 240 configurations
- **AI Agent**: LLM-powered meta-decisions with reasoning, factors, and self-learning insights
- **Multi-tenant**: Prisma + PostgreSQL (Neon) with full audit trail

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Database**: Prisma ORM (PostgreSQL / Neon)
- **Auth**: NextAuth.js v4 with Prisma adapter
- **State**: Zustand (client) + TanStack Query (server)
- **AI**: z-ai-web-dev-sdk (LLM completions)
- **Charts**: Custom SVG candlestick + Recharts

## Supported Assets

| Symbol | Display Name | Bias TF | Exec TF | ATR × | Min Score | Risk | Scales |
|--------|--------------|---------|---------|-------|-----------|------|--------|
| XAUUSD | Gold vs USD | H4 | M15 | 1.8 | 90 | 0.5-1% | 3 |
| EURUSD | Euro vs USD | H1 | M15 | 1.5 | 85 | 1% | 3 |
| GBPUSD | Pound vs USD | H1 | M15 | 1.7 | 88 | 0.75-1% | 3 |
| EURJPY | Euro vs Yen | H1 | M15 | 1.6 | 86 | 0.75-1% | 3 |
| BTCUSD | Bitcoin vs USD | H4 | H1 | 2.5 | 92 | 0.5% | 2 |

## Subscription Tiers

| Tier | Price | Brokers | Max Capital | Backtests | AI Agent | Edge Discovery |
|------|-------|---------|-------------|-----------|----------|----------------|
| Free | $0 | 1 (demo) | $10K | 10/mo | ❌ | ❌ |
| Pro | $149/mo | 3 | $100K | 100/mo | ✅ | ✅ |
| Elite | $499/mo | 10 | $1M | 1000/mo | ✅ | ✅ |
| Institutional | $2500/mo | ∞ | $100M | ∞ | ✅ | ✅ |

## Quick Start

### Prerequisites

- Node.js 18+
- Bun (recommended) or npm
- PostgreSQL database (Neon recommended for serverless)

### Installation

```bash
# Clone the repository
git clone https://github.com/BekiCrypto/BekiBuffet-Trading-Agent.git
cd BekiBuffet-Trading-Agent

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your Neon PostgreSQL connection string:
# DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/bekibuffet?sslmode=require
# NEXTAUTH_URL=http://localhost:3000
# NEXTAUTH_SECRET=your-secret-key-here
# GOOGLE_CLIENT_ID=your-google-oauth-client-id (optional)
# GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret (optional)

# Initialize database (creates all tables in Neon PostgreSQL)
bun run db:push

# Start development server
bun run dev
```

### Demo Account

The system auto-provisions a demo account on first sign-in attempt:
- **Email**: `demo@bekibuffet.ai`
- **Password**: `bekibuffet`
- **Tier**: Elite (all features unlocked)

Just click "Get Started" on the landing page → the demo account is provisioned automatically → credentials are pre-filled on the sign-in page.

## Project Structure

```
├── prisma/
│   └── schema.prisma              # 12 models (User, Subscription, Broker, Backtest, Edge, etc.)
├── src/
│   ├── app/
│   │   ├── api/                   # API routes (auth, subscription, broker, backtest, edge, agent, ai-decision, seed)
│   │   ├── globals.css            # Dark premium trading terminal theme
│   │   ├── layout.tsx
│   │   └── page.tsx               # SaaS view router
│   ├── components/
│   │   ├── saas/                  # SaaS shell + 9 views
│   │   │   ├── saas-provider.tsx  # Auth-aware view routing
│   │   │   ├── app-shell.tsx      # Sidebar nav with tier gating
│   │   │   ├── landing.tsx        # Marketing landing page
│   │   │   ├── signin.tsx         # Google OAuth + demo login
│   │   │   ├── dashboard.tsx      # Subscriber dashboard
│   │   │   ├── terminal.tsx       # Live trading terminal (wrapped)
│   │   │   ├── ai-agent-view.tsx  # LLM-powered AI agent
│   │   │   ├── backtest-view.tsx  # Backtesting UI
│   │   │   ├── edge-view.tsx      # Edge discovery UI
│   │   │   ├── brokers-view.tsx   # Broker connections
│   │   │   ├── subscription-view.tsx
│   │   │   ├── settings-view.tsx
│   │   │   └── admin-view.tsx     # Agent telemetry
│   │   └── trading/               # Trading engine UI components
│   │       ├── candle-chart.tsx
│   │       ├── confluence-panel.tsx
│   │       ├── regime-panel.tsx
│   │       ├── ichimoku-panel.tsx
│   │       ├── price-action-panel.tsx
│   │       ├── risk-panel.tsx
│   │       ├── do-not-trade-panel.tsx
│   │       ├── campaigns-panel.tsx
│   │       ├── self-learning-panel.tsx
│   │       ├── decision-log-panel.tsx
│   │       └── journal-panel.tsx
│   └── lib/
│       ├── auth.ts                # NextAuth config
│       ├── db.ts                  # Prisma client
│       ├── saas.ts                # Tiers, broker adapters, types
│       ├── saas-actions.ts        # Server actions
│       └── trading/
│           ├── types.ts           # Full type system
│           ├── indicators.ts      # ATR, SMA, EMA, swings, slope
│           ├── marketData.ts      # Multi-timeframe candle simulator
│           ├── presets.ts         # 5 asset presets
│           ├── marketStructure.ts # Module 1: structure engine
│           ├── ichimoku.ts        # Module 2: Ichimoku intelligence
│           ├── priceAction.ts     # Module 3: price action patterns
│           ├── confluence.ts      # Confluence scoring engine
│           ├── risk.ts            # Module 4: Risk Commander
│           ├── campaign.ts        # Module 5: Campaign Manager
│           ├── doNotTrade.ts      # Do-Not-Trade engine
│           ├── selfLearning.ts    # Self-learning module
│           ├── agent.ts           # Main agent orchestrator (Zustand)
│           ├── backtest.ts        # Backtesting engine
│           ├── edgeDiscovery.ts   # Autonomous edge search
│           └── aiAgent.ts         # LLM-powered AI decision layer
├── prisma/schema.prisma
├── package.json
└── README.md
```

## How It Works

### 1. Subscribe & Connect
Pick a plan, sign in with Google (or demo credentials), connect your broker via API. Paper trading available from day 1 — no broker needed.

### 2. Agent Learns Your Edge
BekiBuffet runs backtests, discovers edges via walk-forward optimization, and tunes parameters per asset personality.

### 3. Deploy & Monitor
Set risk limits. The agent runs autonomously — opening, scaling, and closing campaigns based on confluence + do-not-trade gates.

### 4. Continuous Improvement
Every closed trade feeds the self-learning module. Every 200 trades, weights tune. The AI agent generates strategic reviews.

## Confluence Scoring

Instead of hardcoding "buy when Tenkan crosses Kijun," BekiBuffet evaluates probability across 6 weighted factors:

| Factor | Max Score |
|--------|-----------|
| Trend Alignment | 25 |
| Cloud Confirmation | 20 |
| Higher Timeframe Bias | 20 |
| Price Action | 20 |
| Volatility Acceptable | 10 |
| Session Quality | 5 |
| **Total** | **100** |

Only trades above an asset-specific threshold (e.g., 90 for XAUUSD, 85 for EURUSD) are executed.

## Do-Not-Trade Engine

The system refuses entries when:

- The cloud is flat
- ATR is below a minimum threshold
- Major support/resistance are too close
- Higher timeframes disagree
- Price is extended far from equilibrium
- News volatility exceeds acceptable limits
- Correlated instruments already carry exposure
- Daily drawdown limits have been reached
- Consecutive loss limits have been reached

## Self-Learning Module

After every trade, the system records:
- Asset, session, setup, market regime, ATR
- Ichimoku state, price action pattern
- Entry score, exit reason, P/L
- Maximum favorable excursion (MFE)
- Maximum adverse excursion (MAE)

After every 200 trades:
- Recalculates win rates for each setup
- Increases weights for consistently profitable conditions
- Reduces weights for underperforming ones
- **Never alters the core strategy** — only adjusts confidence and thresholds within predefined limits [0.5×, 1.5×]

## AI Agent Decision Layer

The LLM-powered meta-decision layer synthesizes ALL market context into ONE structured decision:

```json
{
  "decision": "REJECT",
  "direction": null,
  "confidence": 0.75,
  "reasoning": "Despite an uptrend regime, the confluence score is critically low at 25/100...",
  "factors": [
    {"name": "Low Confluence Score", "influence": -0.8, "note": "25/100 well below 90 threshold"},
    {"name": "Bearish Ichimoku Cloud", "influence": -0.6, "note": "Cloud is bearish with negative slope"}
  ],
  "riskAdjustment": null,
  "insight": "High trend regime strength can create false positives when contradicted by bearish Ichimoku"
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/[...nextauth]` | NextAuth authentication |
| GET/POST | `/api/subscription` | Get/upgrade subscription |
| GET/POST/DELETE | `/api/broker` | List/connect/disconnect brokers |
| GET/POST | `/api/backtest` | List/run backtests |
| GET/POST | `/api/edge` | List/run edge discovery |
| GET/POST | `/api/agent` | Get/persist agent state |
| POST | `/api/ai-decision` | Generate AI agent decision |
| POST | `/api/seed` | Provision demo account |

## Development

```bash
# Run linting
bun run lint

# Push schema changes to Neon PostgreSQL
bun run db:push

# Generate Prisma client (auto-runs on build and install)
bun run db:generate

# Create and apply a migration (development)
bun run db:migrate

# Deploy migrations (production)
bun run db:deploy
```

### Database Setup (Neon PostgreSQL)

BekiBuffet uses **PostgreSQL via Neon** as the single source of truth for all environments. No SQLite is used anywhere.

**Creating a Neon database:**

1. Go to [https://console.neon.tech](https://console.neon.tech) and sign up / sign in
2. Create a new project (e.g., `bekibuffet`)
3. Copy the connection string from the dashboard — it looks like:
   ```
   postgresql://user:password@ep-cool-name-123456.us-east-2.aws.neon.tech/bekibuffet?sslmode=require
   ```
4. Set it as `DATABASE_URL` in your `.env` (local) and in Vercel environment variables (production)
5. Run `bun run db:push` to create all tables
6. The build process automatically runs `prisma generate` before `next build` via the `postinstall` and `build` scripts

**Vercel deployment:**

1. Push your code to GitHub
2. Import the repository in Vercel
3. Add environment variables in Vercel project settings:
   - `DATABASE_URL` — your Neon PostgreSQL connection string
   - `NEXTAUTH_URL` — your production URL (e.g., `https://your-app.vercel.app`)
   - `NEXTAUTH_SECRET` — a secure random string
   - `GOOGLE_CLIENT_ID` — from Google Cloud Console
   - `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
4. Deploy — Vercel runs `bun run build` which executes `prisma generate && next build`
5. After the first deploy, run `bun run db:push` locally (with the production `DATABASE_URL`) to initialize the Neon schema

## Production Deployment

### Environment Variables

```env
DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/bekibuffet?sslmode=require
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-production-secret-key
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
DEMO_PASSWORD=bekibuffet
```

> **Note:** The `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` flag is no longer needed — the "Continue with Google" button auto-shows when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set. The app calls `/api/auth/config` on load to detect this.

### Google OAuth Setup

Google OAuth is fully integrated and auto-detected. When configured, users see a "Continue with Google" button on the sign-in page.

**Setup steps:**

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services** → **OAuth consent screen**
   - Choose **External** user type
   - Fill in app name (`BekiBuffet`), support email, developer contact
   - Add scopes: `email`, `profile`, `openid`
   - Add your domain to authorized domains
4. Navigate to **APIs & Services** → **Credentials**
5. Click **Create Credentials** → **OAuth 2.0 Client ID**
6. Set Application Type to **Web application**
7. Add **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://your-domain.com/api/auth/callback/google` (production)
8. Copy the **Client ID** and **Client Secret** to your `.env` file:
   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```
9. Restart the dev server — the "Continue with Google" button will automatically appear on the sign-in page

**How it works:**
- When a user clicks "Continue with Google", they're redirected to Google's consent screen
- After consent, Google redirects back to `/api/auth/callback/google`
- NextAuth's Prisma adapter creates a `User` record (if new) and an `Account` record linking the Google identity
- The `signIn` callback auto-provisions a 14-day Pro trial subscription
- The `jwt` callback attaches subscription tier data to the session token
- If a user signs in with Google using an email that matches an existing demo account, the accounts are automatically linked (via `allowDangerousEmailAccountLinking`)

**Without Google OAuth configured**, the app falls back to demo credentials login (`demo@bekibuffet.ai` / `bekibuffet`), which is auto-provisioned on first visit.

### Stripe Integration (Optional)

To collect real payments, integrate Stripe in `/api/subscription`:
1. Set `STRIPE_SECRET_KEY` env var
2. Replace the simulated upgrade logic with Stripe Checkout Sessions
3. Add webhook handler at `/api/stripe/webhook` for subscription events

## Risk Disclaimer

**This software is for educational and research purposes only.** Trading financial instruments involves substantial risk of loss. Past performance is not indicative of future results. Never trade with money you cannot afford to lose. The authors and contributors are not responsible for any financial losses incurred through the use of this software.

## License

Proprietary. All rights reserved. See [LICENSE](LICENSE) for details.

## Contributing

This is a proprietary project. External contributions are not currently accepted. For inquiries, contact the maintainers.

---

**BekiBuffet** — Autonomous Trading Intelligence · Not financial advice. Trading involves risk.

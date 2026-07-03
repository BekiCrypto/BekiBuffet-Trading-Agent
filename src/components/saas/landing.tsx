"use client";

import { useSaaS } from "./saas-provider";
import { TIERS } from "@/lib/saas";
import { useState } from "react";

export function Landing() {
  const { setView, hasGoogleOAuth, authConfigLoaded, provisionDemo } = useSaaS();
  const [annual, setAnnual] = useState(true);

  const handleStart = async () => {
    // Only provision demo account if Google OAuth is NOT configured
    if (authConfigLoaded && !hasGoogleOAuth) {
      await provisionDemo();
    }
    setView("signin");
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bb-bg)", color: "var(--bb-text)" }}>
      {/* Nav */}
      <nav className="border-b border-[var(--bb-border)] sticky top-0 z-50" style={{ background: "rgba(10, 14, 20, 0.85)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-sm" style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}>B</div>
            <span className="text-base font-bold tracking-tight">BekiBuffet</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bb-panel-2)] text-[var(--bb-muted)] hidden sm:inline">SaaS</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setView("signin")} className="text-sm text-[var(--bb-muted)] hover:text-[var(--bb-text)] px-3 py-1.5">
              Sign in
            </button>
            <button onClick={handleStart} className="text-sm font-bold px-4 py-1.5 rounded-md transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}>
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bb-grid">
        <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 30% 30%, rgba(88, 166, 255, 0.15), transparent 50%), radial-gradient(circle at 70% 60%, rgba(188, 140, 255, 0.12), transparent 50%)" }} />
        <div className="relative max-w-7xl mx-auto px-4 md:px-6 py-16 md:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6" style={{ background: "rgba(88, 166, 255, 0.1)", border: "1px solid rgba(88, 166, 255, 0.3)" }}>
              <span className="w-2 h-2 rounded-full bg-[var(--bb-green)] bb-pulse" />
              <span className="text-xs text-[var(--bb-blue)] font-medium">Autonomous AI Trading Agent · Live Now</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-[1.05]">
              The trading agent that
              <br />
              <span style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                never sleeps, never wavers,
              </span>
              <br />
              and keeps learning.
            </h1>
            <p className="text-base md:text-lg text-[var(--bb-muted)] mb-8 max-w-2xl leading-relaxed">
              BekiBuffet is a journal-trained autonomous AI trading system. It analyzes 5 assets across 4 timeframes,
              scores confluence in real time, builds campaign positions, refuses bad trades, and continuously
              optimizes its edge — all without human intervention. Connect your broker. Subscribe. Walk away.
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleStart} className="text-base font-bold px-6 py-3 rounded-md transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}>
                Start 14-Day Free Trial
              </button>
              <button onClick={() => setView("terminal")} className="text-base font-medium px-6 py-3 rounded-md transition-all hover:bg-[var(--bb-panel-2)]" style={{ border: "1px solid var(--bb-border)", color: "var(--bb-text)" }}>
                See Live Demo →
              </button>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-xs text-[var(--bb-muted)]">
              <div className="flex items-center gap-2"><CheckIcon /> No credit card required</div>
              <div className="flex items-center gap-2"><CheckIcon /> Paper trading on day 1</div>
              <div className="flex items-center gap-2"><CheckIcon /> Cancel anytime</div>
              <div className="flex items-center gap-2"><CheckIcon /> SOC 2 type II in progress</div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-[var(--bb-border)]" style={{ background: "var(--bb-panel)" }}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          <StatBlock value="5" label="Tradeable assets" sub="XAUUSD · EURUSD · GBPUSD · EURJPY · BTCUSD" />
          <StatBlock value="4" label="Timeframes analyzed" sub="H4 → H1 → M15 → M5 multi-TF confluence" />
          <StatBlock value="9" label="Do-Not-Trade rules" sub="Stops bad trades before they happen" />
          <StatBlock value="200" label="Trade learning cycle" sub="Self-tunes weights every 200 trades" />
        </div>
      </section>

      {/* Architecture */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-16">
        <div className="text-center mb-12">
          <div className="text-xs uppercase tracking-wider text-[var(--bb-blue)] mb-2">The Architecture</div>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">A complete trading decision engine</h2>
          <p className="text-[var(--bb-muted)] max-w-2xl mx-auto">Not an indicator robot. Not a black box. A transparent, modular AI agent where every decision is auditable.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ARCHITECTURE.map((m) => (
            <div key={m.name} className="bb-panel p-5 hover:border-[var(--bb-blue)] transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-md flex items-center justify-center text-base font-bold" style={{ background: m.color + "20", color: m.color, border: `1px solid ${m.color}40` }}>
                  {m.icon}
                </div>
                <div>
                  <div className="text-sm font-bold">{m.name}</div>
                  <div className="text-[10px] text-[var(--bb-muted)] uppercase tracking-wider">{m.tag}</div>
                </div>
              </div>
              <p className="text-xs text-[var(--bb-muted)] leading-relaxed mb-3">{m.desc}</p>
              <div className="flex flex-wrap gap-1">
                {m.features.map((f) => (
                  <span key={f} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--bb-panel-2)", color: "var(--bb-muted)", border: "1px solid var(--bb-border)" }}>{f}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-[var(--bb-border)]" style={{ background: "var(--bb-panel)" }}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-16">
          <div className="text-center mb-12">
            <div className="text-xs uppercase tracking-wider text-[var(--bb-blue)] mb-2">How It Works</div>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">From journal to live trading in 4 steps</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {STEPS.map((s, i) => (
              <div key={i} className="relative">
                <div className="text-5xl font-bold mb-2" style={{ color: "var(--bb-border)" }}>0{i + 1}</div>
                <div className="text-base font-bold mb-2">{s.title}</div>
                <div className="text-xs text-[var(--bb-muted)] leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-7xl mx-auto px-4 md:px-6 py-16">
        <div className="text-center mb-10">
          <div className="text-xs uppercase tracking-wider text-[var(--bb-blue)] mb-2">Pricing</div>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Pay for the edge, not the hype</h2>
          <div className="inline-flex items-center gap-1 p-1 rounded-md" style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)" }}>
            <button onClick={() => setAnnual(false)} className={`text-xs px-3 py-1 rounded ${!annual ? "bg-[var(--bb-panel)] text-[var(--bb-text)]" : "text-[var(--bb-muted)]"}`}>Monthly</button>
            <button onClick={() => setAnnual(true)} className={`text-xs px-3 py-1 rounded ${annual ? "bg-[var(--bb-panel)] text-[var(--bb-text)]" : "text-[var(--bb-muted)]"}`}>Annual (save 20%)</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((t) => {
            const price = annual ? Math.round(t.price * 0.8) : t.price;
            return (
              <div key={t.id} className="bb-panel p-5 flex flex-col" style={t.highlight ? { borderColor: "var(--bb-blue)", boxShadow: "0 0 0 1px var(--bb-blue), 0 8px 24px -8px rgba(88, 166, 255, 0.4)" } : {}}>
                {t.highlight && (
                  <div className="text-[10px] uppercase tracking-wider text-[var(--bb-blue)] font-bold mb-1">Most Popular</div>
                )}
                <div className="text-sm text-[var(--bb-muted)] mb-1">{t.name}</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-bold">${price}</span>
                  <span className="text-xs text-[var(--bb-muted)]">/mo</span>
                </div>
                <div className="text-xs text-[var(--bb-muted)] mb-4">{t.tagline}</div>
                <button onClick={handleStart} className="w-full text-xs font-bold py-2 rounded-md mb-4 transition-all hover:opacity-90" style={t.highlight ? { background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" } : { background: "var(--bb-panel-2)", color: "var(--bb-text)", border: "1px solid var(--bb-border)" }}>
                  {t.cta}
                </button>
                <div className="space-y-1.5 flex-1">
                  {t.features.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-[11px]">
                      <CheckIcon /> <span className="text-[var(--bb-text)]">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-16">
        <div className="bb-panel p-8 md:p-12 text-center" style={{ background: "linear-gradient(135deg, rgba(88, 166, 255, 0.08), rgba(188, 140, 255, 0.08))", borderColor: "rgba(88, 166, 255, 0.3)" }}>
          <h2 className="text-2xl md:text-3xl font-bold mb-3">Stop babysitting charts.</h2>
          <p className="text-[var(--bb-muted)] mb-6 max-w-xl mx-auto">Let BekiBuffet do the work. Start with a 14-day Pro trial — no credit card, no commitment, full feature access.</p>
          <button onClick={handleStart} className="text-base font-bold px-6 py-3 rounded-md transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}>
            Start Free Trial
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--bb-border)]" style={{ background: "var(--bb-panel)" }}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[var(--bb-muted)]">
            © 2026 BekiBuffet · Autonomous Trading Intelligence · Not financial advice. Trading involves risk.
          </div>
          <div className="text-xs text-[var(--bb-muted)]">
            <button onClick={() => setView("terminal")} className="hover:text-[var(--bb-text)] mr-3">Demo</button>
            <button onClick={() => setView("signin")} className="hover:text-[var(--bb-text)]">Sign in</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatBlock({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div>
      <div className="text-3xl md:text-4xl font-bold bb-mono" style={{ color: "var(--bb-blue)" }}>{value}</div>
      <div className="text-sm font-bold mt-1">{label}</div>
      <div className="text-[10px] text-[var(--bb-muted)] mt-1">{sub}</div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3 h-3 flex-shrink-0 mt-0.5" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-6" stroke="var(--bb-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ARCHITECTURE = [
  {
    name: "Market Structure Engine",
    tag: "Module 1",
    icon: "◢",
    color: "#58a6ff",
    desc: "Pure price-action detection of trend, pullback, compression, breakout, reversal, and range across every timeframe. No indicators. Everything starts here.",
    features: ["BoS", "CHoCH", "Liquidity sweeps", "Swing structure"],
  },
  {
    name: "Ichimoku Intelligence",
    tag: "Module 2",
    icon: "☁",
    color: "#bc8cff",
    desc: "Not crossovers. Cloud thickness, slope, distance, future cloud, Chikou clearance, and Tenkan/Kijun angles — each contributing to a composite directional score.",
    features: ["Cloud slope", "Future cloud", "Chikou clearance", "Angle analysis"],
  },
  {
    name: "Price Action Intelligence",
    tag: "Module 3",
    icon: "▮",
    color: "#3fb950",
    desc: "11 candlestick patterns each with historical win rates — engulfing, pin bar, inside/outside, BoS, liquidity sweep, momentum, rejection, break-and-retest.",
    features: ["Engulfing", "Pin bars", "Momentum", "Liquidity grabs"],
  },
  {
    name: "Risk Commander",
    tag: "Module 4",
    icon: "⚠",
    color: "#d29922",
    desc: "Auto position sizing, ATR stops, daily DD limits, max exposure, consecutive loss ladder, break-even, partial closes, trailing. You never enter lot sizes.",
    features: ["ATR stops", "DD limits", "Consec protection", "Auto BE + trail"],
  },
  {
    name: "Campaign Manager",
    tag: "Module 5",
    icon: "▤",
    color: "#f85149",
    desc: "Manages campaigns, not trades. Scale into trends up to 3 entries (2 for BTC), move all stops together, protect equity, close the whole campaign as one.",
    features: ["Scale-in", "Aggregate stop", "Campaign close", "MFE/MAE tracking"],
  },
  {
    name: "Do-Not-Trade Engine",
    tag: "The Edge",
    icon: "✕",
    color: "#f85149",
    desc: "9 refusal rules that protect you from yourself: flat cloud, low ATR, S/R too close, HTF disagreement, price extension, news, correlation, DD, consecutive losses.",
    features: ["Flat cloud", "News filter", "Correlation", "DD protection"],
  },
  {
    name: "Confluence Scoring",
    tag: "Decision",
    icon: "◎",
    color: "#58a6ff",
    desc: "6 weighted factors (Trend 25 + Cloud 20 + HTF 20 + PA 20 + Vol 10 + Session 5 = 100). Trades only above asset-specific thresholds.",
    features: ["0-100 score", "Per-asset threshold", "Weighted factors", "Auditable"],
  },
  {
    name: "Self-Learning Module",
    tag: "Adaptive",
    icon: "↻",
    color: "#3fb950",
    desc: "Records every trade detail. After every 200 trades, tunes weights within [0.5×, 1.5×]. Never alters core strategy — only adjusts confidence.",
    features: ["Trade journal", "Weight tuning", "Walk-forward", "Auditable changes"],
  },
  {
    name: "AI Agent Decision Layer",
    tag: "Meta",
    icon: "✦",
    color: "#bc8cff",
    desc: "LLM-powered meta-decisioning on top of the rule engine. Synthesizes context, identifies regime shifts, proposes risk adjustments, generates insights.",
    features: ["LLM synthesis", "Pattern recognition", "Risk tuning", "Insight generation"],
  },
];

const STEPS = [
  { title: "Subscribe & connect", desc: "Pick a plan, sign in with Google, connect your broker via API. Paper trading available from day 1 — no broker needed." },
  { title: "Agent learns your edge", desc: "BekiBuffet runs backtests, discovers edges via walk-forward optimization, and tunes parameters per asset personality." },
  { title: "Deploy & monitor", desc: "Set risk limits. The agent runs autonomously — opening, scaling, and closing campaigns based on confluence + do-not-trade gates." },
  { title: "Continuous improvement", desc: "Every closed trade feeds the self-learning module. Every 200 trades, weights tune. The AI agent generates strategic reviews." },
];

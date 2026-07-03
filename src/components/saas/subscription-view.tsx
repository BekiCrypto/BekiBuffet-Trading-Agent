"use client";

import { useSaaS } from "./saas-provider";
import { useSession } from "next-auth/react";
import { TIERS, type Tier } from "@/lib/saas";
import { useState, useEffect } from "react";

export function Subscription() {
  const { setView } = useSaaS();
  const { data: session, update } = useSession();
  const [annual, setAnnual] = useState(true);
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => fetch("/api/subscription").then(r => r.json()).then(d => setSub(d.subscription));
  useEffect(() => { load(); }, []);

  const currentTier = (session?.user as any)?.tier ?? sub?.tier ?? "FREE";

  const upgrade = async (tier: Tier) => {
    setLoading(tier);
    setError(null);
    try {
      const r = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await r.json();
      if (data.error) {
        setError(data.error);
      } else {
        await update();
        load();
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(null);
  };

  const cancel = async () => {
    setLoading("cancel");
    try {
      // Downgrade to FREE
      const r = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "FREE" }),
      });
      await r.json();
      await update();
      load();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(null);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-0.5">Subscription</h1>
        <p className="text-sm text-[var(--bb-muted)]">Manage your BekiBuffet plan. Cancel anytime. Pro-rated refunds within 14 days.</p>
      </div>

      {/* Current plan */}
      <div className="bb-panel p-4 mb-6" style={{ background: "linear-gradient(135deg, rgba(88, 166, 255, 0.08), rgba(188, 140, 255, 0.08))", borderColor: "rgba(88, 166, 255, 0.3)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--bb-muted)] mb-1">Current Plan</div>
            <div className="text-2xl font-bold mb-0.5">{TIERS.find(t => t.id === currentTier)?.name ?? currentTier}</div>
            <div className="text-xs text-[var(--bb-muted)]">
              {sub?.status === "TRIALING" ? `Trial — ${sub.trialEndsAt ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0} days left` : sub?.status === "ACTIVE" ? `Active — renews ${sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : "monthly"}` : sub?.status ?? "—"}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><div className="text-[9px] text-[var(--bb-muted)] uppercase">Brokers</div><div className="bb-mono font-bold">{sub?.seats ?? 1}</div></div>
            <div><div className="text-[9px] text-[var(--bb-muted)] uppercase">Max Capital</div><div className="bb-mono font-bold">${(sub?.maxCapitalUsd ?? 10000).toLocaleString()}</div></div>
            <div><div className="text-[9px] text-[var(--bb-muted)] uppercase">Backtest Credits</div><div className="bb-mono font-bold">{sub?.backtestCredits ?? 0}</div></div>
          </div>
        </div>
        {currentTier !== "FREE" && (
          <button onClick={cancel} disabled={loading === "cancel"} className="mt-3 text-xs text-[var(--bb-muted)] hover:text-[var(--bb-red)]">
            {loading === "cancel" ? "Canceling..." : "Cancel subscription →"}
          </button>
        )}
      </div>

      {error && <div className="bb-panel p-3 mb-4 text-xs text-[var(--bb-red)]" style={{ background: "rgba(248, 81, 73, 0.1)" }}>{error}</div>}

      {/* Billing toggle */}
      <div className="flex items-center justify-center mb-6">
        <div className="inline-flex items-center gap-1 p-1 rounded-md" style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)" }}>
          <button onClick={() => setAnnual(false)} className={`text-xs px-3 py-1 rounded ${!annual ? "bg-[var(--bb-panel)] text-[var(--bb-text)]" : "text-[var(--bb-muted)]"}`}>Monthly</button>
          <button onClick={() => setAnnual(true)} className={`text-xs px-3 py-1 rounded ${annual ? "bg-[var(--bb-panel)] text-[var(--bb-text)]" : "text-[var(--bb-muted)]"}`}>Annual (save 20%)</button>
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {TIERS.map(t => {
          const price = annual ? Math.round(t.price * 0.8) : t.price;
          const isCurrent = t.id === currentTier;
          const isDowngrade = TIERS.findIndex(x => x.id === t.id) < TIERS.findIndex(x => x.id === currentTier);
          return (
            <div key={t.id} className="bb-panel p-5 flex flex-col" style={t.highlight && !isCurrent ? { borderColor: "var(--bb-blue)", boxShadow: "0 0 0 1px var(--bb-blue), 0 8px 24px -8px rgba(88, 166, 255, 0.4)" } : {}}>
              {t.highlight && !isCurrent && <div className="text-[10px] uppercase tracking-wider text-[var(--bb-blue)] font-bold mb-1">Most Popular</div>}
              <div className="text-sm text-[var(--bb-muted)] mb-1">{t.name}</div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-bold">${price}</span>
                <span className="text-xs text-[var(--bb-muted)]">/mo</span>
              </div>
              <div className="text-xs text-[var(--bb-muted)] mb-4">{t.tagline}</div>
              <button
                onClick={() => upgrade(t.id)}
                disabled={isCurrent || loading !== null}
                className="w-full text-xs font-bold py-2 rounded-md mb-4 transition-all hover:opacity-90 disabled:opacity-50"
                style={isCurrent
                  ? { background: "rgba(63, 185, 80, 0.15)", color: "var(--bb-green)", border: "1px solid var(--bb-green)" }
                  : t.highlight
                  ? { background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }
                  : { background: "var(--bb-panel-2)", color: "var(--bb-text)", border: "1px solid var(--bb-border)" }}
              >
                {isCurrent ? "✓ Current Plan" : loading === t.id ? "Processing..." : isDowngrade ? "Downgrade" : t.cta}
              </button>
              <div className="space-y-1.5 flex-1">
                {t.features.map(f => (
                  <div key={f} className="flex items-start gap-2 text-[11px]">
                    <svg className="w-3 h-3 flex-shrink-0 mt-0.5" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-6" stroke="var(--bb-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span className="text-[var(--bb-text)]">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center mt-6 text-xs text-[var(--bb-muted)]">
        <button onClick={() => setView("dashboard")} className="hover:text-[var(--bb-text)]">← Back to dashboard</button>
      </div>
    </div>
  );
}

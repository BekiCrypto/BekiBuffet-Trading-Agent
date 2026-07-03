"use client";

import { useSaaS } from "./saas-provider";
import { BROKER_ADAPTERS, type BrokerType } from "@/lib/saas";
import { useEffect, useState } from "react";

export function Brokers() {
  const { setView } = useSaaS();
  const [brokers, setBrokers] = useState<any[]>([]);
  const [selectedType, setSelectedType] = useState<BrokerType>("DEMO");
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBrokers = () => fetch("/api/broker").then(r => r.json()).then(d => setBrokers(d.brokers ?? []));
  useEffect(() => { loadBrokers(); }, []);

  const adapter = BROKER_ADAPTERS.find(b => b.type === selectedType)!;

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    const body: any = { brokerType: selectedType };
    for (const f of adapter.requiredFields) {
      body[f.key] = form[f.key] ?? "";
    }
    if (selectedType === "DEMO") {
      body.initialCapital = Number(body.accountId) || 100000;
      body.accountId = "PAPER-" + Date.now();
    }
    const r = await fetch("/api/broker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json();
    setLoading(false);
    if (data.error) {
      setError(data.error);
    } else {
      setForm({});
      loadBrokers();
    }
  };

  const handleDisconnect = async (id: string) => {
    await fetch(`/api/broker?id=${id}`, { method: "DELETE" });
    loadBrokers();
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-0.5">Broker Connections</h1>
          <p className="text-sm text-[var(--bb-muted)]">Connect your trading accounts. BekiBuffet supports MT5, OANDA, Binance, IB, and paper trading.</p>
        </div>
      </div>

      {/* Connected brokers */}
      <div className="bb-panel p-4 mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Connected Accounts ({brokers.length})</h3>
        {brokers.length === 0 ? (
          <div className="text-center py-8 text-[var(--bb-muted)] text-sm">No broker accounts connected yet. Use the form below to connect your first.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {brokers.map((b) => {
              const adapter = BROKER_ADAPTERS.find(a => a.type === b.brokerType);
              return (
                <div key={b.id} className="bb-panel-2 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold" style={{ background: `${adapter?.logoColor}20`, color: adapter?.logoColor, border: `1px solid ${adapter?.logoColor}40` }}>
                        {adapter?.type[0] ?? "B"}
                      </div>
                      <div>
                        <div className="text-sm font-bold">{b.accountName}</div>
                        <div className="text-[10px] text-[var(--bb-muted)]">{adapter?.displayName} · {b.accountId}</div>
                      </div>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: b.isConnected ? "rgba(63, 185, 80, 0.15)" : "rgba(125, 133, 144, 0.1)", color: b.isConnected ? "var(--bb-green)" : "var(--bb-muted)" }}>
                      {b.isConnected ? "● CONNECTED" : "○ OFFLINE"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div>
                      <div className="text-[9px] text-[var(--bb-muted)] uppercase">Balance</div>
                      <div className="bb-mono font-bold">${b.balance.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[var(--bb-muted)] uppercase">Equity</div>
                      <div className="bb-mono font-bold" style={{ color: b.equity >= b.balance ? "var(--bb-green)" : "var(--bb-red)" }}>${b.equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-[var(--bb-muted)] mb-3">
                    Last sync: {b.lastSyncAt ? new Date(b.lastSyncAt).toLocaleString() : "Never"}
                  </div>
                  <button onClick={() => handleDisconnect(b.id)} className="w-full text-xs py-1.5 rounded text-[var(--bb-red)] hover:bg-[var(--bb-red-dim)] transition-colors" style={{ border: "1px solid var(--bb-border)" }}>
                    Disconnect
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Connect new broker */}
      <div className="bb-panel p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Connect New Account</h3>

        {/* Broker type selector */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          {BROKER_ADAPTERS.map((b) => (
            <button
              key={b.type}
              onClick={() => { setSelectedType(b.type); setForm({}); }}
              className="p-3 rounded-md text-left transition-all"
              style={{
                background: selectedType === b.type ? `${b.logoColor}10` : "var(--bb-panel-2)",
                border: selectedType === b.type ? `1px solid ${b.logoColor}` : "1px solid var(--bb-border)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold" style={{ background: `${b.logoColor}20`, color: b.logoColor }}>{b.type[0]}</div>
                <div className="text-xs font-bold">{b.displayName}</div>
              </div>
              <div className="text-[9px] text-[var(--bb-muted)] leading-tight">{b.supportedAssets.length} assets</div>
            </button>
          ))}
        </div>

        {/* Adapter description */}
        <div className="mb-4 p-3 rounded-md" style={{ background: "var(--bb-panel-2)" }}>
          <div className="text-xs text-[var(--bb-text)] mb-1">{adapter.description}</div>
          <div className="flex flex-wrap gap-1 mt-2">
            {adapter.features.map(f => (
              <span key={f} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--bb-panel)", color: "var(--bb-muted)", border: "1px solid var(--bb-border)" }}>{f}</span>
            ))}
          </div>
        </div>

        {/* Dynamic form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {adapter.requiredFields.map(f => (
            <div key={f.key}>
              <label className="text-xs text-[var(--bb-muted)] block mb-1">{f.label}{f.required && " *"}</label>
              <input
                type={f.type}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                required={f.required}
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)" }}
              />
            </div>
          ))}
        </div>

        {error && <div className="text-xs text-[var(--bb-red)] p-2 rounded mb-3" style={{ background: "rgba(248, 81, 73, 0.1)" }}>{error}</div>}

        <button
          onClick={handleConnect}
          disabled={loading}
          className="text-sm font-bold px-4 py-2 rounded-md transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}
        >
          {loading ? "Connecting..." : `Connect ${adapter.displayName}`}
        </button>
      </div>

      <div className="text-center mt-6 text-xs text-[var(--bb-muted)]">
        <button onClick={() => setView("dashboard")} className="hover:text-[var(--bb-text)]">← Back to dashboard</button>
      </div>
    </div>
  );
}

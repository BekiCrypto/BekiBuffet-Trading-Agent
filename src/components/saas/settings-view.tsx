"use client";

import { useSaaS } from "./saas-provider";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

export function Settings() {
  const { setView } = useSaaS();
  const { data: session } = useSession();
  const [activity, setActivity] = useState<any[]>([]);

  useEffect(() => {
    // Use the agent endpoint to fetch activity log
    fetch("/api/agent?log=1").then(r => r.json()).then(d => setActivity(d.activity ?? []));
  }, []);

  const tier = (session?.user as any)?.tier ?? "FREE";

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-0.5">Settings</h1>
        <p className="text-sm text-[var(--bb-muted)]">Manage your account, security, and notification preferences.</p>
      </div>

      {/* Profile */}
      <div className="bb-panel p-4 mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Profile</h3>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold" style={{ background: "var(--bb-panel-2)", border: "2px solid var(--bb-border)" }}>
            {session?.user?.name?.[0]?.toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div>
            <div className="text-lg font-bold">{session?.user?.name ?? "Trader"}</div>
            <div className="text-sm text-[var(--bb-muted)]">{session?.user?.email}</div>
            <div className="text-xs text-[var(--bb-muted)] mt-1">
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(88, 166, 255, 0.15)", color: "var(--bb-blue)" }}>{tier} TIER</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notification preferences */}
      <div className="bb-panel p-4 mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Notifications</h3>
        <div className="space-y-3">
          <Toggle label="Trade opens" desc="Notify when agent opens a new campaign" defaultOn />
          <Toggle label="Trade closes" desc="Notify when a position or campaign closes" defaultOn />
          <Toggle label="Daily loss limit warnings" desc="Notify when daily drawdown approaches limit" defaultOn />
          <Toggle label="Edge discovery alerts" desc="Notify when a new edge is discovered and validated" defaultOn />
          <Toggle label="AI strategy reviews" desc="Weekly AI-generated strategy review" />
          <Toggle label="Marketing emails" desc="Product updates, new features, and tips" />
        </div>
      </div>

      {/* Security */}
      <div className="bb-panel p-4 mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Security</h3>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-2 border-b border-[var(--bb-border)]">
            <div>
              <div className="font-bold">Two-factor authentication</div>
              <div className="text-[10px] text-[var(--bb-muted)]">Add an extra layer of security via TOTP</div>
            </div>
            <button className="text-xs px-3 py-1.5 rounded" style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)" }}>Enable</button>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-[var(--bb-border)]">
            <div>
              <div className="font-bold">API key access</div>
              <div className="text-[10px] text-[var(--bb-muted)]">Programmatic access to BekiBuffet API</div>
            </div>
            <button className="text-xs px-3 py-1.5 rounded" style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)" }}>Generate</button>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-bold">Active sessions</div>
              <div className="text-[10px] text-[var(--bb-muted)]">View and revoke active sessions</div>
            </div>
            <button className="text-xs px-3 py-1.5 rounded" style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)" }}>View</button>
          </div>
        </div>
      </div>

      {/* Activity log */}
      <div className="bb-panel p-4 mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Recent Activity</h3>
        {activity.length === 0 ? (
          <div className="text-center py-6 text-xs text-[var(--bb-muted)]">No activity recorded yet.</div>
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto bb-scroll">
            {activity.slice(0, 20).map((a: any) => (
              <div key={a.id} className="flex items-start gap-2 py-1.5 border-b border-[var(--bb-border)] last:border-0 text-xs">
                <span className="text-[9px] bb-mono text-[var(--bb-muted)] w-32 flex-shrink-0">{new Date(a.createdAt).toLocaleString()}</span>
                <span className="text-[9px] px-1.5 rounded font-bold" style={{ background: "var(--bb-panel-2)", color: "var(--bb-muted)" }}>{a.type}</span>
                <span className="text-[var(--bb-text)] flex-1">{a.action}: {a.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="bb-panel p-4" style={{ borderColor: "rgba(248, 81, 73, 0.3)" }}>
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-red)] mb-3">Danger Zone</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">Delete account</div>
            <div className="text-xs text-[var(--bb-muted)]">Permanently delete your account and all associated data</div>
          </div>
          <button className="text-xs px-3 py-1.5 rounded text-[var(--bb-red)]" style={{ border: "1px solid var(--bb-red)" }}>Delete</button>
        </div>
      </div>

      <div className="text-center mt-6 text-xs text-[var(--bb-muted)]">
        <button onClick={() => setView("dashboard")} className="hover:text-[var(--bb-text)]">← Back to dashboard</button>
      </div>
    </div>
  );
}

function Toggle({ label, desc, defaultOn = false }: { label: string; desc: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--bb-border)] last:border-0">
      <div>
        <div className="text-sm font-bold">{label}</div>
        <div className="text-[10px] text-[var(--bb-muted)]">{desc}</div>
      </div>
      <button
        onClick={() => setOn(!on)}
        className="w-10 h-5 rounded-full relative transition-all"
        style={{ background: on ? "var(--bb-green)" : "var(--bb-border)" }}
      >
        <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: on ? "calc(100% - 18px)" : "2px" }} />
      </button>
    </div>
  );
}

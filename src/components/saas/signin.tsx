"use client";

import { useSaaS } from "./saas-provider";
import { signIn } from "next-auth/react";
import { useState, useEffect, useRef } from "react";

export function SignIn() {
  const { setView, hasGoogleOAuth, authConfigLoaded, provisionDemo } = useSaaS();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoCreds, setDemoCreds] = useState<{ email: string; password: string } | null>(null);
  const demoProvisionedRef = useRef(false);

  useEffect(() => {
    // Only provision demo account after auth config has loaded AND Google OAuth is not configured
    if (authConfigLoaded && !hasGoogleOAuth && !demoProvisionedRef.current) {
      demoProvisionedRef.current = true;
      provisionDemo().then(async () => {
        try {
          const r = await fetch("/api/seed", { method: "POST" });
          const data = await r.json();
          if (data.email) {
            setDemoCreds({ email: data.email, password: data.password });
            setEmail(data.email);
            setPassword(data.password);
          }
        } catch (e) {}
      });
    }
  }, [authConfigLoaded, hasGoogleOAuth, provisionDemo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid credentials. Try the demo account below.");
    } else if (res?.ok) {
      setView("dashboard");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--bb-bg)" }}>
      <div className="absolute inset-0 bb-grid opacity-50" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 30%, rgba(88, 166, 255, 0.15), transparent 50%)" }} />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <button onClick={() => setView("landing")} className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-md flex items-center justify-center font-bold text-base" style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}>B</div>
            <span className="text-lg font-bold">BekiBuffet</span>
          </button>
          <h1 className="text-2xl font-bold mb-1">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="text-sm text-[var(--bb-muted)]">{mode === "signin" ? "Sign in to your trading agent" : "Start your 14-day Pro trial"}</p>
        </div>

        <div className="bb-panel p-6">
          {authConfigLoaded && hasGoogleOAuth && (
            <>
              <button
                onClick={() => signIn("google", { callbackUrl: "/" })}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md mb-4 transition-all hover:opacity-90"
                style={{ background: "#fff", color: "#1f2937", border: "1px solid #d1d5db" }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="text-sm font-medium">Continue with Google</span>
              </button>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-[var(--bb-border)]" />
                <span className="text-[10px] text-[var(--bb-muted)] uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-[var(--bb-border)]" />
              </div>
            </>
          )}
          {authConfigLoaded && hasGoogleOAuth && (
            <div className="mb-4 text-[10px] text-[var(--bb-muted)] text-center">
              New here? Continue with Google to instantly create your account with a 14-day Pro trial.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="text-xs text-[var(--bb-muted)] block mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md text-sm"
                  style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)" }}
                  placeholder="Jane Trader"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-[var(--bb-muted)] block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)" }}
                placeholder="you@email.com"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--bb-muted)] block mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)" }}
                placeholder="••••••••"
              />
            </div>
            {error && <div className="text-xs text-[var(--bb-red)] p-2 rounded" style={{ background: "rgba(248, 81, 73, 0.1)" }}>{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}
            >
              {loading ? "Signing in..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          {demoCreds && (
            <div className="mt-4 p-3 rounded-md text-xs" style={{ background: "rgba(63, 185, 80, 0.08)", border: "1px solid rgba(63, 185, 80, 0.3)" }}>
              <div className="font-bold text-[var(--bb-green)] mb-1">Demo Account Ready</div>
              <div className="text-[var(--bb-muted)]">Email: <span className="bb-mono text-[var(--bb-text)]">{demoCreds.email}</span></div>
              <div className="text-[var(--bb-muted)]">Password: <span className="bb-mono text-[var(--bb-text)]">{demoCreds.password}</span></div>
              <div className="text-[10px] text-[var(--bb-muted)] mt-1">Just click Sign in — credentials are pre-filled.</div>
            </div>
          )}

          <div className="mt-4 text-center text-xs text-[var(--bb-muted)]">
            {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
              className="text-[var(--bb-blue)] hover:underline font-medium"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </div>
        </div>

        <div className="text-center mt-4 text-xs text-[var(--bb-muted)]">
          <button onClick={() => setView("landing")} className="hover:text-[var(--bb-text)]">← Back to home</button>
        </div>
      </div>
    </div>
  );
}

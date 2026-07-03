"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type SaaSView =
  | "landing"
  | "signin"
  | "dashboard"
  | "terminal"
  | "brokers"
  | "backtest"
  | "edge"
  | "ai-agent"
  | "subscription"
  | "settings"
  | "admin";

interface SaaSContextValue {
  view: SaaSView;
  setView: (v: SaaSView) => void;
  activeAsset: string;
  setActiveAsset: (a: string) => void;
  hasGoogleOAuth: boolean;
  authConfigLoaded: boolean;
  provisionDemo: () => Promise<void>;
}

const SaaSContext = createContext<SaaSContextValue | null>(null);

export function useSaaS() {
  const ctx = useContext(SaaSContext);
  if (!ctx) throw new Error("useSaaS must be used within SaaSProvider");
  return ctx;
}

function Inner({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [requestedView, setRequestedView] = useState<SaaSView>("landing");
  const [activeAsset, setActiveAsset] = useState<string>("XAUUSD");
  // Auto-detect Google OAuth from server config (replaces manual NEXT_PUBLIC flag)
  const [hasGoogleOAuth, setHasGoogleOAuth] = useState<boolean>(false);
  const [authConfigLoaded, setAuthConfigLoaded] = useState<boolean>(false);

  // Fetch auth config on mount — checks if Google creds are actually configured
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setHasGoogleOAuth(!!data.googleEnabled);
          setAuthConfigLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setAuthConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Derive actual view: if not authenticated, force landing/signin
  const isAuthenticated = status === "authenticated" && !!session?.user;
  const view: SaaSView = isAuthenticated
    ? (requestedView === "landing" || requestedView === "signin" ? "dashboard" : requestedView)
    : (requestedView === "signin" ? "signin" : "landing");

  const setView = (v: SaaSView) => {
    if (!isAuthenticated && v !== "landing" && v !== "signin") {
      setRequestedView("signin");
      return;
    }
    setRequestedView(v);
  };

  const provisionDemo = async () => {
    try {
      await fetch("/api/seed", { method: "POST" });
    } catch (e) {
      // ignore
    }
  };

  return (
    <SaaSContext.Provider
      value={{ view, setView, activeAsset, setActiveAsset, hasGoogleOAuth, authConfigLoaded, provisionDemo }}
    >
      {children}
    </SaaSContext.Provider>
  );
}

export function SaaSProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <Inner>{children}</Inner>
    </SessionProvider>
  );
}

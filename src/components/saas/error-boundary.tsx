"use client";

import React, { useEffect, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--bb-bg)", color: "var(--bb-text)" }}>
          <div className="max-w-md w-full">
            <div className="bb-panel p-6 text-center">
              <div className="text-4xl mb-3">⚠</div>
              <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
              <p className="text-sm text-[var(--bb-muted)] mb-4">
                The application encountered an unexpected error. Try reloading — your data is safe.
              </p>
              {this.state.error && (
                <details className="text-left text-xs mb-4 p-2 rounded" style={{ background: "var(--bb-panel-2)" }}>
                  <summary className="cursor-pointer text-[var(--bb-muted)]">Error details</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-[var(--bb-red)]">{this.state.error.message}</pre>
                </details>
              )}
              <button
                onClick={() => window.location.reload()}
                className="text-sm font-bold px-4 py-2 rounded-md transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Hooks-based error reporter for async errors
export function useErrorReporter() {
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      console.error("Unhandled error:", event.error);
    };
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
    };
    window.addEventListener("error", handler);
    window.addEventListener("unhandledrejection", rejectionHandler);
    return () => {
      window.removeEventListener("error", handler);
      window.removeEventListener("unhandledrejection", rejectionHandler);
    };
  }, []);
}

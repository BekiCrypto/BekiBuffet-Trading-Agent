import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BekiBuffet — Autonomous AI Trading Agent SaaS",
  description: "Journal-trained autonomous AI trading system. Subscribe, connect your broker, and let BekiBuffet trade for you — multi-timeframe analysis, Ichimoku intelligence, confluence scoring, campaign management, and self-learning. Backtesting, edge discovery, and LLM-powered meta-decisions.",
  keywords: ["BekiBuffet", "autonomous trading", "AI trading agent", "trading SaaS", "Ichimoku", "confluence scoring", "campaign management", "MetaTrader", "OANDA", "Binance"],
  authors: [{ name: "BekiBuffet" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "BekiBuffet — Autonomous AI Trading Agent SaaS",
    description: "Subscribe, connect your broker, let the AI agent trade for you. Backtesting, edge discovery, and continuous self-learning.",
    siteName: "BekiBuffet",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BekiBuffet — Autonomous AI Trading Agent",
    description: "Journal-trained autonomous trading decision engine",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: "var(--bb-bg)", color: "var(--bb-text)" }}
      >
        {children}
      </body>
    </html>
  );
}

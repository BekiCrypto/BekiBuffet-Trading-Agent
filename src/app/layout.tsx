import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BekiBuffet — Autonomous Trading Agent",
  description: "Journal-trained autonomous trading decision engine. Multi-timeframe analysis, Ichimoku intelligence, price action, confluence scoring, risk commander, campaign manager, and self-learning module.",
  keywords: ["BekiBuffet", "trading agent", "autonomous trading", "Ichimoku", "confluence scoring", "campaign management", "EA"],
  authors: [{ name: "BekiBuffet" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "BekiBuffet — Autonomous Trading Agent",
    description: "Journal-trained autonomous trading decision engine",
    siteName: "BekiBuffet",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BekiBuffet — Autonomous Trading Agent",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

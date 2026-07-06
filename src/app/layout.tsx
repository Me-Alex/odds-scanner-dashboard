import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Arb Desk — Real-Time Odds Scanner & Arbitrage Dashboard",
  description: "Professional sports betting odds scanner with arbitrage detection, value bets, AI picks, and bankroll management for Romanian and international bookmakers.",
  keywords: ["odds scanner", "arbitrage", "sports betting", "value bets", "Romanian bookmakers", "betting dashboard"],
  authors: [{ name: "Arb Desk" }],
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📊</text></svg>",
  },
  openGraph: {
    title: "Arb Desk — Odds Scanner Dashboard",
    description: "Real-time arbitrage detection and value betting tools for professional sports bettors.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: '#0d1117', color: '#e6edf3', fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}
      >
        {children}
        <Toaster theme="dark" position="top-right" />
      </body>
    </html>
  );
}
'use client';

import { motion } from 'framer-motion';
import { Radar, Scan, TrendingUp, Shield, Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface LandingPageProps {
  onLogin: () => void;
  onRegister: () => void;
}

const features = [
  {
    icon: Scan,
    title: 'Live Odds Scanner',
    description:
      'Compare odds across 15+ bookmakers in real-time. Never miss an arbitrage opportunity.',
  },
  {
    icon: TrendingUp,
    title: 'Arbitrage Detection',
    description:
      'Automatically detect surebets with calculated stakes and guaranteed profit margins.',
  },
  {
    icon: Shield,
    title: 'Value Bet Finder',
    description:
      'Identify odds that offer positive expected value using consensus probability analysis.',
  },
];

const stats = [
  { value: '15+', label: 'Bookmakers' },
  { value: '500+', label: 'Events Daily' },
  { value: '2.3%', label: 'Avg Arb Edge' },
  { value: '99.9%', label: 'Uptime' },
];

export default function LandingPage({ onLogin, onRegister }: LandingPageProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[#0d1117]">
      {/* ── Top Navigation ── */}
      <header className="sticky top-0 z-30 bg-[#0d1117]/95 backdrop-blur-sm border-b border-[#30363d]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <Radar className="w-5 h-5 text-emerald-400" />
            <span className="text-white font-bold text-lg">Arb Desk</span>
          </div>

          {/* Auth Buttons */}
          <div className="flex items-center gap-3">
            <Button
              onClick={onLogin}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Log In
            </Button>
            <Button
              variant="outline"
              onClick={onRegister}
              className="border-[#30363d] text-gray-300 hover:bg-[#161b22] hover:text-white"
            >
              Register
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <main className="flex-1 flex items-center justify-center py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge className="mb-6 bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 text-sm px-3 py-1">
              Real-Time Sports Betting Intelligence
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-white leading-tight"
          >
            Find Arbitrage Opportunities
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-2 text-emerald-400 text-2xl md:text-3xl font-semibold"
          >
            Before the Odds Move
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-6 text-gray-400 text-lg max-w-2xl mx-auto leading-relaxed"
          >
            Scan odds across multiple bookmakers in real-time. Detect arbitrage
            opportunities, value bets, and gain an edge with AI-powered
            analytics.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button
              size="lg"
              onClick={onLogin}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-base px-6 h-11"
            >
              <Zap className="w-4 h-4 mr-2" />
              Get Started — It&apos;s Free
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="border-[#30363d] text-gray-300 hover:bg-[#161b22] hover:text-white text-base px-6 h-11"
            >
              View Live Scanner
            </Button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-4 text-gray-600 text-sm"
          >
            No credit card required &middot; 50 free scans per day
          </motion.p>
        </div>
      </main>

      {/* ── Features Grid ── */}
      <section className="mt-20 pb-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 + i * 0.1 }}
                className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 hover:border-[#484f58] transition-colors"
              >
                <Icon className="w-8 h-8 text-emerald-400 mb-4" />
                <h3 className="text-white font-semibold text-lg mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="mt-16 pb-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.9 + i * 0.1 }}
              className="text-center"
            >
              <div className="text-white text-2xl font-bold">{stat.value}</div>
              <div className="text-gray-500 text-sm mt-1">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mt-auto shrink-0 border-t border-[#30363d] py-4 text-center text-xs text-gray-500">
        © 2025 Arb Desk. All rights reserved.
      </footer>
    </div>
  );
}
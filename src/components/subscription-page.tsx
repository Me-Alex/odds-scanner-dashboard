'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Check, X, Crown, Rocket, Building2, Zap, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/auth-store'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubscriptionPageProps {
  currentTier: string
  onBack: () => void
  onTierChange?: (newTier: string) => void
}

interface TierFeature {
  text: string
  included: boolean
}

interface PricingTier {
  id: string
  name: string
  price: string
  period?: string
  description: string
  icon: React.ReactNode
  features: TierFeature[]
  highlighted: boolean
  badge?: string
}

// ─── Data ────────────────────────────────────────────────────────────────────

const tiers: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    description: 'Get started with basic arbitrage tools',
    icon: <Zap className="h-6 w-6" />,
    features: [
      { text: '50 odds scans per day', included: true },
      { text: 'Basic arbitrage scanner', included: true },
      { text: '5 saved bets in journal', included: true },
      { text: 'Community support', included: true },
      { text: 'Advanced arbitrage scanner with alerts', included: false },
      { text: 'Unlimited journal entries', included: false },
      { text: 'Real-time WebSocket odds stream', included: false },
      { text: 'API access', included: false },
    ],
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$9.99',
    period: '/mo',
    description: 'For serious bettors who want an edge',
    icon: <Rocket className="h-6 w-6" />,
    features: [
      { text: 'Unlimited odds scans', included: true },
      { text: 'Advanced arbitrage scanner with alerts', included: true },
      { text: 'Unlimited journal entries', included: true },
      { text: 'Priority bookmaker updates', included: true },
      { text: 'Email notifications for high-edge arbs', included: true },
      { text: 'Calculator with all tools', included: true },
      { text: 'Real-time WebSocket odds stream', included: false },
      { text: 'API access', included: false },
    ],
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$29.99',
    period: '/mo',
    description: 'Full power for professionals and teams',
    icon: <Building2 className="h-6 w-6" />,
    features: [
      { text: 'Everything in Pro', included: true },
      { text: 'Real-time WebSocket odds stream', included: true },
      { text: 'API access', included: true },
      { text: 'Custom alerts & webhooks', included: true },
      { text: 'Bankroll management tools', included: true },
      { text: 'Dedicated support', included: true },
      { text: 'White-label reports', included: true },
      { text: 'Team collaboration features', included: true },
    ],
    highlighted: false,
  },
]

const tierOrder = ['free', 'pro', 'enterprise']

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubscriptionPage({ currentTier, onBack, onTierChange }: SubscriptionPageProps) {
  const { user, logout } = useAuthStore()
  const currentIndex = tierOrder.indexOf(currentTier.toLowerCase())

  const getButtonConfig = (tierId: string) => {
    if (tierId.toLowerCase() === currentTier.toLowerCase()) {
      return { label: 'Current Plan', disabled: true, variant: 'outline' as const }
    }
    const tierIndex = tierOrder.indexOf(tierId.toLowerCase())
    if (tierIndex > currentIndex) {
      return { label: 'Upgrade', disabled: false, variant: 'default' as const }
    }
    return { label: 'Downgrade', disabled: false, variant: 'outline' as const }
  }

  const handleCtaClick = async (tierId: string) => {
    if (tierId.toLowerCase() === currentTier.toLowerCase()) return

    try {
      const token = useAuthStore.getState().token
      const res = await fetch('/api/subscription/change-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tier: tierId.toLowerCase() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to change plan')
      }

      // Update auth store with new tier
      if (user) {
        const updatedUser = { ...user, subscriptionTier: tierId.toLowerCase() }
        useAuthStore.setState({ user: updatedUser })
        // Persist to localStorage for session caching
        if (typeof window !== 'undefined') {
          localStorage.setItem('arbdesk_user', JSON.stringify(updatedUser))
        }
      }

      // Notify parent
      onTierChange?.(tierId.toLowerCase())

      toast.success(`Plan changed to ${tierId}`, {
        description: 'Your subscription has been updated.',
        duration: 3000,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change plan')
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#0d1117] text-gray-300 overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0d1117]/95 backdrop-blur-sm border-b border-[#30363d]">
        <div className="flex items-center gap-4 px-4 sm:px-6 h-14">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-gray-400 hover:text-white hover:bg-[#161b22] shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-emerald-400" />
            <h1 className="text-lg font-semibold text-white">Subscription Plans</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center mb-8 sm:mb-12"
          >
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3">
              Choose Your Plan
            </h2>
            <p className="text-gray-400 text-sm sm:text-base max-w-2xl mx-auto">
              Unlock more features and gain a bigger edge. Upgrade anytime to access advanced
              arbitrage tools, real-time data, and premium support.
            </p>
            {currentTier && (
              <div className="mt-4 inline-flex items-center gap-2">
                <span className="text-sm text-gray-500">Current plan:</span>
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-xs uppercase tracking-wider font-medium px-2.5 py-0.5"
                >
                  {currentTier}
                </Badge>
              </div>
            )}
          </motion.div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {tiers.map((tier, index) => {
              const isCurrent = tier.id.toLowerCase() === currentTier.toLowerCase()
              const buttonConfig = getButtonConfig(tier.id)

              return (
                <motion.div
                  key={tier.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className="relative"
                >
                  {/* Badge for highlighted or current tier */}
                  {(tier.badge || isCurrent) && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <Badge
                        className={
                          isCurrent
                            ? 'bg-gray-500/20 text-gray-300 border border-[#30363d] text-[10px] uppercase tracking-widest font-semibold px-3 py-1'
                            : 'bg-emerald-500 text-white text-[10px] uppercase tracking-widest font-semibold px-3 py-1'
                        }
                      >
                        {isCurrent ? 'Current Plan' : tier.badge}
                      </Badge>
                    </div>
                  )}

                  <Card
                    className={`relative h-full flex flex-col transition-all duration-300 ${
                      tier.highlighted
                        ? 'border-emerald-500/60 bg-[#161b22] shadow-lg shadow-emerald-500/5 scale-[1.02] md:scale-105'
                        : 'border-[#30363d] bg-[#161b22] hover:border-[#484f58]'
                    }`}
                  >
                    <CardHeader className="pb-4 pt-6 px-5 sm:px-6">
                      {/* Icon + Name */}
                      <div className="flex items-center gap-3 mb-4">
                        <div
                          className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                            tier.highlighted
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-[#0d1117] text-gray-400 border border-[#30363d]'
                          }`}
                        >
                          {tier.icon}
                        </div>
                        <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
                      </div>

                      {/* Price */}
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl sm:text-4xl font-bold text-white">{tier.price}</span>
                        {tier.period && (
                          <span className="text-gray-500 text-sm font-medium">{tier.period}</span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-sm text-gray-400 mt-2">{tier.description}</p>
                    </CardHeader>

                    <CardContent className="flex flex-col flex-1 px-5 sm:px-6 pb-6 gap-6">
                      {/* Features */}
                      <ul className="space-y-3 flex-1">
                        {tier.features.map((feature) => (
                          <li key={feature.text} className="flex items-start gap-3">
                            {feature.included ? (
                              <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                            ) : (
                              <X className="h-4 w-4 text-gray-600 mt-0.5 shrink-0" />
                            )}
                            <span
                              className={`text-sm leading-snug ${
                                feature.included ? 'text-gray-300' : 'text-gray-600'
                              }`}
                            >
                              {feature.text}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {/* CTA Button */}
                      <Button
                        className={`w-full py-2.5 text-sm font-medium transition-all ${
                          isCurrent
                            ? 'bg-[#0d1117] border border-[#30363d] text-gray-500 cursor-not-allowed hover:bg-[#0d1117]'
                            : tier.highlighted
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                              : 'bg-[#0d1117] border border-[#30363d] text-gray-300 hover:bg-[#161b22] hover:border-emerald-500/40 hover:text-white'
                        }`}
                        variant={buttonConfig.variant}
                        disabled={buttonConfig.disabled}
                        onClick={() => handleCtaClick(tier.id)}
                      >
                        {buttonConfig.label}
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>

          {/* Bottom Note */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            className="text-center text-xs text-gray-600 mt-8 sm:mt-10"
          >
            All plans include SSL encryption, 99.9% uptime, and access to our documentation.
            <br />
            Contact{' '}
            <span className="text-gray-400">admin@arbdesk.com</span> for custom enterprise solutions.
          </motion.p>
        </div>
      </main>
      <footer className="mt-auto border-t border-[#30363d] bg-[#0d1117] py-4 text-center text-xs text-gray-500 shrink-0">
        © 2025 Arb Desk. All rights reserved.
      </footer>
    </div>
  )
}
import { NextResponse } from 'next/server'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlanFeature {
  text: string
  included: boolean
}

interface SubscriptionPlan {
  id: string
  name: string
  price: string
  period: string | null
  description: string
  features: PlanFeature[]
  highlighted: boolean
  badge: string | null
  sortOrder: number
}

// ─── Static Plan Data ────────────────────────────────────────────────────────

const plans: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: null,
    description: 'Get started with basic arbitrage tools',
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
    badge: null,
    sortOrder: 0,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$9.99',
    period: '/mo',
    description: 'For serious bettors who want an edge',
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
    sortOrder: 1,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$29.99',
    period: '/mo',
    description: 'Full power for professionals and teams',
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
    badge: null,
    sortOrder: 2,
  },
]

// ─── GET Handler ─────────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    success: true,
    data: plans.sort((a, b) => a.sortOrder - b.sortOrder),
  })
}
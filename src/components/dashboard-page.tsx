'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import {
  Radar,
  Scan,
  DollarSign,
  Trophy,
  Building2,
  Calculator,
  RefreshCw,
  Search,
  Menu,
  LogOut,
  ChevronRight,
  Clock,
  Zap,
  Shield,
  TrendingUp,
  ArrowUpRight,
  CreditCard,
  Crown,
} from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'
// Data fetched from /api/odds endpoint
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookmakerOdds {
  name: string
  lastUpdate: string
  markets: Record<string, Record<string, number>>
}

interface Event {
  id: string
  sport: string
  competition: string
  startsAt: string
  homeTeam: string
  awayTeam: string
  bookmakers: BookmakerOdds[]
}

interface ArbOpportunity {
  id: string
  eventId: string
  sport: string
  competition: string
  homeTeam: string
  awayTeam: string
  marketType: string
  edge: number
  confidence: string
  bookmaker1: string
  bookmaker2: string
  selection1: string
  selection2: string
  odds1: number
  odds2: number
  impliedProb1: number
  impliedProb2: number
  startsAt: string
}

interface ValueBet {
  id: string
  eventId: string
  sport: string
  competition: string
  homeTeam: string
  awayTeam: string
  marketType: string
  selection: string
  bookmaker: string
  odds: number
  consensusOdds: number
  edge: number
  startsAt: string
}

interface OddsResponse {
  mode: string
  fetchedAt: string
  previousFetchedAt: string
  events: Event[]
  opportunities: ArbOpportunity[]
  valueBets: ValueBet[]
  scraperAvailable?: boolean
  message?: string
}

type PageId = 'scanner' | 'value' | 'matches' | 'bookmakers' | 'calculator'

interface NavItem {
  id: PageId
  label: string
  icon: React.ElementType
}

// ─── Constants ───────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: 'scanner', label: 'Scanner', icon: Scan },
  { id: 'value', label: 'Value Bets', icon: DollarSign },
  { id: 'matches', label: 'Matches', icon: Trophy },
  { id: 'bookmakers', label: 'Bookmakers', icon: Building2 },
  { id: 'calculator', label: 'Calculator', icon: Calculator },
]

const SPORT_OPTIONS = [
  { value: 'all', label: 'All Sports' },
  { value: 'football', label: 'Football' },
  { value: 'basketball', label: 'Basketball' },
  { value: 'tennis', label: 'Tennis' },
]

const CONFIDENCE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function edgeColor(edge: number): string {
  if (edge > 5) return 'text-emerald-400'
  if (edge >= 2) return 'text-amber-400'
  return 'text-slate-400'
}

function edgeBg(edge: number): string {
  if (edge > 5) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  if (edge >= 2) return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
}

function confidenceStyle(confidence: string): string {
  switch (confidence) {
    case 'high':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    case 'medium':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    case 'low':
      return 'bg-red-500/15 text-red-400 border-red-500/30'
    default:
      return 'bg-slate-500/15 text-slate-400 border-slate-500/30'
  }
}

function formatTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: false })
  } catch {
    return '—'
  }
}

function formatStartTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function formatStartDate(iso: string): string {
  try {
    const d = new Date(iso)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[#30363d] bg-[#161b22] p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-4 w-32 bg-[#21262d]" />
            <Skeleton className="h-6 w-16 bg-[#21262d]" />
          </div>
          <Skeleton className="h-5 w-64 bg-[#21262d] mb-3" />
          <div className="flex gap-4">
            <Skeleton className="h-20 flex-1 bg-[#21262d] rounded-lg" />
            <Skeleton className="h-20 flex-1 bg-[#21262d] rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}

function MatchesLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="h-6 w-40 bg-[#21262d] mb-3" />
          {Array.from({ length: 2 }).map((_, j) => (
            <div
              key={j}
              className="rounded-lg border border-[#30363d] bg-[#161b22] p-4 mb-2"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-48 bg-[#21262d]" />
                <Skeleton className="h-4 w-20 bg-[#21262d]" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function BookmakersLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[#30363d] bg-[#161b22] p-5"
        >
          <Skeleton className="h-5 w-28 bg-[#21262d] mb-3" />
          <Skeleton className="h-4 w-20 bg-[#21262d] mb-2" />
          <Skeleton className="h-4 w-32 bg-[#21262d]" />
        </div>
      ))}
    </div>
  )
}

// ─── Scanner Page ────────────────────────────────────────────────────────────

function ScannerPage({
  opportunities,
  sportFilter,
  minEdge,
  confidenceFilter,
  searchQuery,
  mode,
  fetchedAt,
}: {
  opportunities: ArbOpportunity[]
  sportFilter: string
  minEdge: number
  confidenceFilter: string
  searchQuery: string
  mode?: string
  fetchedAt?: string
}) {
  const filtered = useMemo(() => {
    return opportunities.filter((o) => {
      if (sportFilter !== 'all' && o.sport !== sportFilter) return false
      if (o.edge < minEdge) return false
      if (confidenceFilter !== 'all' && o.confidence !== confidenceFilter)
        return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          o.homeTeam.toLowerCase().includes(q) ||
          o.awayTeam.toLowerCase().includes(q) ||
          o.competition.toLowerCase().includes(q) ||
          o.bookmaker1.toLowerCase().includes(q) ||
          o.bookmaker2.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [opportunities, sportFilter, minEdge, confidenceFilter, searchQuery])

  const modeBadge = mode === 'live'
    ? { label: 'LIVE', classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
    : mode === 'error'
      ? { label: 'Error', classes: 'bg-red-500/15 text-red-400 border-red-500/30' }
      : { label: 'Demo Mode', classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30' }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-white">Arbitrage Opportunities</h2>
        <Badge variant="outline" className={`text-xs font-medium ${modeBadge.classes}`}>
          {modeBadge.label}
        </Badge>
        {mode === 'live' && fetchedAt && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400">
            <Clock className="size-3.5" />
            Last Scrape: {formatTime(fetchedAt)} ago
          </span>
        )}
        <span className="text-sm text-gray-500">
          {filtered.length} of {opportunities.length} found
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Zap className="mx-auto h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">No opportunities match your filters</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1 custom-scrollbar">
          {filtered.map((opp) => (
            <motion.div
              key={opp.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              whileHover={{ scale: 1.005 }}
              className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 sm:p-5 hover:border-emerald-500/30 transition-colors cursor-pointer"
            >
              {/* Top row: competition + badges */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge
                  variant="outline"
                  className="text-xs border-[#30363d] text-gray-400 bg-[#0d1117] font-normal"
                >
                  {opp.competition}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-xs font-normal ${confidenceStyle(opp.confidence)}`}
                >
                  {opp.confidence}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-xs font-semibold ml-auto ${edgeBg(opp.edge)}`}
                >
                  {opp.edge.toFixed(2)}% edge
                </Badge>
              </div>

              {/* Teams */}
              <h3 className="text-white font-medium text-sm sm:text-base mb-1">
                {opp.homeTeam} vs {opp.awayTeam}
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                {opp.marketType} &middot; {formatStartDate(opp.startsAt)}{' '}
                {formatStartTime(opp.startsAt)}
              </p>

              {/* Bookmaker odds */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Bookmaker 1 */}
                <div className="rounded-lg bg-[#0d1117] border border-[#30363d] p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">{opp.bookmaker1}</span>
                    <span className="text-xs text-gray-600">
                      {opp.impliedProb1.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">{opp.selection1}</span>
                    <span className="text-base font-semibold text-white">
                      {opp.odds1.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Bookmaker 2 */}
                <div className="rounded-lg bg-[#0d1117] border border-[#30363d] p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">{opp.bookmaker2}</span>
                    <span className="text-xs text-gray-600">
                      {opp.impliedProb2.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">{opp.selection2}</span>
                    <span className="text-base font-semibold text-white">
                      {opp.odds2.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Calculate button */}
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 text-xs gap-1"
                >
                  <Calculator className="size-3" />
                  Calculate
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Value Bets Page ─────────────────────────────────────────────────────────

function ValueBetsPage({
  valueBets,
  sportFilter,
  searchQuery,
}: {
  valueBets: ValueBet[]
  sportFilter: string
  searchQuery: string
}) {
  const filtered = useMemo(() => {
    return valueBets.filter((v) => {
      if (sportFilter !== 'all' && v.sport !== sportFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          v.homeTeam.toLowerCase().includes(q) ||
          v.awayTeam.toLowerCase().includes(q) ||
          v.competition.toLowerCase().includes(q) ||
          v.bookmaker.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [valueBets, sportFilter, searchQuery])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Value Bets</h2>
        <span className="text-sm text-gray-500">
          {filtered.length} of {valueBets.length} found
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <TrendingUp className="mx-auto h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">No value bets match your filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1 custom-scrollbar">
          {filtered.map((vb) => (
            <motion.div
              key={vb.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              whileHover={{ scale: 1.01 }}
              className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 hover:border-emerald-500/30 transition-colors"
            >
              {/* Competition */}
              <Badge
                variant="outline"
                className="text-xs border-[#30363d] text-gray-400 bg-[#0d1117] font-normal mb-3"
              >
                {vb.competition}
              </Badge>

              {/* Teams */}
              <h3 className="text-white font-medium text-sm mb-1">
                {vb.homeTeam} vs {vb.awayTeam}
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                {vb.marketType} &middot; {formatStartDate(vb.startsAt)}{' '}
                {formatStartTime(vb.startsAt)}
              </p>

              {/* Selection */}
              <div className="rounded-lg bg-[#0d1117] border border-[#30363d] p-3 mb-3">
                <div className="text-xs text-gray-500 mb-1">{vb.bookmaker}</div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">{vb.selection}</span>
                  <span className="text-lg font-bold text-white">
                    {vb.odds.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Edge row */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  Avg: {vb.consensusOdds.toFixed(2)}
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs font-semibold ${edgeBg(vb.edge)}`}
                >
                  {vb.edge > 0 ? '+' : ''}
                  {vb.edge.toFixed(2)}% edge
                </Badge>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Matches Page ────────────────────────────────────────────────────────────

function MatchesPage({
  events,
  sportFilter,
  searchQuery,
}: {
  events: Event[]
  sportFilter: string
  searchQuery: string
}) {
  const [selectedOdds, setSelectedOdds] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let evts = events
    if (sportFilter !== 'all') {
      evts = evts.filter((e) => e.sport === sportFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      evts = evts.filter(
        (e) =>
          e.homeTeam.toLowerCase().includes(q) ||
          e.awayTeam.toLowerCase().includes(q) ||
          e.competition.toLowerCase().includes(q)
      )
    }
    return evts
  }, [events, sportFilter, searchQuery])

  // Group by competition
  const grouped = useMemo(() => {
    const map = new Map<string, Event[]>()
    for (const evt of filtered) {
      const key = `${evt.competition}|${evt.sport}`
      const list = map.get(key) || []
      list.push(evt)
      map.set(key, list)
    }
    return map
  }, [filtered])

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Trophy className="mx-auto h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">No matches found</p>
      </div>
    )
  }

  return (
    <div className="max-h-[calc(100vh-200px)] overflow-y-auto pr-1 custom-scrollbar">
      {Array.from(grouped.entries()).map(([key, evts]) => {
        const [comp] = key.split('|')
        return (
          <div key={key} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
              {comp}
            </h2>
            <div className="space-y-2">
              {evts.map((evt) => (
                <motion.div
                  key={evt.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 hover:border-emerald-500/30 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-white font-medium text-sm">
                        {evt.homeTeam} vs {evt.awayTeam}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {formatStartDate(evt.startsAt)}{' '}
                        {formatStartTime(evt.startsAt)}
                      </p>
                    </div>
                  </div>

                  {/* Bookmaker odds grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {evt.bookmakers.map((bm) => {
                      const markets = Object.entries(bm.markets)
                      // Show first market (usually Match Winner)
                      const mainMarket = markets[0]
                      if (!mainMarket) return null
                      const [marketName, selections] = mainMarket
                      return (
                        <div
                          key={bm.name}
                          className="rounded-lg bg-[#0d1117] border border-[#30363d] p-2.5"
                        >
                          <div className="text-xs text-gray-500 mb-2 font-medium">
                            {bm.name}
                            <span className="text-gray-600 ml-1">
                              &middot; {marketName}
                            </span>
                          </div>
                          <div className="flex gap-1.5">
                            {Object.entries(selections).map(([sel, odds]) => {
                              const oddsKey = `${evt.id}-${bm.name}-${sel}`
                              const isSelected = selectedOdds === oddsKey
                              return (
                                <button
                                  key={sel}
                                  onClick={() =>
                                    setSelectedOdds(isSelected ? null : oddsKey)
                                  }
                                  className={`flex-1 rounded-md px-2 py-1.5 text-center transition-all text-xs ${
                                    isSelected
                                      ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
                                      : 'bg-[#161b22] border border-[#30363d] text-gray-300 hover:border-emerald-500/30 hover:text-white'
                                  }`}
                                >
                                  <div className="text-[10px] text-gray-500 mb-0.5">
                                    {sel}
                                  </div>
                                  <div className="font-semibold">{odds.toFixed(2)}</div>
                                </button>
                              )
                            })}
                          </div>
                          <div className="text-[10px] text-gray-600 mt-1.5">
                            Updated {formatTime(bm.lastUpdate)} ago
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Bookmakers Page ─────────────────────────────────────────────────────────

function BookmakersPage({ events }: { events: Event[] }) {
  const bookmakerData = useMemo(() => {
    const map = new Map<
      string,
      { name: string; events: number; lastUpdate: string }
    >()
    for (const evt of events) {
      for (const bm of evt.bookmakers) {
        const existing = map.get(bm.name)
        if (existing) {
          existing.events += 1
          if (new Date(bm.lastUpdate) > new Date(existing.lastUpdate)) {
            existing.lastUpdate = bm.lastUpdate
          }
        } else {
          map.set(bm.name, {
            name: bm.name,
            events: 1,
            lastUpdate: bm.lastUpdate,
          })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.events - a.events)
  }, [events])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Bookmakers</h2>
        <span className="text-sm text-gray-500">{bookmakerData.length} active</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-1 custom-scrollbar">
        {bookmakerData.map((bm, i) => {
          const lastUpdated = new Date(bm.lastUpdate)
          const isRecent = Date.now() - lastUpdated.getTime() < 5 * 60 * 1000
          return (
            <motion.div
              key={bm.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.05 }}
              whileHover={{ scale: 1.01 }}
              className="rounded-xl border border-[#30363d] bg-[#161b22] p-5 hover:border-emerald-500/30 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-gray-400" />
                  <h3 className="text-white font-medium text-sm">{bm.name}</h3>
                </div>
                <div
                  className={`h-2 w-2 rounded-full ${
                    isRecent ? 'bg-emerald-400' : 'bg-gray-600'
                  }`}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Trophy className="size-3.5 text-gray-500" />
                  <span className="text-gray-400">
                    <span className="text-white font-medium">{bm.events}</span> events
                    covered
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="size-3.5 text-gray-500" />
                  <span className="text-gray-400">
                    Updated <span className="text-gray-300">{formatTime(bm.lastUpdate)}</span> ago
                  </span>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Calculator Page ─────────────────────────────────────────────────────────

function CalculatorPage() {
  const [odds1, setOdds1] = useState('')
  const [oddsX, setOddsX] = useState('')
  const [odds2, setOdds2] = useState('')
  const [stake, setStake] = useState('100')
  const [arbResult, setArbResult] = useState<{
    overround: number
    isArb: boolean
    arbPercent: number
    stakes: { label: string; odds: number; stake: number; payout: number }[]
  } | null>(null)

  const [kellyOdds, setKellyOdds] = useState('')
  const [kellyProb, setKellyProb] = useState('')
  const [kellyResult, setKellyResult] = useState<{
    kelly: number
    halfKelly: number
    ev: number
  } | null>(null)

  const checkArbitrage = () => {
    const o1 = parseFloat(odds1)
    const oX = oddsX ? parseFloat(oddsX) : 0
    const o2 = parseFloat(odds2)
    const totalStake = parseFloat(stake) || 100

    if (!o1 || !o2) return

    let entries: { label: string; odds: number }[] = [{ label: 'Outcome 1', odds: o1 }]
    if (oX > 0) entries.push({ label: 'Draw (X)', odds: oX })
    entries.push({ label: 'Outcome 2', odds: o2 })

    const impliedProbs = entries.map((e) => 1 / e.odds)
    const overround = impliedProbs.reduce((a, b) => a + b, 0)
    const isArb = overround < 1
    const arbPercent = isArb ? ((1 - overround) / overround) * 100 : 0

    const individualStakes = entries.map((e) => {
      const fairShare = (1 / e.odds) / overround
      const s = fairShare * totalStake
      return {
        label: e.label,
        odds: e.odds,
        stake: s,
        payout: s * e.odds,
      }
    })

    setArbResult({ overround, isArb, arbPercent, stakes: individualStakes })
  }

  const calculateKelly = () => {
    const o = parseFloat(kellyOdds)
    const p = parseFloat(kellyProb)
    if (!o || !p || p <= 0 || p >= 1) return

    const b = o - 1
    const q = 1 - p
    const kelly = (b * p - q) / b
    const ev = p * o - 1

    setKellyResult({
      kelly: kelly > 0 ? kelly * 100 : 0,
      halfKelly: kelly > 0 ? (kelly * 100) / 2 : 0,
      ev: ev * 100,
    })
  }

  return (
    <div className="space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-1 custom-scrollbar">
      {/* Arbitrage / Dutching Calculator */}
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="size-5 text-emerald-400" />
          <h2 className="text-white font-semibold">Arbitrage / Dutch Calculator</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="space-y-1.5">
            <Label className="text-gray-400 text-xs">Odds 1</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="e.g. 2.10"
              value={odds1}
              onChange={(e) => setOdds1(e.target.value)}
              className="bg-[#0d1117] border-[#30363d] text-white placeholder:text-gray-600"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-gray-400 text-xs">Odds X (optional)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="For 3-way markets"
              value={oddsX}
              onChange={(e) => setOddsX(e.target.value)}
              className="bg-[#0d1117] border-[#30363d] text-white placeholder:text-gray-600"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-gray-400 text-xs">Odds 2</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="e.g. 2.15"
              value={odds2}
              onChange={(e) => setOdds2(e.target.value)}
              className="bg-[#0d1117] border-[#30363d] text-white placeholder:text-gray-600"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <div className="space-y-1.5 w-40">
            <Label className="text-gray-400 text-xs">Total Stake ($)</Label>
            <Input
              type="number"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="bg-[#0d1117] border-[#30363d] text-white placeholder:text-gray-600"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              onClick={checkArbitrage}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Check Arbitrage
            </Button>
            <Button variant="outline" className="border-[#30363d] text-gray-300 hover:bg-[#0d1117]" onClick={checkArbitrage}>
              Dutch Calculator
            </Button>
          </div>
        </div>

        {arbResult && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg bg-[#0d1117] border border-[#30363d] p-4 space-y-3"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">Overround</div>
                <div
                  className={`text-lg font-bold ${
                    arbResult.isArb ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {arbResult.overround.toFixed(4)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Status</div>
                <div
                  className={`text-sm font-semibold ${
                    arbResult.isArb ? 'text-emerald-400' : 'text-gray-400'
                  }`}
                >
                  {arbResult.isArb
                    ? `✓ Arbitrage ${arbResult.arbPercent.toFixed(2)}%`
                    : 'No arbitrage'}
                </div>
              </div>
            </div>

            <div className="border-t border-[#30363d] pt-3">
              <div className="text-xs text-gray-500 mb-2">Individual Stakes</div>
              <div className="space-y-2">
                {arbResult.stakes.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-300">{s.label}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-gray-500">
                        @{s.odds.toFixed(2)}
                      </span>
                      <span className="text-white font-medium w-20 text-right">
                        ${s.stake.toFixed(2)}
                      </span>
                      <span className="text-emerald-400 font-medium w-20 text-right">
                        ${s.payout.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Kelly Criterion Calculator */}
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="size-5 text-emerald-400" />
          <h2 className="text-white font-semibold">Kelly Criterion Calculator</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="space-y-1.5">
            <Label className="text-gray-400 text-xs">Odds (Decimal)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="e.g. 2.50"
              value={kellyOdds}
              onChange={(e) => setKellyOdds(e.target.value)}
              className="bg-[#0d1117] border-[#30363d] text-white placeholder:text-gray-600"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-gray-400 text-xs">
              Your Estimated Probability (0-1)
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="1"
              placeholder="e.g. 0.45"
              value={kellyProb}
              onChange={(e) => setKellyProb(e.target.value)}
              className="bg-[#0d1117] border-[#30363d] text-white placeholder:text-gray-600"
            />
          </div>
        </div>

        <Button
          onClick={calculateKelly}
          variant="outline"
          className="border-[#30363d] text-gray-300 hover:bg-[#0d1117]"
        >
          Calculate Kelly
        </Button>

        {kellyResult && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-lg bg-[#0d1117] border border-[#30363d] p-4"
          >
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Full Kelly</div>
                <div className={`text-lg font-bold ${kellyResult.kelly > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                  {kellyResult.kelly.toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Half Kelly</div>
                <div className={`text-lg font-bold ${kellyResult.halfKelly > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                  {kellyResult.halfKelly.toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Expected Value</div>
                <div className={`text-lg font-bold ${kellyResult.ev > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {kellyResult.ev > 0 ? '+' : ''}
                  {kellyResult.ev.toFixed(2)}%
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

// ─── Sidebar Nav Content (shared between desktop sidebar & mobile sheet) ─────

function SidebarNavContent({
  activePage,
  onNavClick,
  user,
  onLogout,
}: {
  activePage: PageId
  onNavClick: (id: PageId) => void
  user: { email?: string; subscriptionTier?: string; role: string } | null
  onLogout: () => void
}) {
  return (
    <>
      {/* Brand */}
      <div className="flex items-center gap-2.5 p-4 border-b border-[#30363d]">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15">
          <Radar className="size-4.5 text-emerald-400" />
        </div>
        <span className="text-white font-bold text-lg tracking-tight">
          Arb Desk
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto custom-scrollbar">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = activePage === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavClick(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-[#0d1117] border border-transparent'
              }`}
            >
              <Icon className="size-4" />
              {item.label}
              {isActive && (
                <ChevronRight className="size-3 ml-auto opacity-60" />
              )}
            </button>
          )
        })}
      </nav>

      {/* Upgrade prompt for free tier */}
      {user?.subscriptionTier === 'free' && (
        <div className="mx-3 mb-3">
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ArrowUpRight className="size-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">
                Upgrade
              </span>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Unlock real-time alerts, more bookmakers, and advanced filters.
            </p>
          </div>
        </div>
      )}

      {/* User section */}
      <div className="border-t border-[#30363d] p-3">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#0d1117] border border-[#30363d]">
              <span className="text-xs font-bold text-gray-400">
                {user.email?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-300 truncate">{user.email}</div>
              <Badge
                variant="outline"
                className="text-[10px] border-[#30363d] text-gray-500 bg-[#0d1117] mt-0.5 px-1.5 py-0"
              >
                {user.role}
              </Badge>
            </div>
            <button
              onClick={onLogout}
              className="text-gray-500 hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        ) : (
          <div className="text-xs text-gray-600 py-1">Not signed in</div>
        )}
      </div>
    </>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

interface DashboardPageProps {
  onGoToAdmin?: () => void
  onGoToSubscription?: () => void
  onLogout?: () => void
}

export default function DashboardPage({ onGoToAdmin, onGoToSubscription, onLogout }: DashboardPageProps) {
  const [data, setData] = useState<OddsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activePage, setActivePage] = useState<PageId>('scanner')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sportFilter, setSportFilter] = useState('all')
  const [minEdge, setMinEdge] = useState(0)
  const [confidenceFilter, setConfidenceFilter] = useState('all')
  const [refreshing, setRefreshing] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [scrapeResult, setScrapeResult] = useState<{ totalEvents: number; results: Array<{ provider: string; status: string; eventsFound: number; durationMs: number; error?: string }> } | null>(null)

  // Auto-scrape state
  const [autoScraping, setAutoScraping] = useState(true) // starts automatically
  const [autoScrapeCount, setAutoScrapeCount] = useState(0)
  const [autoScrapeStatus, setAutoScrapeStatus] = useState<'idle' | 'scraping' | 'seeding' | 'done' | 'error'>('idle')
  const [nextScrapeIn, setNextScrapeIn] = useState(0)
  const [lastAutoScrapeMsg, setLastAutoScrapeMsg] = useState('')
  const [scraperAvailable, setScraperAvailable] = useState<boolean | null>(null)
  const autoScrapeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isAutoScrapingRef = useRef(false) // prevent overlapping scrapes
  const AUTO_SCRAPE_INTERVAL = 90 // seconds between auto-scrapes

  const { user, isAdmin, logout } = useAuthStore()

  const fetchData = useCallback(async () => {
    setRefreshing(true)
    try {
      const token = useAuthStore.getState().token
      const res = await fetch('/api/odds', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // fetch failed
    }
    setRefreshing(false)
  }, [])

  // ─── Auto-Scrape: Trigger a single scrape cycle ─────────────────────
  const runAutoScrape = useCallback(async () => {
    if (isAutoScrapingRef.current) return // prevent overlap
    isAutoScrapingRef.current = true
    setAutoScrapeStatus('scraping')
    setScraping(true)

    try {
      const token = useAuthStore.getState().token
      const res = await fetch('/api/odds/auto-scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      })

      if (res.ok) {
        const json = await res.json()
        setScraperAvailable(json.scraperAvailable)

        if (json.scraperAvailable && json.events?.length > 0) {
          // Scraping succeeded — update data directly from response
          setData({
            mode: json.mode || 'live',
            fetchedAt: json.fetchedAt,
            previousFetchedAt: data?.fetchedAt || json.fetchedAt,
            events: json.events,
            opportunities: json.opportunities || [],
            valueBets: json.valueBets || [],
          })
          setAutoScrapeStatus('done')
          setLastAutoScrapeMsg(json.message || `Scraped ${json.events?.length || 0} events`)
          setAutoScrapeCount(prev => prev + 1)
        } else if (!json.scraperAvailable) {
          // Scraper not available (Cloudflare) — just refresh D1 data
          await fetchData()
          setAutoScrapeStatus('done')
          setLastAutoScrapeMsg('Using cached data (scraper offline)')
          setAutoScrapeCount(prev => prev + 1)
        } else {
          // Scraper available but no new events
          await fetchData()
          setAutoScrapeStatus('done')
          setLastAutoScrapeMsg(json.message || 'No new events found')
          setAutoScrapeCount(prev => prev + 1)
        }
      } else {
        setAutoScrapeStatus('error')
        setLastAutoScrapeMsg('Scrape request failed')
      }
    } catch (err) {
      setAutoScrapeStatus('error')
      setLastAutoScrapeMsg(String(err))
    }

    setScraping(false)
    isAutoScrapingRef.current = false
  }, [data?.fetchedAt, fetchData])

  // Keep a stable ref to runAutoScrape for the interval
  const runAutoScrapeRef = useRef(runAutoScrape)
  runAutoScrapeRef.current = runAutoScrape

  // ─── Auto-Scrape: Continuous loop management ────────────────────────
  useEffect(() => {
    if (!autoScraping) {
      if (autoScrapeTimerRef.current) clearInterval(autoScrapeTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      autoScrapeTimerRef.current = null
      countdownRef.current = null
      setNextScrapeIn(0)
      return
    }

    // Initial load
    setLoading(true)
    runAutoScrapeRef.current().finally(() => setLoading(false))

    // Start countdown
    let secondsLeft = AUTO_SCRAPE_INTERVAL
    setNextScrapeIn(secondsLeft)

    countdownRef.current = setInterval(() => {
      secondsLeft--
      if (secondsLeft <= 0) secondsLeft = AUTO_SCRAPE_INTERVAL
      setNextScrapeIn(secondsLeft)
    }, 1000)

    // Start auto-scrape interval
    autoScrapeTimerRef.current = setInterval(() => {
      runAutoScrapeRef.current()
    }, AUTO_SCRAPE_INTERVAL * 1000)

    return () => {
      if (autoScrapeTimerRef.current) clearInterval(autoScrapeTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [autoScraping])

  const handleNavClick = (pageId: PageId) => {
    setActivePage(pageId)
    setSheetOpen(false)
  }

  const handleRefresh = () => {
    fetchData()
  }

  const handleScrapeNow = async () => {
    // Manual scrape = trigger immediate auto-scrape cycle
    await runAutoScrape()
    // Reset countdown
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      let secondsLeft = AUTO_SCRAPE_INTERVAL
      countdownRef.current = setInterval(() => {
        secondsLeft--
        if (secondsLeft <= 0) secondsLeft = AUTO_SCRAPE_INTERVAL
        setNextScrapeIn(secondsLeft)
      }, 1000)
      setNextScrapeIn(secondsLeft)
    }
    // Reset auto-scrape timer
    if (autoScrapeTimerRef.current) {
      clearInterval(autoScrapeTimerRef.current)
      autoScrapeTimerRef.current = setInterval(() => {
        runAutoScrape()
      }, AUTO_SCRAPE_INTERVAL * 1000)
    }
  }

  const renderContent = () => {
    if (loading) {
      switch (activePage) {
        case 'matches':
          return <MatchesLoadingSkeleton />
        case 'bookmakers':
          return <BookmakersLoadingSkeleton />
        default:
          return <LoadingSkeleton />
      }
    }

    if (!data) {
      return (
        <div className="text-center py-20 text-gray-500">
          <Radar className="mx-auto h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Unable to load data. Try refreshing.</p>
          <Button
            variant="ghost"
            className="mt-3 text-emerald-400 hover:text-emerald-300"
            onClick={handleRefresh}
          >
            <RefreshCw className="size-4 mr-2" />
            Retry
          </Button>
        </div>
      )
    }

    switch (activePage) {
      case 'scanner':
        return (
          <ScannerPage
            opportunities={data.opportunities}
            sportFilter={sportFilter}
            minEdge={minEdge}
            confidenceFilter={confidenceFilter}
            searchQuery={searchQuery}
            mode={data.mode}
            fetchedAt={data.fetchedAt}
          />
        )
      case 'value':
        return (
          <ValueBetsPage
            valueBets={data.valueBets}
            sportFilter={sportFilter}
            searchQuery={searchQuery}
          />
        )
      case 'matches':
        return (
          <MatchesPage
            events={data.events}
            sportFilter={sportFilter}
            searchQuery={searchQuery}
          />
        )
      case 'bookmakers':
        return <BookmakersPage events={data.events} />
      case 'calculator':
        return <CalculatorPage />
      default:
        return null
    }
  }

  // Scanner-specific filters
  const showScannerFilters = activePage === 'scanner'

  return (
    <div className="min-h-screen flex flex-col bg-[#0d1117] text-gray-300">
      {/* ─── Mobile Navigation Sheet ─── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="left"
          className="w-72 bg-[#161b22] border-[#30363d] p-0 gap-0 [&>button]:text-gray-400 [&>button:hover]:text-white [&>button:hover]:bg-[#0d1117]/80 [&>button]:top-3 [&>button]:right-3"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation Menu</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col h-full">
            <SidebarNavContent
              activePage={activePage}
              onNavClick={handleNavClick}
              user={user}
              onLogout={logout}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Sidebar + Main Row ─── */}
      <div className="flex-1 flex overflow-hidden">

      {/* ─── Desktop Sidebar (hidden on mobile) ─── */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-[#161b22] border-r border-[#30363d] shrink-0">
        <SidebarNavContent
          activePage={activePage}
          onNavClick={(id) => setActivePage(id)}
          user={user}
          onLogout={logout}
        />
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-[#0d1117]/95 backdrop-blur-sm border-b border-[#30363d]">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            {/* Left */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSheetOpen(true)}
                className="md:hidden text-gray-400 hover:text-white transition-colors"
              >
                <Menu className="size-5" />
              </button>
              <span className="text-white font-semibold text-sm md:hidden">
                Arb Desk
              </span>
            </div>

            {/* Center */}
            <div className="hidden md:flex items-center gap-3">
              <div
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                  data?.mode === 'live'
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : data?.mode === 'error'
                      ? 'bg-red-500/10 border-red-500/20'
                      : 'bg-amber-500/10 border-amber-500/20'
                }`}
              >
                <div
                  className={`h-2 w-2 rounded-full animate-pulse ${
                    data?.mode === 'live'
                      ? 'bg-emerald-400'
                      : data?.mode === 'error'
                        ? 'bg-red-400'
                        : 'bg-amber-400'
                  }`}
                />
                <span
                  className={`text-xs font-medium ${
                    data?.mode === 'live'
                      ? 'text-emerald-400'
                      : data?.mode === 'error'
                        ? 'text-red-400'
                        : 'text-amber-400'
                  }`}
                >
                  {data?.mode === 'live'
                    ? 'LIVE'
                    : data?.mode === 'error'
                      ? 'Error'
                      : 'Demo Mode'}
                </span>
              </div>
              {data?.fetchedAt && (
                <span className="text-xs text-gray-500">
                  Updated: {formatTime(data.fetchedAt)} ago
                </span>
              )}
            </div>

            {/* Right */}
            <div className="flex items-center gap-2">
              {/* Mobile status pill */}
              <div
                className={`flex md:hidden items-center gap-1.5 rounded-full border px-2 py-0.5 ${
                  data?.mode === 'live'
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : data?.mode === 'error'
                      ? 'bg-red-500/10 border-red-500/20'
                      : 'bg-amber-500/10 border-amber-500/20'
                }`}
              >
                <div
                  className={`h-1.5 w-1.5 rounded-full animate-pulse ${
                    data?.mode === 'live'
                      ? 'bg-emerald-400'
                      : data?.mode === 'error'
                        ? 'bg-red-400'
                        : 'bg-amber-400'
                  }`}
                />
                <span
                  className={`text-[10px] font-medium ${
                    data?.mode === 'live'
                      ? 'text-emerald-400'
                      : data?.mode === 'error'
                        ? 'text-red-400'
                        : 'text-amber-400'
                  }`}
                >
                  {data?.mode === 'live'
                    ? 'LIVE'
                    : data?.mode === 'error'
                      ? 'Error'
                      : 'Demo'}
                </span>
              </div>

              <div className="relative hidden sm:block">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-500" />
                <Input
                  placeholder="Search matches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 w-44 lg:w-56 bg-[#161b22] border-[#30363d] text-sm text-white placeholder:text-gray-600 focus:border-emerald-500/40 focus:ring-emerald-500/20"
                />
              </div>

              <Select value={sportFilter} onValueChange={setSportFilter}>
                <SelectTrigger className="h-8 w-28 lg:w-36 bg-[#161b22] border-[#30363d] text-sm text-gray-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#161b22] border-[#30363d]">
                  {SPORT_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      className="text-gray-300 focus:text-white focus:bg-emerald-500/10"
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Auto-Scrape Status Pill */}
              <div className="flex items-center gap-1.5 mr-1">
                <div className={`h-2 w-2 rounded-full ${autoScraping ? (scraping ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400') : 'bg-gray-600'}`} />
                <span className="text-[11px] text-gray-400 hidden md:inline">
                  {scraping ? 'Scraping…' : autoScraping ? `Next in ${nextScrapeIn}s` : 'Paused'}
                </span>
                {autoScrapeCount > 0 && (
                  <span className="text-[10px] text-gray-600 hidden lg:inline">({autoScrapeCount} cycles)</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleScrapeNow}
                disabled={scraping}
                className="h-8 gap-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                title="Trigger immediate scrape"
              >
                <Zap className={`size-3.5 ${scraping ? 'animate-pulse' : ''}`} />
                <span className="hidden lg:inline text-xs">Scrape Now</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAutoScraping(prev => !prev)}
                className={`h-8 gap-1.5 ${autoScraping ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10' : 'text-gray-500 hover:text-gray-300 hover:bg-[#161b22]'}`}
                title={autoScraping ? 'Pause auto-scraping' : 'Resume auto-scraping'}
              >
                <Radar className={`size-3.5 ${autoScraping && !scraping ? 'animate-spin' : ''}`} style={autoScraping && !scraping ? { animationDuration: '3s' } : {}} />
                <span className="hidden lg:inline text-xs">{autoScraping ? 'Auto ON' : 'Auto OFF'}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-gray-400 hover:text-white hover:bg-[#161b22]"
              >
                <RefreshCw
                  className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
                />
              </Button>
              {onGoToAdmin && isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onGoToAdmin}
                  className="h-8 bg-[#161b22] border-[#30363d] text-gray-300 hover:bg-[#1c2333] hover:text-white"
                >
                  <Shield className="w-3.5 h-3.5 mr-1.5" />
                  <span className="hidden lg:inline">Admin</span>
                </Button>
              )}
              {onGoToSubscription && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onGoToSubscription}
                  className="h-8 bg-[#161b22] border-[#30363d] text-gray-300 hover:bg-[#1c2333] hover:text-white"
                >
                  <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                  <span className="hidden sm:inline text-xs">Plan: </span>
                  <Crown className="w-3 h-3 ml-0.5 text-amber-400" />
                  <span className="text-emerald-400 capitalize text-xs ml-0.5">{user?.subscriptionTier || 'free'}</span>
                </Button>
              )}
              {onLogout && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onLogout}
                  className="h-8 w-8 text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Scraping results banner */}
          {scrapeResult && (
            <div className="relative mx-4 mb-2 rounded-lg bg-[#161b22] border border-[#30363d] p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-amber-400" />
                  <span className="text-xs font-medium text-white">Scraping Complete</span>
                </div>
                <span className="text-xs text-gray-400">{scrapeResult.totalEvents} events found</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {scrapeResult.results.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 rounded-md bg-[#0d1117] px-2 py-1 text-[10px]"
                  >
                    <div className={`h-1.5 w-1.5 rounded-full ${r.status === 'success' ? 'bg-emerald-400' : r.status === 'partial' ? 'bg-amber-400' : 'bg-red-400'}`} />
                    <span className="text-gray-400">{r.provider}</span>
                    <span className="text-gray-600">({r.eventsFound})</span>
                    {r.error && <span className="text-red-400/70 max-w-20 truncate">{r.error}</span>}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setScrapeResult(null)}
                className="absolute top-2 right-2 text-gray-600 hover:text-gray-400 text-xs"
              >
                ×
              </button>
            </div>
          )}

          {/* Scanner filters row */}
          {showScannerFilters && (
            <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-gray-500 whitespace-nowrap">
                  Min Edge %
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={minEdge || ''}
                  onChange={(e) => setMinEdge(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="h-7 w-16 bg-[#161b22] border-[#30363d] text-sm text-white placeholder:text-gray-600"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-gray-500 whitespace-nowrap">
                  Confidence
                </Label>
                <Select
                  value={confidenceFilter}
                  onValueChange={setConfidenceFilter}
                >
                  <SelectTrigger className="h-7 w-28 bg-[#161b22] border-[#30363d] text-sm text-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#161b22] border-[#30363d]">
                    {CONFIDENCE_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        className="text-gray-300 focus:text-white focus:bg-emerald-500/10"
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Mobile search */}
              <div className="relative sm:hidden flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-500" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-7 bg-[#161b22] border-[#30363d] text-sm text-white placeholder:text-gray-600"
                />
              </div>
            </div>
          )}
        </header>

        {/* Content */}
        <section className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          {renderContent()}
        </section>
      </main>

      </div>{/* ─── End Sidebar + Main Row ─── */}

      {/* ─── Footer ─── */}
      <footer className="mt-auto shrink-0 border-t border-[#30363d] bg-[#0d1117] px-4 md:px-6 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs text-gray-500 shrink-0">© 2025 Arb Desk</span>
          {/* Auto-scrape status bar */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] min-w-0">
            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
              scraping ? 'bg-amber-400 animate-pulse' :
              autoScraping ? 'bg-emerald-400' : 'bg-gray-600'
            }`} />
            <span className={`truncate ${scraping ? 'text-amber-400' : autoScraping ? 'text-emerald-400/80' : 'text-gray-600'}`}>
              {scraping ? 'Scraping odds…' :
               lastAutoScrapeMsg || (autoScraping ? 'Auto-scrape active' : 'Auto-scrape paused')}
            </span>
            {autoScraping && !scraping && (
              <span className="text-gray-600 shrink-0">· {nextScrapeIn}s</span>
            )}
            {autoScrapeCount > 0 && (
              <span className="text-gray-700 shrink-0">({autoScrapeCount})</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {data?.mode === 'live' && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
          )}
          <span className="text-xs text-gray-500">Real-time Odds Intelligence</span>
        </div>
      </footer>

      {/* ─── Custom Scrollbar Styles ─── */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #30363d;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #484f58;
        }
      `}</style>
    </div>
  )
}
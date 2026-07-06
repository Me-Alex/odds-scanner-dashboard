/**
 * Kaizen Gaming Adapter (Betano RO)
 * Platform: Kaizen - REST JSON
 * Note: Betano has aggressive anti-bot measures. Handle 403 gracefully.
 */

import { BaseAdapter } from '../base-adapter'
import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, ScrapingResult } from '../types'
import { normalizeSport, normalizeTeamName, normalizeMarket } from '../types'

const BETANO_CONFIG: BookmakerConfig = {
  id: 'bk-betano',
  name: 'Betano',
  slug: 'betano',
  type: 'rest',
  platform: 'kaizen',
  isActive: true,
  baseUrl: 'https://www.betano.ro/api/',
  sports: '1,2,13,4,6',
  timeout: 15000,
  minInterval: 5000,
  headers: {
    'Origin': 'https://www.betano.ro',
    'Referer': 'https://www.betano.ro/',
  },
}

const BETANO_SPORTS: Record<string, string> = {
  '1': 'football',
  '2': 'basketball',
  '13': 'tennis',
  '4': 'ice-hockey',
  '6': 'handball',
  '10': 'volleyball',
}

interface BetanoOutcome {
  name: string
  odds: number
  price?: number
  value?: number
}

interface BetanoMarket {
  marketType: string
  name?: string
  type?: string
  outcomes: BetanoOutcome[]
  selections?: BetanoOutcome[]
}

interface BetanoEvent {
  eventId: string
  id?: string
  homeTeam: string
  awayTeam: string
  startDate: string
  startTime?: string | number
  sportId: string | number
  sport?: string
  competition?: { name: string } | string
  isLive?: boolean
  live?: boolean
  markets: BetanoMarket[]
}

interface BetanoResponse {
  events: BetanoEvent[]
  data?: BetanoEvent[]
}

export class BetanoAdapter extends BaseAdapter implements BookmakerAdapter {
  readonly config = BETANO_CONFIG

  async scrape(sports?: string[]): Promise<ScrapingResult> {
    const startMs = Date.now()
    const sportIds = sports?.length ? sports : ['1', '2', '13', '4', '6']
    const allEvents: NormalizedEvent[] = []
    let hasPartial = false
    let lastError: string | undefined

    for (const sportId of sportIds) {
      try {
        const url = `${this.config.baseUrl}v1/sports/events?lang=ro&sportId=${sportId}&limit=200`
        const response = await this.fetchJson<BetanoResponse>(url)
        const events = response.events || response.data || []

        for (const event of events) {
          const parsed = this.parseEvent(event)
          if (parsed) allEvents.push(parsed)
        }
      } catch (err) {
        hasPartial = true
        const msg = String(err)
        if (msg.includes('403')) {
          lastError = 'Anti-bot protection (403)'
        } else {
          console.error(`[Betano] Failed sport ${sportId}:`, err)
        }
      }
    }

    return this.buildResult(
      allEvents,
      allEvents.length > 0 ? (hasPartial ? 'partial' : 'success') : 'error',
      lastError || (hasPartial ? 'Some sports failed' : undefined),
      startMs
    )
  }

  private parseEvent(event: BetanoEvent): NormalizedEvent | null {
    if (!event.homeTeam || !event.awayTeam) return null

    const sportId = String(event.sportId || '')
    const rawSport = event.sport || BETANO_SPORTS[sportId] || ''
    const category = typeof event.competition === 'object'
      ? (event.competition as { name: string }).name
      : String(event.competition || '')
    const matchTime = this.parseMatchTime(event.startDate || event.startTime)
    const isLive = !!event.isLive || !!event.live

    const odds: NormalizedEvent['odds'] = {}

    for (const market of (event.markets || [])) {
      const marketName = normalizeMarket(market.marketType || market.name || market.type || '')
      if (!marketName || marketName === 'Other') continue

      const outcomes = market.outcomes || market.selections || []
      const selections: Record<string, number> = {}

      for (const outcome of outcomes) {
        const price = this.parseOdds(outcome.odds || outcome.price || outcome.value)
        if (!price) continue

        let label = (outcome.name || '').trim()
        if (label === 'home' || label === 'H' || label === '1') label = '1'
        else if (label === 'draw' || label === 'D' || label === 'X') label = 'X'
        else if (label === 'away' || label === 'A' || label === '2') label = '2'
        else if (label.toLowerCase() === 'over') label = 'Over'
        else if (label.toLowerCase() === 'under') label = 'Under'

        if (label) selections[label] = price
      }

      if (Object.keys(selections).length > 0) {
        odds[marketName] = selections
      }
    }

    if (Object.keys(odds).length === 0) return null

    return {
      externalId: event.eventId || event.id || crypto.randomUUID(),
      provider: this.config.slug,
      sport: normalizeSport(rawSport),
      category,
      tournament: category,
      homeTeam: normalizeTeamName(event.homeTeam),
      awayTeam: normalizeTeamName(event.awayTeam),
      matchTime,
      bettingStatus: true,
      isLive,
      odds,
    }
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now()
    try {
      const url = `${this.config.baseUrl}v1/sports/events?lang=ro&sportId=1&limit=1`
      await this.fetchJson<BetanoResponse>(url)
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      const msg = String(err)
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: msg.includes('403') ? 'Anti-bot protection (403)' : msg,
      }
    }
  }
}

export function createBetanoAdapter(): BookmakerAdapter {
  return new BetanoAdapter()
}
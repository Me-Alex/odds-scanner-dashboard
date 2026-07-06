/**
 * Sportify Platform Adapter (NetBet RO)
 * Platform: Sportify - REST JSON
 */

import { BaseAdapter } from '../base-adapter'
import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, ScrapingResult } from '../types'
import { normalizeSport, normalizeTeamName, normalizeMarket } from '../types'

const SPORTIFY_CONFIG: BookmakerConfig = {
  id: 'bk-netbet',
  name: 'NetBet',
  slug: 'netbet',
  type: 'rest',
  platform: 'sportify',
  isActive: true,
  baseUrl: 'https://apicdn.netbet.com/sports/v1/',
  sports: '1,2,13,4',
  timeout: 15000,
  minInterval: 3000,
}

const SPORTIFY_SPORTS: Record<string, string> = {
  '1': 'football',
  '2': 'basketball',
  '13': 'tennis',
  '4': 'ice-hockey',
  '6': 'handball',
  '10': 'volleyball',
}

interface SportifySelection {
  name: string
  odds: number
  price?: number
}

interface SportifyMarket {
  type: string
  name?: string
  selections: SportifySelection[]
}

interface SportifyEvent {
  id: string
  homeTeam: string
  awayTeam: string
  startTime: string
  startDate?: string
  sportId: string | number
  sport?: string
  competition?: string
  league?: string
  isLive?: boolean
  live?: boolean
  markets: SportifyMarket[]
}

interface SportifyResponse {
  events: SportifyEvent[]
  data?: SportifyEvent[]
}

export class SportifyAdapter extends BaseAdapter implements BookmakerAdapter {
  readonly config = SPORTIFY_CONFIG

  async scrape(sports?: string[]): Promise<ScrapingResult> {
    const startMs = Date.now()
    const sportIds = sports?.length ? sports : ['1', '2', '13', '4', '6']
    const allEvents: NormalizedEvent[] = []
    let hasPartial = false

    for (const sportId of sportIds) {
      try {
        const url = `${this.config.baseUrl}events?country=RO&sportId=${sportId}&lang=ro&limit=200`
        const response = await this.fetchJson<SportifyResponse>(url)
        const events = response.events || response.data || []

        for (const event of events) {
          const parsed = this.parseEvent(event)
          if (parsed) allEvents.push(parsed)
        }
      } catch (err) {
        hasPartial = true
        console.error(`[Sportify] Failed sport ${sportId}:`, err)
      }
    }

    return this.buildResult(
      allEvents,
      allEvents.length > 0 ? (hasPartial ? 'partial' : 'success') : 'error',
      hasPartial ? 'Some sports failed' : undefined,
      startMs
    )
  }

  private parseEvent(event: SportifyEvent): NormalizedEvent | null {
    if (!event.homeTeam || !event.awayTeam) return null

    const sportId = String(event.sportId || '')
    const rawSport = event.sport || SPORTIFY_SPORTS[sportId] || ''
    const category = event.competition || event.league || ''
    const matchTime = this.parseMatchTime(event.startTime || event.startDate)
    const isLive = !!event.isLive || !!event.live

    const odds: NormalizedEvent['odds'] = {}

    for (const market of (event.markets || [])) {
      const marketName = normalizeMarket(market.type || market.name || '')
      if (!marketName || marketName === 'Other') continue

      const selections: Record<string, number> = {}

      for (const sel of (market.selections || [])) {
        const price = this.parseOdds(sel.odds || sel.price)
        if (!price) continue

        let label = (sel.name || '').trim()
        if (label === 'home' || label === 'H') label = '1'
        else if (label === 'draw' || label === 'D') label = 'X'
        else if (label === 'away' || label === 'A') label = '2'
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
      externalId: event.id || crypto.randomUUID(),
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
      const url = `${this.config.baseUrl}events?country=RO&sportId=1&lang=ro&limit=1`
      await this.fetchJson<SportifyResponse>(url)
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: String(err) }
    }
  }
}

export function createSportifyAdapter(): BookmakerAdapter {
  return new SportifyAdapter()
}
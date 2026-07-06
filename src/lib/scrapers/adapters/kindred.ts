/**
 * Kindred Group Adapter (Unibet RO)
 * Platform: Kindred - REST JSON via CDN feed
 */

import { BaseAdapter } from '../base-adapter'
import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, ScrapingResult } from '../types'
import { normalizeSport, normalizeTeamName, normalizeMarket } from '../types'

const KINDRED_CONFIG: BookmakerConfig = {
  id: 'bk-unibet',
  name: 'Unibet',
  slug: 'unibet',
  type: 'rest',
  platform: 'kindred',
  isActive: true,
  baseUrl: 'https://offer.cdn.unibet.com/sportsbook-offering/v1/api/',
  sports: '1,2,13,4,6,10',
  timeout: 15000,
  minInterval: 3000,
}

const KINDRED_SPORTS: Record<number, string> = {
  1: 'football',
  2: 'basketball',
  13: 'tennis',
  4: 'ice-hockey',
  6: 'handball',
  10: 'volleyball',
  3: 'american-football',
  12: 'mma',
}

interface KindredOutcome {
  label: string
  price: number
  odds?: number
}

interface KindredMarket {
  name: string
  type?: string
  outcomes: KindredOutcome[]
}

interface KindredFixture {
  id: string
  home: { name: string } | string
  away: { name: string } | string
  start: string | number
  sport?: { id: number; name: string }
  competition?: { name: string } | string
  markets: KindredMarket[]
  live?: boolean
  startDate?: string
  startTime?: string | number
}

interface KindredResponse {
  fixtures: KindredFixture[]
  events?: KindredFixture[]
  data?: { fixtures?: KindredFixture[]; events?: KindredFixture[] }
}

export class KindredAdapter extends BaseAdapter implements BookmakerAdapter {
  readonly config = KINDRED_CONFIG

  async scrape(sports?: string[]): Promise<ScrapingResult> {
    const startMs = Date.now()
    const sportIds = sports?.length ? sports : ['1', '2', '13', '4', '6']
    const allEvents: NormalizedEvent[] = []
    let hasPartial = false

    for (const sportId of sportIds) {
      try {
        const url = `${this.config.baseUrl}offering/feed?lang=ro&country=RO&type=json&sportId=${sportId}&count=200`
        const response = await this.fetchJson<KindredResponse>(url)
        const fixtures = response.fixtures || response.events || response.data?.fixtures || response.data?.events || []

        for (const fixture of fixtures) {
          const event = this.parseFixture(fixture, sportId)
          if (event) allEvents.push(event)
        }
      } catch (err) {
        hasPartial = true
        console.error(`[Kindred] Failed to fetch sport ${sportId}:`, err)
      }
    }

    return this.buildResult(
      allEvents,
      allEvents.length > 0 ? (hasPartial ? 'partial' : 'success') : 'error',
      hasPartial ? 'Some sports failed' : undefined,
      startMs
    )
  }

  private parseFixture(fixture: KindredFixture, sportId: string): NormalizedEvent | null {
    const homeName = typeof fixture.home === 'object' ? fixture.home.name : String(fixture.home || '')
    const awayName = typeof fixture.away === 'object' ? fixture.away.name : String(fixture.away || '')

    if (!homeName || !awayName) return null

    const rawSport = fixture.sport?.name || KINDRED_SPORTS[parseInt(sportId)] || ''
    const category = typeof fixture.competition === 'object' ? (fixture.competition as { name: string }).name : String(fixture.competition || '')
    const matchTime = this.parseMatchTime(fixture.start || fixture.startDate || fixture.startTime)
    const isLive = !!fixture.live

    const odds: NormalizedEvent['odds'] = {}

    for (const market of (fixture.markets || [])) {
      const marketName = normalizeMarket(market.name || market.type || '')
      if (!marketName || marketName === 'Other') continue

      const selections: Record<string, number> = {}

      for (const outcome of (market.outcomes || [])) {
        const price = this.parseOdds(outcome.price || outcome.odds)
        if (!price) continue

        let label = (outcome.label || '').trim()
        // Normalize selection labels
        if (label === 'home' || label === '1' || label === 'H') label = '1'
        else if (label === 'draw' || label === 'X' || label === 'D') label = 'X'
        else if (label === 'away' || label === '2' || label === 'A') label = '2'
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
      externalId: fixture.id || crypto.randomUUID(),
      provider: this.config.slug,
      sport: normalizeSport(rawSport),
      category,
      tournament: category,
      homeTeam: normalizeTeamName(homeName),
      awayTeam: normalizeTeamName(awayName),
      matchTime,
      bettingStatus: true,
      isLive,
      odds,
    }
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now()
    try {
      const url = `${this.config.baseUrl}offering/feed?lang=ro&country=RO&type=json&sportId=1&count=1`
      await this.fetchJson<KindredResponse>(url)
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: String(err) }
    }
  }
}

export function createKindredAdapter(): BookmakerAdapter {
  return new KindredAdapter()
}
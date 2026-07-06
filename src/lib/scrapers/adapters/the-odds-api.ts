/**
 * The Odds API Adapter ⭐ PRIMARY DATA SOURCE
 * Aggregates odds from multiple bookmakers in a single call.
 * Each event is split into per-bookmaker NormalizedEvents.
 */

import { BaseAdapter } from '../base-adapter'
import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, ScrapingResult } from '../types'
import { normalizeSport, normalizeTeamName, normalizeMarket, countOdds } from '../types'

const DEFAULT_API_KEY = 'YOUR_THE_ODDS_API_KEY'

const THE_ODDS_API_CONFIG: BookmakerConfig = {
  id: 'bk-the-odds-api',
  name: 'The Odds API',
  slug: 'the-odds-api',
  type: 'aggregator',
  platform: 'independent',
  isActive: true,
  baseUrl: 'https://api.the-odds-api.com/v4/',
  sports: '',
  timeout: 20000,
  minInterval: 1000, // Rate limit: ~500 requests/min on free tier
}

// Sport keys for The Odds API
const DEFAULT_SPORT_KEYS = [
  'upcoming',
  // Romanian & European football
  'soccer_romania_liga_i',
  'soccer_epl',
  'soccer_la_liga',
  'soccer_serie_a',
  'soccer_bundesliga',
  'soccer_ligue_one',
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
  // Basketball
  'basketball_euroleague',
  'basketball_nba',
  // Tennis
  'tennis_atp_french_open',
  'tennis_atp_wimbledon',
  'tennis_atp_us_open',
  'tennis_atp_australian_open',
  // Ice Hockey
  'icehockey_nhl',
  // Handball
  'handball_european_championship',
]

// Map The Odds API sport key prefixes to normalized sport names
const SPORT_KEY_MAP: Record<string, string> = {
  'soccer': 'football',
  'basketball': 'basketball',
  'tennis': 'tennis',
  'icehockey': 'ice-hockey',
  'handball': 'handball',
  'mma_mixed_martial_arts': 'mma',
  'boxing': 'boxing',
  'rugby': 'rugby',
}

function sportKeyToSport(key: string): string {
  for (const [prefix, sport] of Object.entries(SPORT_KEY_MAP)) {
    if (key.startsWith(prefix)) return sport
  }
  return 'other'
}

// Map The Odds API market keys to normalized market names
const MARKET_KEY_MAP: Record<string, string> = {
  'h2h': '1X2',
  'totals': 'Over/Under 2.5',
  'spreads': 'Handicap',
}

interface OddsApiOutcome {
  name: string
  price: number
  point?: number
}

interface OddsApiMarket {
  key: string
  outcomes: OddsApiOutcome[]
}

interface OddsApiBookmaker {
  key: string
  title: string
  last_update: string
  markets: OddsApiMarket[]
}

interface OddsApiEvent {
  id: string
  sport_key: string
  sport_title: string
  commence_time: string
  home_team: string
  away_team: string
  bookmakers: OddsApiBookmaker[]
}

export class TheOddsApiAdapter extends BaseAdapter implements BookmakerAdapter {
  readonly config: BookmakerConfig

  private apiKey: string

  constructor(apiKey?: string) {
    super()
    this.apiKey = apiKey || (typeof process !== 'undefined' ? (process.env.THE_ODDS_API_KEY || DEFAULT_API_KEY) : DEFAULT_API_KEY)
    this.config = {
      ...THE_ODDS_API_CONFIG,
      apiKey: this.apiKey,
    }
  }

  async scrape(sports?: string[]): Promise<ScrapingResult> {
    const startMs = Date.now()

    if (this.apiKey === DEFAULT_API_KEY || !this.apiKey) {
      return this.buildResult([], 'error', 'The Odds API key not configured', startMs)
    }

    const sportKeys = sports?.length
      ? sports.map(s => this.findSportKey(s)).filter(Boolean) as string[]
      : DEFAULT_SPORT_KEYS

    const allEvents: NormalizedEvent[] = []
    let hasPartial = false

    for (const sportKey of sportKeys) {
      try {
        const events = await this.fetchSportOdds(sportKey)
        allEvents.push(...events)
      } catch (err) {
        hasPartial = true
        console.error(`[TheOddsAPI] Failed ${sportKey}:`, err)
        // Rate limit backoff
        await this.sleep(1000)
      }
    }

    return this.buildResult(
      allEvents,
      allEvents.length > 0 ? (hasPartial ? 'partial' : 'success') : 'error',
      hasPartial ? 'Some sports failed' : undefined,
      startMs
    )
  }

  private async fetchSportOdds(sportKey: string): Promise<NormalizedEvent[]> {
    const url = `${this.config.baseUrl}sports/${sportKey}/odds/?apiKey=${this.apiKey}&regions=eu&markets=h2h,totals,spreads&oddsFormat=decimal`
    const events = await this.fetchJson<OddsApiEvent[]>(url)
    const normalized: NormalizedEvent[] = []

    for (const event of events) {
      const sport = sportKeyToSport(event.sport_key)
      const category = this.extractCategory(event.sport_title)
      const matchTime = this.parseMatchTime(event.commence_time)

      // Split by bookmaker — each bookmaker becomes a separate NormalizedEvent
      for (const bookmaker of event.bookmakers) {
        const odds = this.parseBookmakerMarkets(bookmaker.markets, event.home_team, event.away_team)
        if (Object.keys(odds).length === 0) continue

        const providerSlug = this.normalizeBookmakerKey(bookmaker.key)

        normalized.push({
          externalId: `${event.id}_${bookmaker.key}`,
          provider: providerSlug,
          sport,
          category,
          tournament: category,
          homeTeam: normalizeTeamName(event.home_team),
          awayTeam: normalizeTeamName(event.away_team),
          matchTime,
          bettingStatus: true,
          isLive: false,
          odds,
        })
      }
    }

    return normalized
  }

  private parseBookmakerMarkets(
    markets: OddsApiMarket[],
    homeTeam: string,
    awayTeam: string
  ): NormalizedEvent['odds'] {
    const odds: NormalizedEvent['odds'] = {}

    for (const market of markets) {
      const marketName = MARKET_KEY_MAP[market.key] || normalizeMarket(market.key)
      if (!marketName || marketName === 'Other') continue

      const selections: Record<string, number> = {}

      for (const outcome of market.outcomes) {
        const price = this.parseOdds(outcome.price)
        if (!price) continue

        let label = outcome.name.trim()
        const labelLower = label.toLowerCase()

        // For h2h → 1X2, map team names and Draw
        if (market.key === 'h2h') {
          if (labelLower === homeTeam.toLowerCase()) label = '1'
          else if (labelLower === awayTeam.toLowerCase()) label = '2'
          else if (labelLower === 'draw' || labelLower === 'x') label = 'X'
          else {
            // Try partial match
            if (homeTeam.toLowerCase().includes(labelLower) || labelLower.includes(homeTeam.toLowerCase())) label = '1'
            else if (awayTeam.toLowerCase().includes(labelLower) || labelLower.includes(awayTeam.toLowerCase())) label = '2'
          }
        } else if (labelLower === 'over') {
          label = 'Over'
          if (outcome.point) label += ` ${outcome.point}`
        } else if (labelLower === 'under') {
          label = 'Under'
          if (outcome.point) label += ` ${outcome.point}`
        }

        if (label) selections[label] = price
      }

      if (Object.keys(selections).length > 0) {
        odds[marketName] = selections
      }
    }

    return odds
  }

  private extractCategory(sportTitle: string): string {
    // "Soccer - Romania Liga I" → "Romania Liga I"
    // "Basketball - Euroleague" → "Euroleague"
    const parts = sportTitle.split(' - ')
    return parts.length > 1 ? parts.slice(1).join(' - ').trim() : sportTitle
  }

  private normalizeBookmakerKey(key: string): string {
    // "unibet_eu" → "unibet", "betfair" → "betfair"
    return key.replace(/_eu$|_uk$|_us$|_au$|_ro$/, '').replace(/_/g, '')
  }

  private findSportKey(normalized: string): string | undefined {
    const lower = normalized.toLowerCase()
    if (lower === 'football' || lower === 'soccer') return 'soccer_romania_liga_i'
    if (lower === 'basketball') return 'basketball_euroleague'
    if (lower === 'tennis') return 'tennis_atp_french_open'
    if (lower === 'ice-hockey' || lower === 'ice hockey') return 'icehockey_nhl'
    if (lower === 'handball') return 'handball_european_championship'
    return undefined
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now()

    if (this.apiKey === DEFAULT_API_KEY || !this.apiKey) {
      return { ok: false, latencyMs: 0, error: 'API key not configured' }
    }

    try {
      const url = `${this.config.baseUrl}sports/?apiKey=${this.apiKey}`
      await this.fetchJson<unknown>(url)
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: String(err) }
    }
  }
}

export function createTheOddsApiAdapter(apiKey?: string): BookmakerAdapter {
  return new TheOddsApiAdapter(apiKey)
}
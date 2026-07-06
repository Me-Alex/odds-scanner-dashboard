/**
 * nSoft Platform Adapter
 * Shared by: Stanleybet, GameWorld, AdmiralBet, Seven, RedSevens, GPCasino (Romania)
 *
 * API: REST JSON (nSoft Betting API)
 * Primary: GET {baseUrl}api/sports/betzone/events?lang=en&sportId={code}&count=100
 * Fallback: GET {baseUrl}api/v2/sports/events?zone=betzone
 */

import { BaseAdapter } from '../base-adapter'
import type {
  BookmakerAdapter,
  BookmakerConfig,
  NormalizedEvent,
  NormalizedOdds,
  ScrapingResult,
} from '../types'
import { normalizeSport, normalizeTeamName, normalizeMarket } from '../types'

// ─── Brand Configuration ──────────────────────────────────────────────────

export interface NsoftBrand {
  name: string
  slug: string
  baseUrl: string
}

export const NSOFT_BRANDS: Record<string, NsoftBrand> = {
  stanleybet: {
    name: 'Stanleybet',
    slug: 'stanleybet',
    baseUrl: 'https://www.stanleybet.ro/',
  },
  gameworld: {
    name: 'GameWorld',
    slug: 'gameworld',
    baseUrl: 'https://www.gameworld.ro/',
  },
  admiralbet: {
    name: 'AdmiralBet',
    slug: 'admiralbet',
    baseUrl: 'https://www.admiralbet.ro/',
  },
  seven: {
    name: 'Seven',
    slug: 'seven',
    baseUrl: 'https://www.seven.ro/',
  },
  redsevens: {
    name: 'RedSevens',
    slug: 'redsevens',
    baseUrl: 'https://www.redsevens.ro/',
  },
  gpcasino: {
    name: 'GPCasino',
    slug: 'gpcasino',
    baseUrl: 'https://www.gpcasino.ro/',
  },
}

// ─── nSoft Sport Code Mapping ─────────────────────────────────────────────

const NSOFT_SPORT_CODES: Record<string, string> = {
  'SR': 'SR',          // Football
  'football': 'SR',
  'BK': 'BK',          // Basketball
  'basketball': 'BK',
  'TN': 'TN',          // Tennis
  'tennis': 'TN',
  'IH': 'IH',          // Ice Hockey
  'ice-hockey': 'IH',
  'HB': 'HB',          // Handball
  'handball': 'HB',
  'VB': 'VB',          // Volleyball
  'volleyball': 'VB',
}

const NSOFT_CODE_TO_SPORT: Record<string, string> = {
  'SR': 'football',
  'BK': 'basketball',
  'TN': 'tennis',
  'IH': 'ice-hockey',
  'HB': 'handball',
  'VB': 'volleyball',
}

// ─── nSoft Response Types ─────────────────────────────────────────────────

interface NsoftSelection {
  name: string
  price: number
  visible?: boolean
}

interface NsoftMarket {
  type: string
  name?: string
  selections: NsoftSelection[]
}

interface NsoftCompetition {
  id?: string
  name: string
}

interface NsoftSport {
  id: string
  name: string
}

interface NsoftEvent {
  id: string
  homeTeam: { name: string } | string
  awayTeam: { name: string } | string
  startTime: string
  sport: NsoftSport | { id: string; name: string }
  competition?: NsoftCompetition | { name: string }
  markets?: NsoftMarket[]
  isLive?: boolean
  status?: string
}

interface NsoftEventsResponse {
  events?: NsoftEvent[]
  total?: number
  data?: {
    events?: NsoftEvent[]
  }
}

// ─── Adapter Implementation ───────────────────────────────────────────────

class NsoftAdapter extends BaseAdapter {
  readonly config: BookmakerConfig
  private readonly brand: NsoftBrand
  private useFallbackEndpoint = false

  constructor(brand: NsoftBrand) {
    super()
    this.brand = brand

    const sportCodes = Object.values(NSOFT_SPORT_CODES)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(',')

    this.config = {
      id: `bk-${brand.slug}`,
      name: brand.name,
      slug: brand.slug,
      type: 'rest',
      platform: 'nsoft',
      isActive: true,
      baseUrl: brand.baseUrl,
      sports: sportCodes,
      timeout: 15_000,
      minInterval: 1_000,
    }
  }

  // ─── Scrape ─────────────────────────────────────────────────────────────

  async scrape(sports?: string[]): Promise<ScrapingResult> {
    const startMs = Date.now()
    const allEvents: NormalizedEvent[] = []
    const errors: string[] = []
    let hasPartial = false

    const sportCodes = this.resolveSportCodes(sports)

    // Try primary endpoint first; if it fails, switch to fallback for all sports
    for (const code of sportCodes) {
      try {
        const events = await this.fetchSportEvents(code)
        allEvents.push(...events)
      } catch (err) {
        // If primary fails on first sport, try fallback endpoint once
        if (!this.useFallbackEndpoint && code === sportCodes[0]) {
          this.useFallbackEndpoint = true
          try {
            const events = await this.fetchSportEvents(code)
            allEvents.push(...events)
            continue
          } catch {
            // Both failed, record error
          }
        }
        hasPartial = true
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`sportCode=${code}: ${msg}`)
      }
    }

    const status = errors.length === 0
      ? 'success'
      : allEvents.length > 0
        ? 'partial'
        : 'error'

    return this.buildResult(
      allEvents,
      status,
      errors.length > 0 ? errors.join('; ') : undefined,
      startMs,
    )
  }

  // ─── Test Connection ────────────────────────────────────────────────────

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const startMs = Date.now()
    try {
      // Try primary endpoint
      const primaryUrl = `${this.brand.baseUrl}api/sports/betzone/events?lang=en&sportId=SR&count=1`
      await this.fetchJson<NsoftEventsResponse>(primaryUrl)
      this.useFallbackEndpoint = false
      return { ok: true, latencyMs: Date.now() - startMs }
    } catch {
      // Try fallback endpoint
      try {
        const fallbackUrl = `${this.brand.baseUrl}api/v2/sports/events?zone=betzone`
        await this.fetchJson<NsoftEventsResponse>(fallbackUrl)
        this.useFallbackEndpoint = true
        return { ok: true, latencyMs: Date.now() - startMs }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, latencyMs: Date.now() - startMs, error: msg }
      }
    }
  }

  // ─── Internal: Fetch Events for a Single Sport ──────────────────────────

  private async fetchSportEvents(sportCode: string): Promise<NormalizedEvent[]> {
    const events: NormalizedEvent[] = []
    const batchSize = 100
    let offset = 0
    let hasMore = true

    while (hasMore) {
      let url: string
      if (this.useFallbackEndpoint) {
        url = `${this.brand.baseUrl}api/v2/sports/events?zone=betzone&sportId=${sportCode}&count=${batchSize}&offset=${offset}`
      } else {
        url = `${this.brand.baseUrl}api/sports/betzone/events?lang=en&sportId=${sportCode}&count=${batchSize}&offset=${offset}`
      }

      const response = await this.fetchJson<NsoftEventsResponse>(url)

      // Handle both top-level and nested data.events
      const rawEvents = response?.data?.events ?? response?.events ?? []

      if (rawEvents.length === 0) {
        hasMore = false
        continue
      }

      for (const raw of rawEvents) {
        const normalized = this.normalizeEvent(raw)
        if (normalized) {
          events.push(normalized)
        }
      }

      if (rawEvents.length < batchSize) {
        hasMore = false
      } else {
        offset += batchSize
      }

      // Safety cap
      if (offset >= batchSize * 10) {
        hasMore = false
      }
    }

    return events
  }

  // ─── Internal: Normalize a Single Event ─────────────────────────────────

  private normalizeEvent(raw: NsoftEvent): NormalizedEvent | null {
    if (!raw.id) return null

    // Extract team names (could be objects or strings)
    const homeRaw = typeof raw.homeTeam === 'object' && raw.homeTeam !== null
      ? (raw.homeTeam as { name: string }).name
      : String(raw.homeTeam || '')
    const awayRaw = typeof raw.awayTeam === 'object' && raw.awayTeam !== null
      ? (raw.awayTeam as { name: string }).name
      : String(raw.awayTeam || '')

    if (!homeRaw || !awayRaw) return null

    // Extract sport
    const sportObj = raw.sport as { id: string; name: string } | undefined
    const sportCode = sportObj?.id ?? ''
    const sport = NSOFT_CODE_TO_SPORT[sportCode]
      ?? normalizeSport(sportObj?.name ?? '')

    // Extract competition
    const compObj = raw.competition as { name: string } | undefined
    const category = compObj?.name ?? ''

    // Parse odds from markets
    const odds: NormalizedOdds = {}
    const markets = raw.markets ?? []

    for (const market of markets) {
      if (!market.selections?.length) continue

      const marketKey = normalizeMarket(market.type || market.name || '')
      const selections: Record<string, number> = {}

      for (const sel of market.selections) {
        if (sel.visible === false) continue

        const parsed = this.parseOdds(sel.price)
        if (parsed === null) continue

        let selName = (sel.name || '').trim()
        if (!selName) continue

        // Normalize common selection names
        const selLower = selName.toLowerCase()
        if (selName === '1' || selLower === 'home' || selLower === '1 (home)') selName = '1'
        else if (selName === 'X' || selLower === 'draw' || selLower === 'x (draw)') selName = 'X'
        else if (selName === '2' || selLower === 'away' || selLower === '2 (away)') selName = '2'
        else if (selLower === 'over' || selLower.startsWith('over ')) selName = 'Over'
        else if (selLower === 'under' || selLower.startsWith('under ')) selName = 'Under'
        else if (selLower === 'yes') selName = 'Yes'
        else if (selLower === 'no') selName = 'No'

        selections[selName] = parsed
      }

      if (Object.keys(selections).length > 0) {
        odds[marketKey] = selections
      }
    }

    if (Object.keys(odds).length === 0) return null

    const matchTime = this.parseMatchTime(raw.startTime)

    const isLive = raw.isLive === true
    const isClosed = raw.status === 'closed' || raw.status === 'ended'

    return {
      externalId: raw.id,
      provider: this.brand.slug,
      sport,
      category,
      tournament: category,
      homeTeam: normalizeTeamName(homeRaw),
      awayTeam: normalizeTeamName(awayRaw),
      matchTime,
      bettingStatus: !isClosed,
      isLive,
      odds,
    }
  }

  // ─── Internal: Resolve Requested Sports to nSoft Codes ──────────────────

  private resolveSportCodes(sports?: string[]): string[] {
    if (sports && sports.length > 0) {
      return sports
        .map((s) => NSOFT_SPORT_CODES[s] ?? NSOFT_SPORT_CODES[normalizeSport(s)])
        .filter((code): code is string => code !== undefined)
        .filter((v, i, arr) => arr.indexOf(v) === i)
    }

    return ['SR', 'BK', 'TN', 'IH', 'HB', 'VB']
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────

export function createNsoftAdapter(brand: NsoftBrand): BookmakerAdapter {
  return new NsoftAdapter(brand)
}

export { NsoftAdapter }
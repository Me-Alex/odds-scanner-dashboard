/**
 * EGT Platform Adapter
 * Shared by: Winbet, VivaBet, LuckySeven, OneCasino, MaxWin, Prowin, VipBet (Romania)
 *
 * API: REST JSON (EGT Sportsbook API)
 * Events: GET {baseUrl}sports/events?sportId={id}&lang=ro&limit=200
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

export interface EGTBrand {
  name: string
  slug: string
  baseUrl: string
}

export const EGT_BRANDS: Record<string, EGTBrand> = {
  winbet: {
    name: 'Winbet',
    slug: 'winbet',
    baseUrl: 'https://winbet.ro/api/',
  },
  vivabet: {
    name: 'VivaBet',
    slug: 'vivabet',
    baseUrl: 'https://vivabet.ro/api/',
  },
  luckyseven: {
    name: 'LuckySeven',
    slug: 'luckyseven',
    baseUrl: 'https://luckyseven.ro/api/',
  },
  onecasino: {
    name: 'OneCasino',
    slug: 'onecasino',
    baseUrl: 'https://onecasino.ro/api/',
  },
  maxwin: {
    name: 'MaxWin',
    slug: 'maxwin',
    baseUrl: 'https://maxwin.ro/api/',
  },
  prowin: {
    name: 'Prowin',
    slug: 'prowin',
    baseUrl: 'https://prowin.ro/api/',
  },
  vipbet: {
    name: 'VipBet',
    slug: 'vipbet',
    baseUrl: 'https://vipbet.ro/api/',
  },
}

// ─── EGT Sport ID Mapping ─────────────────────────────────────────────────

const EGT_SPORT_IDS: Record<string, string> = {
  '1': '1',          // Football
  'football': '1',
  '2': '2',          // Basketball
  'basketball': '2',
  '3': '3',          // Tennis
  'tennis': '3',
  '4': '4',          // Ice Hockey
  'ice-hockey': '4',
}

const EGT_SPORT_NAME_MAP: Record<string, string> = {
  '1': 'football',
  '2': 'basketball',
  '3': 'tennis',
  '4': 'ice-hockey',
}

// ─── EGT Response Types ───────────────────────────────────────────────────

/**
 * EGT returns a flat odds object per event, e.g.:
 * {
 *   "1X2": { "home": 1.85, "draw": 3.40, "away": 4.50 },
 *   "Over/Under 2.5": { "over": 1.90, "under": 1.95 }
 * }
 */
type EGTOddsMap = Record<string, Record<string, number>>

interface EGTEvent {
  eventId: string
  homeTeam: string
  awayTeam: string
  startTime: string
  sport: string
  league: string
  odds: EGTOddsMap
  isLive?: boolean
  status?: string
  tournament?: string
}

// Response is a flat array in `data` or at root
interface EGTEventsResponse {
  data?: EGTEvent[]
}

// ─── Adapter Implementation ───────────────────────────────────────────────

class EGTAdapter extends BaseAdapter {
  readonly config: BookmakerConfig
  private readonly brand: EGTBrand

  constructor(brand: EGTBrand) {
    super()
    this.brand = brand

    const sportIds = ['1', '2', '3', '4'].join(',')

    this.config = {
      id: `bk-${brand.slug}`,
      name: brand.name,
      slug: brand.slug,
      type: 'rest',
      platform: 'egt',
      isActive: true,
      baseUrl: brand.baseUrl,
      sports: sportIds,
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

    const sportIds = this.resolveSportIds(sports)

    for (const sportId of sportIds) {
      try {
        const events = await this.fetchSportEvents(sportId)
        allEvents.push(...events)
      } catch (err) {
        hasPartial = true
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`sportId=${sportId}: ${msg}`)
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
      const url = `${this.brand.baseUrl}sports/events?sportId=1&lang=ro&limit=1`
      await this.fetchJson<EGTEventsResponse>(url)
      return { ok: true, latencyMs: Date.now() - startMs }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, latencyMs: Date.now() - startMs, error: msg }
    }
  }

  // ─── Internal: Fetch Events for a Single Sport ──────────────────────────

  private async fetchSportEvents(sportId: string): Promise<NormalizedEvent[]> {
    const events: NormalizedEvent[] = []
    const limit = 200
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const url = `${this.brand.baseUrl}sports/events?sportId=${sportId}&lang=ro&limit=${limit}&offset=${offset}`

      const response = await this.fetchJson<EGTEventsResponse>(url)

      // EGT may wrap in `data` or return array directly
      const rawEvents: EGTEvent[] = Array.isArray(response)
        ? response
        : (response?.data ?? [])

      if (rawEvents.length === 0) {
        hasMore = false
        continue
      }

      for (const raw of rawEvents) {
        const normalized = this.normalizeEvent(raw, sportId)
        if (normalized) {
          events.push(normalized)
        }
      }

      if (rawEvents.length < limit) {
        hasMore = false
      } else {
        offset += limit
      }

      // Safety cap
      if (offset >= limit * 10) {
        hasMore = false
      }
    }

    return events
  }

  // ─── Internal: Normalize a Single Event ─────────────────────────────────

  private normalizeEvent(raw: EGTEvent, sportId: string): NormalizedEvent | null {
    if (!raw.eventId || !raw.homeTeam || !raw.awayTeam) return null

    // Normalize sport — prefer the numeric ID mapping, fall back to the string field
    const sport = EGT_SPORT_NAME_MAP[sportId] ?? normalizeSport(raw.sport ?? '')

    // Parse the flat odds object
    const odds: NormalizedOdds = {}
    const rawOdds = raw.odds ?? {}

    for (const [marketKey, selections] of Object.entries(rawOdds)) {
      if (!selections || typeof selections !== 'object') continue

      const normalizedMarket = normalizeMarket(marketKey)
      const normalizedSelections: Record<string, number> = {}

      for (const [selKey, selValue] of Object.entries(selections)) {
        const parsed = this.parseOdds(selValue)
        if (parsed === null) continue

        // Normalize selection keys: "home"→"1", "draw"→"X", "away"→"2"
        let selName = selKey.trim()
        const selLower = selName.toLowerCase()
        if (selLower === 'home') selName = '1'
        else if (selLower === 'draw') selName = 'X'
        else if (selLower === 'away') selName = '2'
        else if (selLower === 'over') selName = 'Over'
        else if (selLower === 'under') selName = 'Under'
        else if (selLower === 'yes') selName = 'Yes'
        else if (selLower === 'no') selName = 'No'

        normalizedSelections[selName] = parsed
      }

      if (Object.keys(normalizedSelections).length > 0) {
        odds[normalizedMarket] = normalizedSelections
      }
    }

    // Skip events with no valid odds
    if (Object.keys(odds).length === 0) return null

    const matchTime = this.parseMatchTime(raw.startTime)
    const isClosed = raw.status === 'closed' || raw.status === 'ended'

    return {
      externalId: raw.eventId,
      provider: this.brand.slug,
      sport,
      category: raw.league ?? '',
      tournament: raw.tournament ?? raw.league ?? '',
      homeTeam: normalizeTeamName(raw.homeTeam),
      awayTeam: normalizeTeamName(raw.awayTeam),
      matchTime,
      bettingStatus: !isClosed,
      isLive: raw.isLive === true,
      odds,
    }
  }

  // ─── Internal: Resolve Requested Sports to EGT IDs ──────────────────────

  private resolveSportIds(sports?: string[]): string[] {
    if (sports && sports.length > 0) {
      return sports
        .map((s) => EGT_SPORT_IDS[s] ?? EGT_SPORT_IDS[normalizeSport(s)])
        .filter((id): id is string => id !== undefined)
        .filter((v, i, arr) => arr.indexOf(v) === i)
    }

    // Default: all supported sports
    return ['1', '2', '3', '4']
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────

export function createEGTAdapter(brand: EGTBrand): BookmakerAdapter {
  return new EGTAdapter(brand)
}

export { EGTAdapter }
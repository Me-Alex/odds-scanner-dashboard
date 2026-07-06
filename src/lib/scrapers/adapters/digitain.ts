/**
 * Digitain Platform Adapter
 * Shared by: Winner, MrPlay, Bet7, EliteSlots, 888 (Romania)
 *
 * API: REST JSON (Digitain v3)
 * Events: GET {baseUrl}events?lang=ro&sportId={id}&count=200&offset=0
 * Details: GET {baseUrl}events/{eventId}?lang=ro&marketType=all
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

export interface DigitainBrand {
  name: string
  slug: string
  baseUrl: string
}

export const DIGITAIN_BRANDS: Record<string, DigitainBrand> = {
  winner: {
    name: 'Winner',
    slug: 'winner',
    baseUrl: 'https://winner.ro/api/sport/',
  },
  mrplay: {
    name: 'MrPlay',
    slug: 'mrplay',
    baseUrl: 'https://mrplay.ro/api/sport/',
  },
  bet7: {
    name: 'Bet7',
    slug: 'bet7',
    baseUrl: 'https://bet7.ro/api/sport/',
  },
  eliteslots: {
    name: 'EliteSlots',
    slug: 'eliteslots',
    baseUrl: 'https://eliteslots.ro/api/sport/',
  },
  '888': {
    name: '888sport',
    slug: '888sport',
    baseUrl: 'https://888sport.ro/api/sport/',
  },
}

// ─── Digitain Sport ID Mapping ────────────────────────────────────────────

const DIGITAIN_SPORT_IDS: Record<string, string> = {
  '1': '1',      // Football
  'football': '1',
  '2': '2',      // Basketball
  'basketball': '2',
  '13': '13',    // Tennis
  'tennis': '13',
  '4': '4',      // Ice Hockey
  'ice-hockey': '4',
  '6': '6',      // Handball
  'handball': '6',
  '10': '10',    // Volleyball
  'volleyball': '10',
}

const DIGITAIN_SPORT_NAME_MAP: Record<string, string> = {
  '1': 'football',
  '2': 'basketball',
  '13': 'tennis',
  '4': 'ice-hockey',
  '6': 'handball',
  '10': 'volleyball',
}

// ─── Digitain Response Types ──────────────────────────────────────────────

interface DigitainOutcome {
  name: string
  odds: number
  visible?: boolean
}

interface DigitainMarket {
  type: string
  name?: string
  outcomes: DigitainOutcome[]
}

interface DigitainLeague {
  id?: string
  name: string
  country?: string
}

interface DigitainEvent {
  id: string
  homeName: string
  awayName: string
  startTime: number
  sportId: number
  league?: DigitainLeague
  markets?: DigitainMarket[]
  isLive?: boolean
  status?: string
}

interface DigitainEventsResponse {
  data?: {
    events?: DigitainEvent[]
    total?: number
  }
}

// ─── Adapter Implementation ───────────────────────────────────────────────

class DigitainAdapter extends BaseAdapter {
  readonly config: BookmakerConfig
  private readonly brand: DigitainBrand

  constructor(brand: DigitainBrand) {
    super()
    this.brand = brand

    const sportIds = Object.values(DIGITAIN_SPORT_IDS)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(',')

    this.config = {
      id: `bk-${brand.slug}`,
      name: brand.name,
      slug: brand.slug,
      type: 'rest',
      platform: 'digitain',
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
      const url = `${this.brand.baseUrl}events?lang=ro&sportId=1&count=1&offset=0`
      await this.fetchJson<DigitainEventsResponse>(url)
      return { ok: true, latencyMs: Date.now() - startMs }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, latencyMs: Date.now() - startMs, error: msg }
    }
  }

  // ─── Internal: Fetch Events for a Single Sport ──────────────────────────

  private async fetchSportEvents(sportId: string): Promise<NormalizedEvent[]> {
    const events: NormalizedEvent[] = []
    const batchSize = 200
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const url = `${this.brand.baseUrl}events?lang=ro&sportId=${sportId}&count=${batchSize}&offset=${offset}`

      const response = await this.fetchJson<DigitainEventsResponse>(url)
      const rawEvents = response?.data?.events ?? []

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

      // If we got fewer than batchSize, there are no more pages
      if (rawEvents.length < batchSize) {
        hasMore = false
      } else {
        offset += batchSize
      }

      // Safety: cap at 10 pages per sport to avoid infinite loops
      if (offset >= batchSize * 10) {
        hasMore = false
      }
    }

    return events
  }

  // ─── Internal: Normalize a Single Event ─────────────────────────────────

  private normalizeEvent(raw: DigitainEvent, sportId: string): NormalizedEvent | null {
    if (!raw.id || !raw.homeName || !raw.awayName) return null

    // Normalize sport from Digitain's numeric ID
    const sport = DIGITAIN_SPORT_NAME_MAP[sportId] ?? normalizeSport(String(raw.sportId))

    // Parse odds from markets
    const odds: NormalizedOdds = {}
    const markets = raw.markets ?? []

    for (const market of markets) {
      if (!market.outcomes?.length) continue

      const marketKey = normalizeMarket(market.type)
      const selections: Record<string, number> = {}

      for (const outcome of market.outcomes) {
        // Skip hidden/outcomeless entries
        if (outcome.visible === false) continue

        const parsed = this.parseOdds(outcome.odds)
        if (parsed === null) continue

        // Normalize selection names: "1", "X", "2", "Over", "Under", etc.
        let selName = (outcome.name || '').trim()
        if (selName) {
          // Common mappings
          if (selName === '1' || selName.toLowerCase() === 'home') selName = '1'
          else if (selName === 'X' || selName.toLowerCase() === 'draw') selName = 'X'
          else if (selName === '2' || selName.toLowerCase() === 'away') selName = '2'
          else if (selName.toLowerCase() === 'over' || selName.startsWith('Over')) selName = 'Over'
          else if (selName.toLowerCase() === 'under' || selName.startsWith('Under')) selName = 'Under'
          else if (selName.toLowerCase() === 'yes') selName = 'Yes'
          else if (selName.toLowerCase() === 'no') selName = 'No'
        }

        if (selName) {
          selections[selName] = parsed
        }
      }

      if (Object.keys(selections).length > 0) {
        odds[marketKey] = selections
      }
    }

    // Skip events with no valid odds
    if (Object.keys(odds).length === 0) return null

    const matchTime = this.parseMatchTime(raw.startTime)

    return {
      externalId: raw.id,
      provider: this.brand.slug,
      sport,
      category: raw.league?.name ?? '',
      tournament: raw.league?.name ?? '',
      homeTeam: normalizeTeamName(raw.homeName),
      awayTeam: normalizeTeamName(raw.awayName),
      matchTime,
      bettingStatus: raw.status !== 'closed' && raw.status !== 'ended',
      isLive: raw.isLive === true,
      odds,
    }
  }

  // ─── Internal: Resolve Requested Sports to Digitain IDs ─────────────────

  private resolveSportIds(sports?: string[]): string[] {
    if (sports && sports.length > 0) {
      return sports
        .map((s) => DIGITAIN_SPORT_IDS[s] ?? DIGITAIN_SPORT_IDS[normalizeSport(s)])
        .filter((id): id is string => id !== undefined)
        .filter((v, i, arr) => arr.indexOf(v) === i)
    }

    // Default: all supported sports
    return ['1', '2', '13', '4', '6', '10']
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────

export function createDigitainAdapter(brand: DigitainBrand): BookmakerAdapter {
  return new DigitainAdapter(brand)
}

export { DigitainAdapter }
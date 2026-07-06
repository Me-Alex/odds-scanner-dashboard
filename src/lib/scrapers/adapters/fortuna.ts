/**
 * Fortuna Romania Adapter
 * Type: REST JSON
 * Platform: Kindred (Fortuna uses Kindred platform internally)
 *
 * Endpoints:
 * - Pre-match: GET /api/v1/offer?lang=ro&sportId={id}&count=200
 * - Live:       GET /api/v1/live?lang=ro&sportId={id}&count=200
 */

import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, NormalizedOdds, ScrapingResult } from '../types'
import { BaseAdapter } from '../base-adapter'
import { normalizeSport, normalizeTeamName, normalizeMarket } from '../types'

// ─── Response Types ─────────────────────────────────────────────────────

interface FortunaResult {
  name: string
  odds: number
}

interface FortunaMarket {
  name: string
  results: FortunaResult[]
}

interface FortunaCompetition {
  name: string
}

interface FortunaOffer {
  id: string
  homeName: string
  awayName: string
  startAt: number
  sportId: number
  competition?: FortunaCompetition
  markets: FortunaMarket[]
}

interface FortunaResponse {
  offers: FortunaOffer[]
}

// ─── Sport ID Mapping ───────────────────────────────────────────────────

const FORTUNA_SPORT_IDS: Record<string, number> = {
  football: 1,
  basketball: 2,
  tennis: 13,
  'ice-hockey': 4,
  handball: 6,
}

// ─── Adapter ────────────────────────────────────────────────────────────

class FortunaAdapter extends BaseAdapter implements BookmakerAdapter {
  readonly config: BookmakerConfig = {
    id: 'bk-fortuna',
    name: 'Fortuna',
    slug: 'fortuna',
    type: 'rest',
    platform: 'kindred',
    isActive: true,
    baseUrl: 'https://www.fortuna.ro',
    sports: '1,2,13,4,6',
    timeout: 15000,
    minInterval: 3000,
  }

  async scrape(sports?: string[]): Promise<ScrapingResult> {
    const startMs = Date.now()
    const events: NormalizedEvent[] = []
    let hasError = false
    let errorMessage = ''

    // Determine which sport IDs to fetch
    const sportIds = this.resolveSportIds(sports)

    for (const sportId of sportIds) {
      for (const endpoint of ['offer', 'live']) {
        try {
          const url = `${this.config.baseUrl}/api/v1/${endpoint}?lang=ro&sportId=${sportId}&count=200`
          const data = await this.fetchJson<FortunaResponse>(url)

          if (data.offers && Array.isArray(data.offers)) {
            for (const offer of data.offers) {
              try {
                const event = this.normalizeEvent(offer)
                if (event) events.push(event)
              } catch {
                // Skip malformed individual events
              }
            }
          }
        } catch (err) {
          hasError = true
          errorMessage += `sportId=${sportId}/${endpoint}: ${err instanceof Error ? err.message : String(err)}; `
        }
      }
    }

    const status = hasError ? (events.length > 0 ? 'partial' : 'error') : 'success'
    return this.buildResult(events, status, hasError ? errorMessage.trim() : undefined, startMs)
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const startMs = Date.now()
    try {
      const url = `${this.config.baseUrl}/api/v1/offer?lang=ro&sportId=1&count=1`
      await this.fetchJson<FortunaResponse>(url)
      return { ok: true, latencyMs: Date.now() - startMs }
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - startMs,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private resolveSportIds(sports?: string[]): number[] {
    if (sports && sports.length > 0) {
      const ids: number[] = []
      for (const sport of sports) {
        const id = FORTUNA_SPORT_IDS[sport]
        if (id) ids.push(id)
      }
      return ids.length > 0 ? ids : [1]
    }
    return Object.values(FORTUNA_SPORT_IDS)
  }

  private normalizeEvent(offer: FortunaOffer): NormalizedEvent | null {
    if (!offer.id || !offer.homeName || !offer.awayName) return null

    const odds: NormalizedOdds = {}

    if (offer.markets && Array.isArray(offer.markets)) {
      for (const market of offer.markets) {
        const marketName = normalizeMarket(market.name)
        if (!odds[marketName]) odds[marketName] = {}

        if (market.results && Array.isArray(market.results)) {
          for (const result of market.results) {
            const parsed = this.parseOdds(result.odds)
            if (parsed && result.name) {
              odds[marketName][result.name] = parsed
            }
          }
        }
      }
    }

    // Skip events with no odds
    if (Object.keys(odds).length === 0) return null

    return {
      externalId: String(offer.id),
      provider: this.config.slug,
      sport: normalizeSport(String(offer.sportId)),
      category: offer.competition?.name || 'Unknown',
      tournament: offer.competition?.name || 'Unknown',
      homeTeam: normalizeTeamName(offer.homeName),
      awayTeam: normalizeTeamName(offer.awayName),
      matchTime: this.parseMatchTime(offer.startAt),
      bettingStatus: true,
      isLive: false,
      odds,
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

export function createFortunaAdapter(): BookmakerAdapter {
  return new FortunaAdapter()
}
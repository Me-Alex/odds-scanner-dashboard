/**
 * BetOne Romania Adapter
 * Type: REST JSON
 * Platform: Independent
 *
 * Endpoint:
 * - GET /api/sport/events?lang=ro&sportId={id}&limit=200
 */

import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, NormalizedOdds, ScrapingResult } from '../types'
import { BaseAdapter } from '../base-adapter'
import { normalizeSport, normalizeTeamName, normalizeMarket } from '../types'

// ─── Response Types ─────────────────────────────────────────────────────

interface BetOneMarket {
  type: string
  odds: Record<string, number>
}

interface BetOneEvent {
  id: string
  home: string
  away: string
  date: string
  sport: string
  league: string
  markets: BetOneMarket[]
}

interface BetOneResponse {
  data: BetOneEvent[]
}

// ─── Sport ID Mapping ───────────────────────────────────────────────────

const BETONE_SPORT_IDS: Record<string, number> = {
  football: 1,
  basketball: 2,
  tennis: 13,
}

// ─── Adapter ────────────────────────────────────────────────────────────

class BetOneAdapter extends BaseAdapter implements BookmakerAdapter {
  readonly config: BookmakerConfig = {
    id: 'bk-betone',
    name: 'BetOne',
    slug: 'betone',
    type: 'rest',
    platform: 'independent',
    isActive: true,
    baseUrl: 'https://www.betone.ro',
    sports: '1,2,13',
    timeout: 15000,
    minInterval: 3000,
  }

  async scrape(sports?: string[]): Promise<ScrapingResult> {
    const startMs = Date.now()
    const events: NormalizedEvent[] = []
    let hasError = false
    let errorMessage = ''

    const sportIds = this.resolveSportIds(sports)

    for (const sportId of sportIds) {
      try {
        const url = `${this.config.baseUrl}/api/sport/events?lang=ro&sportId=${sportId}&limit=200`
        const data = await this.fetchJson<BetOneResponse>(url)

        if (data.data && Array.isArray(data.data)) {
          for (const ev of data.data) {
            try {
              const event = this.normalizeEvent(ev)
              if (event) events.push(event)
            } catch {
              // Skip malformed individual events
            }
          }
        }
      } catch (err) {
        hasError = true
        errorMessage += `sportId=${sportId}: ${err instanceof Error ? err.message : String(err)}; `
      }
    }

    const status = hasError ? (events.length > 0 ? 'partial' : 'error') : 'success'
    return this.buildResult(events, status, hasError ? errorMessage.trim() : undefined, startMs)
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const startMs = Date.now()
    try {
      const url = `${this.config.baseUrl}/api/sport/events?lang=ro&sportId=1&limit=1`
      await this.fetchJson<BetOneResponse>(url)
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
        const id = BETONE_SPORT_IDS[sport]
        if (id) ids.push(id)
      }
      return ids.length > 0 ? ids : [1]
    }
    return Object.values(BETONE_SPORT_IDS)
  }

  private normalizeEvent(ev: BetOneEvent): NormalizedEvent | null {
    if (!ev.id || !ev.home || !ev.away) return null

    const odds: NormalizedOdds = {}

    if (ev.markets && Array.isArray(ev.markets)) {
      for (const market of ev.markets) {
        const marketName = normalizeMarket(market.type)
        if (!odds[marketName]) odds[marketName] = {}

        // BetOne uses a flat object: { "1": 1.85, "X": 3.40, "2": 4.50 }
        if (market.odds && typeof market.odds === 'object') {
          for (const [selection, oddsValue] of Object.entries(market.odds)) {
            const parsed = this.parseOdds(oddsValue)
            if (parsed && selection) {
              odds[marketName][selection] = parsed
            }
          }
        }
      }
    }

    if (Object.keys(odds).length === 0) return null

    return {
      externalId: String(ev.id),
      provider: this.config.slug,
      sport: normalizeSport(ev.sport),
      category: ev.league || 'Unknown',
      tournament: ev.league || 'Unknown',
      homeTeam: normalizeTeamName(ev.home),
      awayTeam: normalizeTeamName(ev.away),
      matchTime: this.parseMatchTime(ev.date),
      bettingStatus: true,
      isLive: false,
      odds,
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

export function createBetOneAdapter(): BookmakerAdapter {
  return new BetOneAdapter()
}
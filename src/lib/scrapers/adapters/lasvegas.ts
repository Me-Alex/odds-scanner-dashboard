/**
 * LasVegas Romania Adapter
 * Type: REST JSON
 * Platform: Independent
 *
 * Endpoint:
 * - GET /api/sports/events?lang=ro&sportId={id}&limit=200
 */

import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, NormalizedOdds, ScrapingResult } from '../types'
import { BaseAdapter } from '../base-adapter'
import { normalizeSport, normalizeTeamName, normalizeMarket } from '../types'

// ─── Response Types ─────────────────────────────────────────────────────

interface LasVegasOutcome {
  name: string
  odds: number
}

interface LasVegasMarket {
  name: string
  outcomes: LasVegasOutcome[]
}

interface LasVegasEvent {
  id: string
  homeTeam: string
  awayTeam: string
  date: string
  sport: string
  competition: string
  markets: LasVegasMarket[]
}

interface LasVegasResponse {
  data: LasVegasEvent[]
}

// ─── Sport ID Mapping ───────────────────────────────────────────────────

const LASVEGAS_SPORT_IDS: Record<string, number> = {
  football: 1,
  basketball: 2,
  tennis: 13,
}

// ─── Adapter ────────────────────────────────────────────────────────────

class LasVegasAdapter extends BaseAdapter implements BookmakerAdapter {
  readonly config: BookmakerConfig = {
    id: 'bk-lasvegas',
    name: 'LasVegas',
    slug: 'lasvegas',
    type: 'rest',
    platform: 'independent',
    isActive: true,
    baseUrl: 'https://www.lasvegas.ro',
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
        const url = `${this.config.baseUrl}/api/sports/events?lang=ro&sportId=${sportId}&limit=200`
        const data = await this.fetchJson<LasVegasResponse>(url)

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
      const url = `${this.config.baseUrl}/api/sports/events?lang=ro&sportId=1&limit=1`
      await this.fetchJson<LasVegasResponse>(url)
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
        const id = LASVEGAS_SPORT_IDS[sport]
        if (id) ids.push(id)
      }
      return ids.length > 0 ? ids : [1]
    }
    return Object.values(LASVEGAS_SPORT_IDS)
  }

  private normalizeEvent(ev: LasVegasEvent): NormalizedEvent | null {
    if (!ev.id || !ev.homeTeam || !ev.awayTeam) return null

    const odds: NormalizedOdds = {}

    if (ev.markets && Array.isArray(ev.markets)) {
      for (const market of ev.markets) {
        const marketName = normalizeMarket(market.name)
        if (!odds[marketName]) odds[marketName] = {}

        if (market.outcomes && Array.isArray(market.outcomes)) {
          for (const outcome of market.outcomes) {
            const parsed = this.parseOdds(outcome.odds)
            if (parsed && outcome.name) {
              odds[marketName][outcome.name] = parsed
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
      category: ev.competition || 'Unknown',
      tournament: ev.competition || 'Unknown',
      homeTeam: normalizeTeamName(ev.homeTeam),
      awayTeam: normalizeTeamName(ev.awayTeam),
      matchTime: this.parseMatchTime(ev.date),
      bettingStatus: true,
      isLive: false,
      odds,
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

export function createLasVegasAdapter(): BookmakerAdapter {
  return new LasVegasAdapter()
}
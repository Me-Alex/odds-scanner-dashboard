/**
 * MaxBet Romania Adapter
 * Type: REST JSON
 * Platform: Independent
 *
 * Endpoint:
 * - GET /api/v2/sports/events?sportId={id}&lang=ro&count=200
 */

import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, NormalizedOdds, ScrapingResult } from '../types'
import { BaseAdapter } from '../base-adapter'
import { normalizeSport, normalizeTeamName, normalizeMarket } from '../types'

// ─── Response Types ─────────────────────────────────────────────────────

interface MaxBetSelection {
  name: string
  price: number
}

interface MaxBetMarket {
  type: string
  selections: MaxBetSelection[]
}

interface MaxBetEvent {
  id: string
  homeTeam: string
  awayTeam: string
  startTime: string
  sportId: number
  competition?: string
  markets: MaxBetMarket[]
}

interface MaxBetResponse {
  events: MaxBetEvent[]
}

// ─── Sport ID Mapping ───────────────────────────────────────────────────

const MAXBET_SPORT_IDS: Record<string, number> = {
  football: 1,
  basketball: 2,
  tennis: 13,
}

// ─── Adapter ────────────────────────────────────────────────────────────

class MaxBetAdapter extends BaseAdapter implements BookmakerAdapter {
  readonly config: BookmakerConfig = {
    id: 'bk-maxbet',
    name: 'MaxBet',
    slug: 'maxbet',
    type: 'rest',
    platform: 'independent',
    isActive: true,
    baseUrl: 'https://www.maxbet.ro',
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
        const url = `${this.config.baseUrl}/api/v2/sports/events?sportId=${sportId}&lang=ro&count=200`
        const data = await this.fetchJson<MaxBetResponse>(url)

        if (data.events && Array.isArray(data.events)) {
          for (const ev of data.events) {
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
      const url = `${this.config.baseUrl}/api/v2/sports/events?sportId=1&lang=ro&count=1`
      await this.fetchJson<MaxBetResponse>(url)
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
        const id = MAXBET_SPORT_IDS[sport]
        if (id) ids.push(id)
      }
      return ids.length > 0 ? ids : [1]
    }
    return Object.values(MAXBET_SPORT_IDS)
  }

  private normalizeEvent(ev: MaxBetEvent): NormalizedEvent | null {
    if (!ev.id || !ev.homeTeam || !ev.awayTeam) return null

    const odds: NormalizedOdds = {}

    if (ev.markets && Array.isArray(ev.markets)) {
      for (const market of ev.markets) {
        const marketName = normalizeMarket(market.type)
        if (!odds[marketName]) odds[marketName] = {}

        if (market.selections && Array.isArray(market.selections)) {
          for (const sel of market.selections) {
            const parsed = this.parseOdds(sel.price)
            if (parsed && sel.name) {
              odds[marketName][sel.name] = parsed
            }
          }
        }
      }
    }

    if (Object.keys(odds).length === 0) return null

    return {
      externalId: String(ev.id),
      provider: this.config.slug,
      sport: normalizeSport(String(ev.sportId)),
      category: ev.competition || 'Unknown',
      tournament: ev.competition || 'Unknown',
      homeTeam: normalizeTeamName(ev.homeTeam),
      awayTeam: normalizeTeamName(ev.awayTeam),
      matchTime: this.parseMatchTime(ev.startTime),
      bettingStatus: true,
      isLive: false,
      odds,
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

export function createMaxBetAdapter(): BookmakerAdapter {
  return new MaxBetAdapter()
}
/**
 * Casa Pariurilor Adapter
 * Type: REST JSON
 * Platform: Independent (NSoft-powered)
 *
 * Endpoint:
 * - GET /api/sports/events?language=ro&sportId={id}&pageSize=200
 */

import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, NormalizedOdds, ScrapingResult } from '../types'
import { BaseAdapter } from '../base-adapter'
import { normalizeSport, normalizeTeamName, normalizeMarket } from '../types'

// ─── Response Types ─────────────────────────────────────────────────────

interface CasaSelection {
  selection_name: string
  odds: number
}

interface CasaMarket {
  market_name: string
  selections: CasaSelection[]
}

interface CasaEvent {
  event_id: string
  home_team: string
  away_team: string
  start_time: string
  sport_id: number
  competition_name?: string
  markets: CasaMarket[]
}

interface CasaResponse {
  data: CasaEvent[]
}

// ─── Sport ID Mapping ───────────────────────────────────────────────────

const CASA_SPORT_IDS: Record<string, number> = {
  football: 1,
  basketball: 2,
  tennis: 13,
  'ice-hockey': 4,
}

// ─── Adapter ────────────────────────────────────────────────────────────

class CasaPariurilorAdapter extends BaseAdapter implements BookmakerAdapter {
  readonly config: BookmakerConfig = {
    id: 'bk-casa-pariurilor',
    name: 'Casa Pariurilor',
    slug: 'casa-pariurilor',
    type: 'rest',
    platform: 'nsoft',
    isActive: true,
    baseUrl: 'https://www.casapariurilor.ro',
    sports: '1,2,13,4',
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
        const url = `${this.config.baseUrl}/api/sports/events?language=ro&sportId=${sportId}&pageSize=200`
        const data = await this.fetchJson<CasaResponse>(url)

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
      const url = `${this.config.baseUrl}/api/sports/events?language=ro&sportId=1&pageSize=1`
      await this.fetchJson<CasaResponse>(url)
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
        const id = CASA_SPORT_IDS[sport]
        if (id) ids.push(id)
      }
      return ids.length > 0 ? ids : [1]
    }
    return Object.values(CASA_SPORT_IDS)
  }

  private normalizeEvent(ev: CasaEvent): NormalizedEvent | null {
    if (!ev.event_id || !ev.home_team || !ev.away_team) return null

    const odds: NormalizedOdds = {}

    if (ev.markets && Array.isArray(ev.markets)) {
      for (const market of ev.markets) {
        const marketName = normalizeMarket(market.market_name)
        if (!odds[marketName]) odds[marketName] = {}

        if (market.selections && Array.isArray(market.selections)) {
          for (const sel of market.selections) {
            const parsed = this.parseOdds(sel.odds)
            if (parsed && sel.selection_name) {
              odds[marketName][sel.selection_name] = parsed
            }
          }
        }
      }
    }

    if (Object.keys(odds).length === 0) return null

    return {
      externalId: String(ev.event_id),
      provider: this.config.slug,
      sport: normalizeSport(String(ev.sport_id)),
      category: ev.competition_name || 'Unknown',
      tournament: ev.competition_name || 'Unknown',
      homeTeam: normalizeTeamName(ev.home_team),
      awayTeam: normalizeTeamName(ev.away_team),
      matchTime: this.parseMatchTime(ev.start_time),
      bettingStatus: true,
      isLive: false,
      odds,
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

export function createCasaPariurilorAdapter(): BookmakerAdapter {
  return new CasaPariurilorAdapter()
}
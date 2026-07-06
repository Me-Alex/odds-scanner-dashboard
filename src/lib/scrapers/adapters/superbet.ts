/**
 * Superbet Romania Adapter
 * Type: REST JSON
 * Platform: Kindred (Superbet acquired by Kindred group)
 *
 * Endpoints:
 * - Primary:   GET /api/sports/v1/events?lang=ro&sportId={id}&pageSize=200&offset=0
 * - Fallback:  GET https://api.superbet.ro/offer/v2/events?countryCode=RO&sportId={id}
 */

import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, NormalizedOdds, ScrapingResult } from '../types'
import { BaseAdapter } from '../base-adapter'
import { normalizeSport, normalizeTeamName, normalizeMarket } from '../types'

// ─── Response Types ─────────────────────────────────────────────────────

interface SuperbetPrice {
  decimal: number
}

interface SuperbetResult {
  label: string
  price: SuperbetPrice
}

interface SuperbetMarketInfo {
  name: string
  type?: string
}

interface SuperbetOddsItem {
  market: SuperbetMarketInfo
  results: SuperbetResult[]
}

interface SuperbetCompetition {
  name: string
}

interface SuperbetSport {
  id: number
  name: string
}

interface SuperbetTeam {
  name: string
}

interface SuperbetEvent {
  id: string
  homeTeam: SuperbetTeam
  awayTeam: SuperbetTeam
  startTime: string
  sport: SuperbetSport
  competition?: SuperbetCompetition
  odds: SuperbetOddsItem[]
}

interface SuperbetResponse {
  events: SuperbetEvent[]
}

// ─── Sport ID Mapping ───────────────────────────────────────────────────

const SUPERBET_SPORT_IDS: Record<string, number> = {
  football: 1,
  basketball: 2,
  tennis: 13,
  'ice-hockey': 4,
}

// ─── Adapter ────────────────────────────────────────────────────────────

class SuperbetAdapter extends BaseAdapter implements BookmakerAdapter {
  readonly config: BookmakerConfig = {
    id: 'bk-superbet',
    name: 'Superbet',
    slug: 'superbet',
    type: 'rest',
    platform: 'kindred',
    isActive: true,
    baseUrl: 'https://www.superbet.ro',
    sports: '1,2,13,4',
    timeout: 15000,
    minInterval: 2500,
  }

  async scrape(sports?: string[]): Promise<ScrapingResult> {
    const startMs = Date.now()
    const events: NormalizedEvent[] = []
    let hasError = false
    let errorMessage = ''

    const sportIds = this.resolveSportIds(sports)

    for (const sportId of sportIds) {
      try {
        const url = `${this.config.baseUrl}/api/sports/v1/events?lang=ro&sportId=${sportId}&pageSize=200&offset=0`
        const data = await this.fetchJson<SuperbetResponse>(url)

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
        // Try fallback endpoint
        try {
          const fallbackUrl = `https://api.superbet.ro/offer/v2/events?countryCode=RO&sportId=${sportId}`
          const fallbackData = await this.fetchJson<SuperbetResponse>(fallbackUrl, {
            headers: {
              'Accept': 'application/json',
            },
          })

          if (fallbackData.events && Array.isArray(fallbackData.events)) {
            for (const ev of fallbackData.events) {
              try {
                const event = this.normalizeEvent(ev)
                if (event) events.push(event)
              } catch {
                // Skip malformed individual events
              }
            }
          }
        } catch (fallbackErr) {
          hasError = true
          errorMessage += `sportId=${sportId}: primary=${err instanceof Error ? err.message : String(err)}, fallback=${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}; `
        }
      }
    }

    const status = hasError ? (events.length > 0 ? 'partial' : 'error') : 'success'
    return this.buildResult(events, status, hasError ? errorMessage.trim() : undefined, startMs)
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const startMs = Date.now()
    try {
      const url = `${this.config.baseUrl}/api/sports/v1/events?lang=ro&sportId=1&pageSize=1&offset=0`
      await this.fetchJson<SuperbetResponse>(url)
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
        const id = SUPERBET_SPORT_IDS[sport]
        if (id) ids.push(id)
      }
      return ids.length > 0 ? ids : [1]
    }
    return Object.values(SUPERBET_SPORT_IDS)
  }

  private normalizeEvent(ev: SuperbetEvent): NormalizedEvent | null {
    if (!ev.id || !ev.homeTeam?.name || !ev.awayTeam?.name) return null

    const odds: NormalizedOdds = {}

    if (ev.odds && Array.isArray(ev.odds)) {
      for (const oddsItem of ev.odds) {
        const marketName = normalizeMarket(oddsItem.market.name || oddsItem.market.type || '')
        if (!odds[marketName]) odds[marketName] = {}

        if (oddsItem.results && Array.isArray(oddsItem.results)) {
          for (const result of oddsItem.results) {
            const parsed = this.parseOdds(result.price?.decimal)
            if (parsed && result.label) {
              odds[marketName][result.label] = parsed
            }
          }
        }
      }
    }

    if (Object.keys(odds).length === 0) return null

    const sport = ev.sport?.name ? normalizeSport(ev.sport.name) : 'other'

    return {
      externalId: String(ev.id),
      provider: this.config.slug,
      sport,
      category: ev.competition?.name || 'Unknown',
      tournament: ev.competition?.name || 'Unknown',
      homeTeam: normalizeTeamName(ev.homeTeam.name),
      awayTeam: normalizeTeamName(ev.awayTeam.name),
      matchTime: this.parseMatchTime(ev.startTime),
      bettingStatus: true,
      isLive: false,
      odds,
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

export function createSuperbetAdapter(): BookmakerAdapter {
  return new SuperbetAdapter()
}
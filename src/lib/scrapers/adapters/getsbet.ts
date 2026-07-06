/**
 * GetsBet Romania Adapter
 * Type: WebSocket/WAMP (with REST fallback)
 * Platform: Independent
 *
 * WAMP Protocol (future mini-service implementation):
 * - Connect to wss://www.getsbet.ro/ws
 * - Subscribe to topics: "sports.{sportId}.events", "sports.{sportId}.odds"
 * - Handle WAMP welcome message, then subscribe
 * - Events arrive as WAMP EVENT messages: [EVENT, topicUri, details, payload]
 *
 * Current Implementation: REST Fallback
 * - GET /api/events?sportId={id}&lang=ro
 *
 * NOTE: For production WAMP support, a mini-service should be created in
 * /mini-services/getsbet-ws/ that maintains a persistent WebSocket connection
 * and exposes a REST API for the main app to consume.
 */

import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, NormalizedOdds, ScrapingResult } from '../types'
import { BaseAdapter } from '../base-adapter'
import { normalizeSport, normalizeTeamName, normalizeMarket } from '../types'

// ─── Response Types (REST) ──────────────────────────────────────────────

interface GetsBetEventOdds {
  [market: string]: Record<string, number>
}

interface GetsBetEvent {
  eventId: string
  homeTeam: string
  awayTeam: string
  startTime: number | string
  sportId: number
  league?: string
  odds: GetsBetEventOdds
  isLive?: boolean
}

interface GetsBetResponse {
  events: GetsBetEvent[]
}

// ─── Sport ID Mapping ───────────────────────────────────────────────────

const GETSBET_SPORT_IDS: Record<string, number> = {
  football: 1,
  basketball: 2,
  tennis: 13,
  'ice-hockey': 4,
}

// ─── WAMP Protocol Documentation ─────────────────────────────────────────
//
// GetsBet uses WAMP (WebSocket Application Messaging Protocol) v2.
//
// Connection Flow:
// 1. WebSocket connect to wss://www.getsbet.ro/ws
// 2. Send WAMP HELLO: [1, "realm1", { "roles": { "subscriber": {} } }]
// 3. Receive WAMP WELCOME: [2, sessionId, { "roles": { "broker": {} } }]
// 4. Send WAMP SUBSCRIBE: [5, requestId, {}, "sports.1.events"]
// 5. Receive WAMP SUBSCRIBED: [16, requestId, subscriptionId]
// 6. Receive WAMP EVENT: [36, subscriptionId, publicationId, details, eventPayload]
//
// Event Payload Structure:
// {
//   "eventId": "...",
//   "homeTeam": "FCSB",
//   "awayTeam": "CFR Cluj",
//   "startTime": 1734567890000,
//   "sportId": 1,
//   "league": "Liga 1",
//   "odds": { "1X2": { "1": 1.85, "X": 3.40, "2": 4.50 } },
//   "isLive": false
// }
//
// Topics:
// - "sports.{sportId}.events" — Full event data with odds
// - "sports.{sportId}.odds"   — Odds-only updates (lighter payload)
// - "sports.{sportId}.status"  — Event status changes (started, ended, suspended)
//

// ─── Adapter ────────────────────────────────────────────────────────────

class GetsBetAdapter extends BaseAdapter implements BookmakerAdapter {
  readonly config: BookmakerConfig = {
    id: 'bk-getsbet',
    name: 'GetsBet',
    slug: 'getsbet',
    type: 'websocket',
    platform: 'independent',
    isActive: true,
    baseUrl: 'https://www.getsbet.ro',
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

    // REST fallback implementation
    for (const sportId of sportIds) {
      try {
        const url = `${this.config.baseUrl}/api/events?sportId=${sportId}&lang=ro`
        const data = await this.fetchJson<GetsBetResponse>(url)

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
        errorMessage += `sportId=${sportId} (REST): ${err instanceof Error ? err.message : String(err)}; `
      }
    }

    // TODO: In the future, a mini-service at /mini-services/getsbet-ws/
    // will maintain a persistent WAMP connection and provide a local REST
    // endpoint with cached real-time data. The adapter should check for
    // the mini-service first:
    // try {
    //   const wsData = await this.fetchJson<GetsBetResponse>(
    //     'http://localhost:3004/api/events?sportId=' + sportId
    //   )
    // } catch { /* fall back to direct REST */ }

    const status = hasError ? (events.length > 0 ? 'partial' : 'error') : 'success'
    return this.buildResult(events, status, hasError ? errorMessage.trim() : undefined, startMs)
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const startMs = Date.now()
    try {
      const url = `${this.config.baseUrl}/api/events?sportId=1&lang=ro`
      await this.fetchJson<GetsBetResponse>(url)
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
        const id = GETSBET_SPORT_IDS[sport]
        if (id) ids.push(id)
      }
      return ids.length > 0 ? ids : [1]
    }
    return Object.values(GETSBET_SPORT_IDS)
  }

  private normalizeEvent(ev: GetsBetEvent): NormalizedEvent | null {
    if (!ev.eventId || !ev.homeTeam || !ev.awayTeam) return null

    const odds: NormalizedOdds = {}

    if (ev.odds && typeof ev.odds === 'object') {
      for (const [rawMarket, selections] of Object.entries(ev.odds)) {
        const marketName = normalizeMarket(rawMarket)
        if (!odds[marketName]) odds[marketName] = {}

        if (selections && typeof selections === 'object') {
          for (const [selection, oddsValue] of Object.entries(selections)) {
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
      externalId: String(ev.eventId),
      provider: this.config.slug,
      sport: normalizeSport(String(ev.sportId)),
      category: ev.league || 'Unknown',
      tournament: ev.league || 'Unknown',
      homeTeam: normalizeTeamName(ev.homeTeam),
      awayTeam: normalizeTeamName(ev.awayTeam),
      matchTime: this.parseMatchTime(ev.startTime),
      bettingStatus: true,
      isLive: !!ev.isLive,
      odds,
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

export function createGetsBetAdapter(): BookmakerAdapter {
  return new GetsBetAdapter()
}
/**
 * Betfair Exchange Adapter
 * Platform: Betfair - GraphQL
 * Note: Betfair uses exchange model (back/lay). We extract back prices as bookmaker-equivalent odds.
 */

import { BaseAdapter } from '../base-adapter'
import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, ScrapingResult } from '../types'
import { normalizeSport, normalizeTeamName, normalizeMarket } from '../types'

const BETFAIR_CONFIG: BookmakerConfig = {
  id: 'bk-betfair',
  name: 'Betfair',
  slug: 'betfair',
  type: 'graphql',
  platform: 'independent',
  isActive: true,
  baseUrl: 'https://www.betfair.com/',
  sports: '',
  timeout: 20000,
  minInterval: 5000,
  headers: {
    'Content-Type': 'application/json',
    'Origin': 'https://www.betfair.com',
    'Referer': 'https://www.betfair.com/exchange/plus/',
  },
}

const BETFAIR_QUERY = `
query GetEvents {
  sports {
    events(first: 200) {
      edges {
        node {
          id
          name
          startTime
          venue { name }
          competitions { nodes { name } }
          markets {
            edges {
              node {
                id
                name
                type
                runners {
                  edges {
                    node {
                      id
                      name
                      lastPriceTraded
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`

interface BetfairRunner {
  node: {
    id: string
    name: string
    lastPriceTraded?: number | string
  }
}

interface BetfairMarketNode {
  node: {
    id: string
    name: string
    type?: string
    runners: { edges: BetfairRunner[] }
  }
}

interface BetfairEventNode {
  node: {
    id: string
    name: string
    startTime: string
    venue?: { name: string }
    competitions?: { nodes: { name: string }[] }
    markets: { edges: BetfairMarketNode[] }
  }
}

interface BetfairResponse {
  data?: {
    sports?: {
      events?: {
        edges: BetfairEventNode[]
      }
    }
  }
  errors?: Array<{ message: string }>
}

export class BetfairAdapter extends BaseAdapter implements BookmakerAdapter {
  readonly config = BETFAIR_CONFIG

  async scrape(_sports?: string[]): Promise<ScrapingResult> {
    const startMs = Date.now()

    try {
      const url = `${this.config.baseUrl}graphql`
      const response = await this.fetchJson<BetfairResponse>(url, {
        method: 'POST',
        body: JSON.stringify({ query: BETFAIR_QUERY }),
      })

      if (response.errors?.length) {
        return this.buildResult([], 'error', response.errors.map(e => e.message).join('; '), startMs)
      }

      const events = response.data?.sports?.events?.edges || []
      const normalizedEvents: NormalizedEvent[] = []

      for (const edge of events) {
        const event = this.parseEvent(edge.node)
        if (event) normalizedEvents.push(event)
      }

      return this.buildResult(normalizedEvents, normalizedEvents.length > 0 ? 'success' : 'error', undefined, startMs)
    } catch (err) {
      return this.buildResult([], 'error', String(err), startMs)
    }
  }

  private parseEvent(node: BetfairEventNode['node']): NormalizedEvent | null {
    const name = node.name || ''
    // Parse "FCSB vs CFR Cluj" or "FCSB v CFR Cluj" patterns
    const vsMatch = name.match(/^(.+?)\s+(?:vs\.?|v\.?)\s+(.+)$/i)
    if (!vsMatch) return null

    const homeTeam = vsMatch[1].trim()
    const awayTeam = vsMatch[2].trim()
    if (!homeTeam || !awayTeam) return null

    const matchTime = this.parseMatchTime(node.startTime)
    const competition = node.competitions?.nodes?.[0]?.name || node.venue?.name || ''

    // Infer sport from competition name or use generic
    const sport = this.inferSport(competition, name)

    const odds: NormalizedEvent['odds'] = {}

    for (const marketEdge of node.markets.edges) {
      const market = marketEdge.node
      const marketName = this.normalizeMarketName(market.name, market.type)

      if (!marketName) continue

      const selections: Record<string, number> = {}

      for (const runnerEdge of market.runners.edges) {
        const runner = runnerEdge.node
        const price = this.parseOdds(runner.lastPriceTraded)
        if (!price) continue

        let label = runner.name.trim()
        // Map runner names to standard selections for 1X2
        if (marketName === '1X2') {
          if (label.toLowerCase() === homeTeam.toLowerCase() || label === '1') label = '1'
          else if (label.toLowerCase() === 'draw' || label === 'X') label = 'X'
          else if (label.toLowerCase() === awayTeam.toLowerCase() || label === '2') label = '2'
        } else if (label.toLowerCase() === 'over') label = 'Over'
        else if (label.toLowerCase() === 'under') label = 'Under'

        if (label) selections[label] = price
      }

      if (Object.keys(selections).length > 0) {
        odds[marketName] = selections
      }
    }

    if (Object.keys(odds).length === 0) return null

    return {
      externalId: node.id,
      provider: this.config.slug,
      sport,
      category: competition,
      tournament: competition,
      homeTeam: normalizeTeamName(homeTeam),
      awayTeam: normalizeTeamName(awayTeam),
      matchTime,
      bettingStatus: true,
      isLive: false, // Betfair GraphQL doesn't easily indicate live status
      odds,
    }
  }

  private inferSport(competition: string, eventName: string): string {
    const text = `${competition} ${eventName}`.toLowerCase()
    if (text.includes('football') || text.includes('soccer') || text.includes('premier') || text.includes('liga') || text.includes('serie') || text.includes('bundesliga')) return 'football'
    if (text.includes('basketball') || text.includes('nba') || text.includes('euroleague')) return 'basketball'
    if (text.includes('tennis') || text.includes('atp') || text.includes('wta') || text.includes('open')) return 'tennis'
    if (text.includes('hockey') || text.includes('nhl')) return 'ice-hockey'
    return 'other'
  }

  private normalizeMarketName(name: string, type?: string): string {
    if (!name) return ''
    const lower = name.toLowerCase()
    if (lower.includes('match odds') || lower.includes('1x2') || lower.includes('winner') || type === 'MATCH_ODDS') return '1X2'
    if (lower.includes('over/under') || lower.includes('total')) return 'Over/Under 2.5'
    if (lower.includes('handicap') || lower.includes('spread')) return 'Handicap'
    if (lower.includes('both teams') || lower.includes('btts')) return 'BTTS'
    return name
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now()
    try {
      const url = `${this.config.baseUrl}graphql`
      const response = await this.fetchJson<BetfairResponse>(url, {
        method: 'POST',
        body: JSON.stringify({ query: '{ __typename }' }),
      })
      const ok = !response.errors?.length
      return { ok, latencyMs: Date.now() - start, error: ok ? undefined : 'GraphQL errors' }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: String(err) }
    }
  }
}

export function createBetfairAdapter(): BookmakerAdapter {
  return new BetfairAdapter()
}
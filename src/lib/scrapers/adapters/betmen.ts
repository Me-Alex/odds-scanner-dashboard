/**
 * Betmen Romania Adapter
 * Type: HTML Scraping (no public JSON API)
 * Platform: Independent
 *
 * Strategy:
 * - Fetch HTML pages for each sport category
 * - Parse using regex/string matching (no DOMParser in edge runtime)
 * - Look for common Romanian betting site HTML patterns
 * - Fallback gracefully if HTML structure changes
 *
 * Pages:
 * - Football:  /sport/fotbal
 * - Basketball: /sport/baschet
 * - Tennis:    /sport/tenis
 */

import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, NormalizedOdds, ScrapingResult } from '../types'
import { BaseAdapter } from '../base-adapter'
import { normalizeSport, normalizeTeamName, normalizeMarket } from '../types'

// ─── Parsed Event (intermediate) ────────────────────────────────────────

interface ParsedBetmenEvent {
  id: string
  homeTeam: string
  awayTeam: string
  matchTime: string
  sport: string
  competition: string
  odds: NormalizedOdds
}

// ─── Sport → URL Path Mapping ───────────────────────────────────────────

const BETMEN_SPORT_PATHS: Record<string, string> = {
  football: '/sport/fotbal',
  basketball: '/sport/baschet',
  tennis: '/sport/tenis',
}

// ─── Adapter ────────────────────────────────────────────────────────────

class BetmenAdapter extends BaseAdapter implements BookmakerAdapter {
  readonly config: BookmakerConfig = {
    id: 'bk-betmen',
    name: 'Betmen',
    slug: 'betmen',
    type: 'html',
    platform: 'independent',
    isActive: true,
    baseUrl: 'https://www.betmen.ro',
    sports: 'football,basketball,tennis',
    timeout: 20000,
    minInterval: 5000,
  }

  async scrape(sports?: string[]): Promise<ScrapingResult> {
    const startMs = Date.now()
    const events: NormalizedEvent[] = []
    let hasError = false
    let errorMessage = ''

    const sportList = sports && sports.length > 0
      ? sports.filter(s => BETMEN_SPORT_PATHS[s])
      : Object.keys(BETMEN_SPORT_PATHS)

    for (const sport of sportList) {
      const path = BETMEN_SPORT_PATHS[sport]
      if (!path) continue

      try {
        const url = `${this.config.baseUrl}${path}`
        const html = await this.fetchHtml(url)
        const parsed = this.parseHtmlEvents(html, sport)
        events.push(...parsed)
      } catch (err) {
        hasError = true
        errorMessage += `${sport}: ${err instanceof Error ? err.message : String(err)}; `
      }
    }

    const status = hasError ? (events.length > 0 ? 'partial' : 'error') : 'success'
    return this.buildResult(events, status, hasError ? errorMessage.trim() : undefined, startMs)
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const startMs = Date.now()
    try {
      const url = `${this.config.baseUrl}/sport/fotbal`
      const html = await this.fetchHtml(url)
      const ok = html.length > 1000
      return {
        ok,
        latencyMs: Date.now() - startMs,
        error: ok ? undefined : 'Received empty or very short response',
      }
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - startMs,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // ─── HTML Parsing ─────────────────────────────────────────────────────

  /**
   * Parse HTML content and extract betting events.
   * Uses regex-based extraction since DOMParser is not available in edge runtime.
   *
   * Looks for common patterns in Romanian betting sites:
   * 1. Data attributes: data-event-id, data-team, data-odds
   * 2. JSON-LD or inline JSON data blocks
   * 3. Structured HTML patterns with class names
   */
  private parseHtmlEvents(html: string, sport: string): NormalizedEvent[] {
    const events: NormalizedEvent[] = []

    // Strategy 1: Look for embedded JSON data (common in Next.js/React SPAs)
    // Pattern: <script id="__NEXT_DATA__" ...> or <script type="application/ld+json">
    const jsonBlocks = this.extractJsonBlocks(html)
    for (const block of jsonBlocks) {
      try {
        const extracted = this.extractEventsFromJson(block, sport)
        events.push(...extracted)
      } catch {
        // Not parseable JSON or different structure
      }
    }

    // Strategy 2: Look for data attributes in HTML elements
    const dataAttrEvents = this.extractFromDataAttributes(html, sport)
    events.push(...dataAttrEvents)

    // Strategy 3: Look for common HTML table/list patterns
    const tableEvents = this.extractFromTablePatterns(html, sport)
    events.push(...tableEvents)

    // Deduplicate by externalId
    const seen = new Set<string>()
    return events.filter(ev => {
      if (seen.has(ev.externalId)) return false
      seen.add(ev.externalId)
      return true
    })
  }

  /**
   * Extract JSON blocks from HTML (script tags with JSON content)
   */
  private extractJsonBlocks(html: string): object[] {
    const blocks: object[] = []

    // Match <script> tags containing JSON-like content
    const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi
    let match: RegExpExecArray | null

    while ((match = scriptPattern.exec(html)) !== null) {
      const content = match[1].trim()
      if (!content || content.length < 50) continue

      // Try to parse as JSON (skip JavaScript code)
      if (content.startsWith('{') || content.startsWith('[')) {
        try {
          const parsed = JSON.parse(content)
          blocks.push(parsed)
        } catch {
          // Not valid JSON, skip
        }
      }
    }

    return blocks
  }

  /**
   * Try to extract events from a parsed JSON object
   */
  private extractEventsFromJson(obj: object, sport: string): NormalizedEvent[] {
    const events: NormalizedEvent[] = []

    // Recursively search for arrays of objects that look like events
    const searchObject = (current: unknown, depth: number): void => {
      if (depth > 10 || !current || typeof current !== 'object') return

      if (Array.isArray(current)) {
        for (const item of current) {
          if (this.looksLikeEvent(item)) {
            const ev = this.tryNormalizeJsonEvent(item, sport)
            if (ev) events.push(ev)
          } else {
            searchObject(item, depth + 1)
          }
        }
      } else {
        for (const value of Object.values(current as Record<string, unknown>)) {
          if (Array.isArray(value)) {
            searchObject(value, depth + 1)
          }
        }
      }
    }

    searchObject(obj, 0)
    return events
  }

  /**
   * Check if an object looks like a betting event
   */
  private looksLikeEvent(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
    const record = obj as Record<string, unknown>

    // Must have at least two team-like fields and odds-like fields
    const teamFields = Object.keys(record).filter(k =>
      /team|home|away|participant/i.test(k)
    )
    const hasOdds = Object.keys(record).some(k =>
      /odds|price|selection|market/i.test(k)
    )

    return teamFields.length >= 2 || (teamFields.length >= 1 && hasOdds)
  }

  /**
   * Try to normalize a JSON object into a NormalizedEvent
   */
  private tryNormalizeJsonEvent(obj: unknown, sport: string): NormalizedEvent | null {
    if (!obj || typeof obj !== 'object') return null
    const record = obj as Record<string, unknown>

    // Extract team names from various possible field names
    const homeTeam = this.extractStringField(record, ['homeTeam', 'home_team', 'home', 'homeName', 'participant1', 'team1', 'player1'])
    const awayTeam = this.extractStringField(record, ['awayTeam', 'away_team', 'away', 'awayName', 'participant2', 'team2', 'player2'])
    if (!homeTeam || !awayTeam) return null

    // Extract ID
    const id = this.extractStringField(record, ['id', 'eventId', 'event_id', 'matchId', 'fixtureId']) || `bm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // Extract competition
    const competition = this.extractStringField(record, ['competition', 'competition_name', 'league', 'tournament', 'category', 'championship']) || 'Unknown'

    // Extract match time
    const rawTime = this.extractAnyField(record, ['startTime', 'start_time', 'date', 'matchTime', 'kickoff', 'time'])
    const matchTime = this.parseMatchTime(rawTime as string | number | null)

    // Extract odds
    const odds: NormalizedOdds = this.extractOddsFromJson(record)

    if (Object.keys(odds).length === 0) return null

    return {
      externalId: String(id),
      provider: this.config.slug,
      sport: normalizeSport(sport),
      category: competition,
      tournament: competition,
      homeTeam: normalizeTeamName(homeTeam),
      awayTeam: normalizeTeamName(awayTeam),
      matchTime,
      bettingStatus: true,
      isLive: false,
      odds,
    }
  }

  /**
   * Extract events from data-* attributes in HTML elements
   */
  private extractFromDataAttributes(html: string, sport: string): NormalizedEvent[] {
    const events: NormalizedEvent[] = []

    // Look for elements with data-event-id or data-match-id
    const eventPattern = /data-event-id=["']([^"']+)["'][^>]*?/gi
    let match: RegExpExecArray | null

    while ((match = eventPattern.exec(html)) !== null) {
      const eventId = match[1]
      // Get the surrounding HTML context (up to 2000 chars after the match)
      const start = match.index
      const context = html.slice(start, start + 2000)

      const homeTeam = this.extractDataAttr(context, 'home-team', 'homeTeam', 'home')
      const awayTeam = this.extractDataAttr(context, 'away-team', 'awayTeam', 'away')
      if (!homeTeam || !awayTeam) continue

      const competition = this.extractDataAttr(context, 'competition', 'league', 'tournament') || 'Unknown'
      const rawTime = this.extractDataAttr(context, 'start-time', 'date', 'time') || ''
      const matchTime = this.parseMatchTime(rawTime)

      const odds: NormalizedOdds = {}
      this.extractOddsFromDataAttrs(context, odds)

      if (Object.keys(odds).length === 0) continue

      events.push({
        externalId: eventId,
        provider: this.config.slug,
        sport: normalizeSport(sport),
        category: competition,
        tournament: competition,
        homeTeam: normalizeTeamName(homeTeam),
        awayTeam: normalizeTeamName(awayTeam),
        matchTime,
        bettingStatus: true,
        isLive: false,
        odds,
      })
    }

    return events
  }

  /**
   * Extract events from common HTML table/list patterns
   * This is a best-effort parser for typical betting site structures
   */
  private extractFromTablePatterns(html: string, sport: string): NormalizedEvent[] {
    const events: NormalizedEvent[] = []

    // Pattern: Find rows/containers that contain decimal odds (e.g., 1.85, 3.40)
    // Split HTML into potential event containers
    // Look for repeated patterns of team names + decimal numbers

    // Strategy: Find all segments that look like event blocks
    // A block typically has: time, team1 vs team2, and decimal odds
    const eventBlockPattern = /(?:class|data)[^>]*(?:match|event|game|fixture)[^>]*>([\s\S]*?)(?=(?:class|data)[^>]*(?:match|event|game|fixture)[^>]*>|$)/gi
    let blockMatch: RegExpExecArray | null

    while ((blockMatch = eventBlockPattern.exec(html)) !== null) {
      const block = blockMatch[1]

      // Extract team names: look for text content that looks like team names
      // Typically two names separated by "vs", "-", or in adjacent elements
      const teams = this.extractTeamsFromBlock(block)
      if (!teams) continue

      const odds: NormalizedOdds = {}
      this.extractOddsFromText(block, odds)

      if (Object.keys(odds).length === 0) continue

      // Extract time from the block
      const timeMatch = block.match(/(\d{1,2}:\d{2})/)
      const dateMatch = block.match(/(\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4})/)
      let matchTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      if (timeMatch && dateMatch) {
        matchTime = this.parseMatchTime(`${dateMatch[1]} ${timeMatch[1]}`)
      } else if (timeMatch) {
        matchTime = this.parseMatchTime(`2025-01-01T${timeMatch[1]}`)
      }

      // Extract competition from surrounding context
      const compMatch = block.match(/(?:class|data)[^>]*(?:league|competition|championship)[^>]*>([^<]*)</i)
      const competition = compMatch ? compMatch[1].trim() : 'Unknown'

      events.push({
        externalId: `bm-html-${teams.home.slice(0, 10).replace(/\s/g, '')}-${Date.now().toString(36)}`,
        provider: this.config.slug,
        sport: normalizeSport(sport),
        category: competition,
        tournament: competition,
        homeTeam: normalizeTeamName(teams.home),
        awayTeam: normalizeTeamName(teams.away),
        matchTime,
        bettingStatus: true,
        isLive: false,
        odds,
      })
    }

    return events
  }

  // ─── Parsing Utility Methods ──────────────────────────────────────────

  private extractStringField(obj: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const val = obj[key]
      if (typeof val === 'string' && val.trim()) return val.trim()
    }
    return null
  }

  private extractAnyField(obj: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null) return obj[key]
    }
    return null
  }

  private extractDataAttr(html: string, ...attrNames: string[]): string | null {
    for (const attr of attrNames) {
      // Try data-attr-name="value" pattern
      const pattern = new RegExp(`data-${attr.replace(/([A-Z])/g, '-$1').toLowerCase()}=["']([^"']+)["']`, 'i')
      const match = html.match(pattern)
      if (match && match[1].trim()) return match[1].trim()
    }
    return null
  }

  private extractOddsFromDataAttrs(html: string, odds: NormalizedOdds): void {
    // Look for data-odds or data-price attributes
    const oddsPattern = /data-(?:odds|price|selection)[-]?(\w+)?=["'](\d+(?:\.\d+)?)["']/gi
    let match: RegExpExecArray | null

    while ((match = oddsPattern.exec(html)) !== null) {
      const selection = match[1] || ''
      const value = this.parseOdds(match[2])
      if (value && selection) {
        if (!odds['1X2']) odds['1X2'] = {}
        odds['1X2'][selection.toUpperCase()] = value
      }
    }
  }

  private extractOddsFromJson(record: Record<string, unknown>): NormalizedOdds {
    const odds: NormalizedOdds = {}

    // Look for markets array or odds object
    const markets = this.extractAnyField(record, ['markets', 'odds', 'selections', 'outcomes'])

    if (Array.isArray(markets)) {
      for (const market of markets) {
        if (!market || typeof market !== 'object') continue
        const m = market as Record<string, unknown>

        const marketName = normalizeMarket(
          this.extractStringField(m, ['name', 'type', 'marketName', 'market_name']) || ''
        )
        if (!marketName || marketName === 'Other') continue
        if (!odds[marketName]) odds[marketName] = {}

        const selections = m.selections || m.results || m.outcomes || m.options
        if (Array.isArray(selections)) {
          for (const sel of selections) {
            if (!sel || typeof sel !== 'object') continue
            const s = sel as Record<string, unknown>
            const name = this.extractStringField(s, ['name', 'label', 'selection_name', 'type'])
            const price = this.extractAnyField(s, ['odds', 'price', 'value', 'decimal'])
            const parsed = this.parseOdds(price as string | number | null | undefined)
            if (parsed && name) {
              odds[marketName][name] = parsed
            }
          }
        }

        // Also check for flat odds object: { "1": 1.85, "X": 3.40, "2": 4.50 }
        if (typeof m.odds === 'object' && !Array.isArray(m.odds)) {
          for (const [key, val] of Object.entries(m.odds as Record<string, unknown>)) {
            const parsed = this.parseOdds(val as string | number | null | undefined)
            if (parsed) odds[marketName][key] = parsed
          }
        }
      }
    } else if (markets && typeof markets === 'object' && !Array.isArray(markets)) {
      // Flat odds object at event level
      for (const [marketKey, marketVal] of Object.entries(markets as Record<string, unknown>)) {
        const marketName = normalizeMarket(marketKey)
        if (!odds[marketName]) odds[marketName] = {}

        if (typeof marketVal === 'object' && marketVal !== null && !Array.isArray(marketVal)) {
          for (const [sel, val] of Object.entries(marketVal as Record<string, unknown>)) {
            const parsed = this.parseOdds(val as string | number | null | undefined)
            if (parsed) odds[marketName][sel] = parsed
          }
        }
      }
    }

    return odds
  }

  /**
   * Extract team names from an HTML block using text content analysis
   */
  private extractTeamsFromBlock(block: string): { home: string; away: string } | null {
    // Remove HTML tags but keep text content
    const text = block
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '|')
      .replace(/\|+/g, '|')
      .replace(/[|]\s*[|]/g, '|')
      .split('|')
      .map(s => s.trim())
      .filter(s => s.length > 2 && s.length < 50)

    // Look for pairs of text that look like team names
    // Team names typically: start with uppercase, 2-30 chars, no numbers
    const teamPattern = /^[A-Z][A-Za-zĂÂÎȘȚăâîșț\s\-\.']{1,30}$/
    const candidates = text.filter(t => teamPattern.test(t))

    if (candidates.length >= 2) {
      // Look for "vs" separator
      const vsIndex = candidates.findIndex(c => /^vs$/i.test(c))
      if (vsIndex > 0 && vsIndex < candidates.length - 1) {
        return { home: candidates[vsIndex - 1], away: candidates[vsIndex + 1] }
      }
      // Look for "-" separator
      const dashIndex = candidates.findIndex(c => /^[-–]$/i.test(c))
      if (dashIndex > 0 && dashIndex < candidates.length - 1) {
        return { home: candidates[dashIndex - 1], away: candidates[dashIndex + 1] }
      }
      // Use first two candidates
      return { home: candidates[0], away: candidates[1] }
    }

    return null
  }

  /**
   * Extract odds values from text content
   */
  private extractOddsFromText(text: string, odds: NormalizedOdds): void {
    // Find decimal odds patterns (e.g., 1.85, 3.40, 4.50, 10.00)
    // Must be > 1.0 to be valid odds
    const oddsPattern = /\b(\d+\.\d{2})\b/g
    const found: number[] = []
    let match: RegExpExecArray | null

    while ((match = oddsPattern.exec(text)) !== null) {
      const val = parseFloat(match[1])
      if (val > 1.01 && val < 1000) {
        found.push(val)
      }
    }

    // If we found exactly 3 odds, assume 1X2
    if (found.length === 3) {
      if (!odds['1X2']) odds['1X2'] = {}
      const labels = ['1', 'X', '2']
      for (let i = 0; i < 3; i++) {
        odds['1X2'][labels[i]] = found[i]
      }
    } else if (found.length === 2) {
      // Could be Over/Under
      if (!odds['Over/Under 2.5']) odds['Over/Under 2.5'] = {}
      odds['Over/Under 2.5']['Over'] = found[0]
      odds['Over/Under 2.5']['Under'] = found[1]
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

export function createBetmenAdapter(): BookmakerAdapter {
  return new BetmenAdapter()
}
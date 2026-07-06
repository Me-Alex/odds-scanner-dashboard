/**
 * Base Bookmaker Adapter
 * All bookmaker adapters extend this class for common functionality.
 */

import type { BookmakerAdapter, BookmakerConfig, NormalizedEvent, NormalizedOdds, ScrapingResult, ScrapingStatus } from './types'

export abstract class BaseAdapter implements BookmakerAdapter {
  abstract readonly config: BookmakerConfig

  abstract scrape(sports?: string[]): Promise<ScrapingResult>

  abstract testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }>

  // ─── Common Helpers ──────────────────────────────────────────────────

  protected async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
        ...this.config.headers,
        ...(options?.headers as Record<string, string> || {}),
      }

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return (await response.json()) as T
    } finally {
      clearTimeout(timeout)
    }
  }

  protected async fetchHtml(url: string): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const headers: Record<string, string> = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
        ...this.config.headers,
      }

      const response = await fetch(url, {
        signal: controller.signal,
        headers,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.text()
    } finally {
      clearTimeout(timeout)
    }
  }

  protected buildResult(events: NormalizedEvent[], status: ScrapingStatus, error?: string, startMs?: number): ScrapingResult {
    return {
      provider: this.config.slug,
      status,
      events,
      eventsFound: events.length,
      durationMs: startMs ? Date.now() - startMs : 0,
      error,
    }
  }

  /** Extract numeric odds from various formats (string "1.85", "+150", "-110") */
  protected parseOdds(raw: string | number | null | undefined): number | null {
    if (raw == null) return null
    const str = String(raw).trim()
    if (!str || str === '-' || str === 'N/A' || str === '0' || str === '0.0') return null

    const num = parseFloat(str.replace(',', '.'))
    if (isNaN(num) || num <= 1.0) return null
    return Math.round(num * 100) / 100
  }

  /** Extract a reasonable match time from various formats */
  protected parseMatchTime(raw: string | number | null): string {
    if (!raw) return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    // Already ISO string
    if (typeof raw === 'string' && raw.includes('T') && raw.includes('-')) {
      try { return new Date(raw).toISOString() } catch { /* fall through */ }
    }

    // Unix timestamp (seconds or ms)
    if (typeof raw === 'number') {
      const ms = raw > 1e12 ? raw : raw * 1000
      return new Date(ms).toISOString()
    }

    // Try parsing as date
    if (typeof raw === 'string') {
      // Try YYYY-MM-DD HH:mm
      const dateMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/)
      if (dateMatch) {
        return new Date(
          parseInt(dateMatch[1]),
          parseInt(dateMatch[2]) - 1,
          parseInt(dateMatch[3]),
          parseInt(dateMatch[4]),
          parseInt(dateMatch[5])
        ).toISOString()
      }

      // Try DD.MM.YYYY
      const euMatch = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/)
      if (euMatch) {
        return new Date(
          parseInt(euMatch[3]),
          parseInt(euMatch[2]) - 1,
          parseInt(euMatch[1])
        ).toISOString()
      }
    }

    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }

  /** Build an oddsSnapshot JSON string for DB storage */
  protected buildOddsSnapshot(event: NormalizedEvent): string {
    return JSON.stringify(event.odds)
  }

  /** Count total odds in an event */
  protected countOdds(odds: NormalizedOdds): number {
    let count = 0
    for (const market of Object.values(odds)) {
      count += Object.keys(market).length
    }
    return count
  }
}
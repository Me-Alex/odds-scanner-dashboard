/**
 * Bookmaker Adapter Registry
 * Central registry for all bookmaker adapters.
 * Manages adapter instances and provides lookup by slug/id.
 */

import type { BookmakerAdapter, BookmakerConfig } from './types'
import { createDigitainAdapter, DIGITAIN_BRANDS } from './adapters/digitain'
import { createNsoftAdapter, NSOFT_BRANDS } from './adapters/nsoft'
import { createEGTAdapter, EGT_BRANDS } from './adapters/egt'
import { createKindredAdapter } from './adapters/kindred'
import { createSportifyAdapter } from './adapters/sportify'
import { createFortunaAdapter } from './adapters/fortuna'
import { createCasaPariurilorAdapter } from './adapters/casa-pariurilor'
import { createSuperbetAdapter } from './adapters/superbet'
import { createBetOneAdapter } from './adapters/betone'
import { createGetsBetAdapter } from './adapters/getsbet'
import { createLasVegasAdapter } from './adapters/lasvegas'
import { createMaxBetAdapter } from './adapters/maxbet'
import { createBetmenAdapter } from './adapters/betmen'
import { createBetanoAdapter } from './adapters/betano'
import { createBetfairAdapter } from './adapters/betfair'
import { createTheOddsApiAdapter } from './adapters/the-odds-api'

// ─── Adapter Entry ──────────────────────────────────────────────────────

export interface AdapterEntry {
  adapter: BookmakerAdapter
  config: BookmakerConfig
  bookmakerId: string  // matches Bookmaker table id, e.g. 'bk-fortuna'
  enabled: boolean
  lastScrapeAt?: number
  lastError?: string
}

// ─── Registry ───────────────────────────────────────────────────────────

class AdapterRegistry {
  private adapters: Map<string, AdapterEntry> = new Map()

  register(entry: AdapterEntry): void {
    this.adapters.set(entry.bookmakerId, entry)
  }

  get(bookmakerId: string): AdapterEntry | undefined {
    return this.adapters.get(bookmakerId)
  }

  getBySlug(slug: string): AdapterEntry | undefined {
    for (const entry of Array.from(this.adapters.values())) {
      if (entry.config.slug === slug) return entry
    }
    return undefined
  }

  getAll(): AdapterEntry[] {
    return Array.from(this.adapters.values())
  }

  getEnabled(): AdapterEntry[] {
    return this.getAll().filter(e => e.enabled)
  }

  getByPlatform(platform: string): AdapterEntry[] {
    return this.getAll().filter(e => e.config.platform === platform)
  }

  size(): number {
    return this.adapters.size
  }

  updateStatus(bookmakerId: string, status: { lastScrapeAt?: number; lastError?: string; enabled?: boolean }): void {
    const entry = this.adapters.get(bookmakerId)
    if (!entry) return
    if (status.lastScrapeAt !== undefined) entry.lastScrapeAt = status.lastScrapeAt
    if (status.lastError !== undefined) entry.lastError = status.lastError
    if (status.enabled !== undefined) entry.enabled = status.enabled
  }
}

// ─── Default Registry ───────────────────────────────────────────────────

function createDefaultRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry()

  // ─── Digitain Platform ──────────────────────────────────────────────
  for (const brand of Object.values(DIGITAIN_BRANDS)) {
    const adapter = createDigitainAdapter(brand)
    const config = adapter.config
    registry.register({
      adapter,
      config,
      bookmakerId: config.id,
      enabled: config.isActive,
    })
  }

  // ─── nSoft Platform ─────────────────────────────────────────────────
  for (const brand of Object.values(NSOFT_BRANDS)) {
    const adapter = createNsoftAdapter(brand)
    const config = adapter.config
    registry.register({
      adapter,
      config,
      bookmakerId: config.id,
      enabled: config.isActive,
    })
  }

  // ─── EGT Platform ───────────────────────────────────────────────────
  for (const brand of Object.values(EGT_BRANDS)) {
    const adapter = createEGTAdapter(brand)
    const config = adapter.config
    registry.register({
      adapter,
      config,
      bookmakerId: config.id,
      enabled: config.isActive,
    })
  }

  // ─── Individual Bookmakers ──────────────────────────────────────────

  const individualAdapters: BookmakerAdapter[] = [
    createKindredAdapter(),      // Unibet
    createSportifyAdapter(),     // NetBet
    createFortunaAdapter(),
    createCasaPariurilorAdapter(),
    createSuperbetAdapter(),
    createBetOneAdapter(),
    createGetsBetAdapter(),
    createLasVegasAdapter(),
    createMaxBetAdapter(),
    createBetmenAdapter(),
    createBetanoAdapter(),
    createBetfairAdapter(),
    createTheOddsApiAdapter(),   // Aggregator (PRIMARY)
  ]

  for (const adapter of individualAdapters) {
    const config = adapter.config
    registry.register({
      adapter,
      config,
      bookmakerId: config.id,
      enabled: config.isActive,
    })
  }

  return registry
}

// ─── Singleton ──────────────────────────────────────────────────────────

let _registry: AdapterRegistry | null = null

export function getRegistry(): AdapterRegistry {
  if (!_registry) {
    _registry = createDefaultRegistry()
  }
  return _registry
}

export function resetRegistry(): void {
  _registry = null
}

// ─── Convenience ────────────────────────────────────────────────────────

export function getEnabledAdapters(): AdapterEntry[] {
  return getRegistry().getEnabled()
}

export function getAdapterBySlug(slug: string): AdapterEntry | undefined {
  return getRegistry().getBySlug(slug)
}

export function getAllAdapterConfigs(): BookmakerConfig[] {
  return getRegistry().getAll().map(e => e.config)
}
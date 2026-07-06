// ─── Arb Desk Scraper System ────────────────────────────────────────────
// Barrel export for all scraper modules.

// Types
export * from './types'

// Base
export { BaseAdapter } from './base-adapter'

// Registry
export { getRegistry, getEnabledAdapters, getAdapterBySlug, getAllAdapterConfigs, resetRegistry } from './registry'
export type { AdapterEntry } from './registry'

// Engine
export { scrapeAll, scrapeSingle, detectArbitrages, testAdapter, testAllAdapters, clearOddsCache } from './scraping-engine'
export type { FullScrapeResult } from './scraping-engine'
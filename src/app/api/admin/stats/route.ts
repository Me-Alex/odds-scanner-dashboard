import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/auth'
import * as D1 from '@/lib/cloudflare-db'

function isCF(): boolean {
  try {
    // @ts-expect-error
    return typeof process === 'undefined' || !process.versions?.node
  } catch {
    return true
  }
}

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request)

    if (isCF()) {
      return await handleStatsD1()
    }
    return await handleStatsPrisma()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}

// ─── D1 Implementation ────────────────────────────────────────────────

async function handleStatsD1() {
  const db = await D1.getD1()
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const [totalUsers, activeUsers, proUsers, enterpriseUsers, totalBets, totalArbs, recentScrapes, newUsersToday] =
    await Promise.all([
      D1.countUsers(db),
      D1.countActiveUsers(db),
      D1.countUsersByTier(db, 'pro'),
      D1.countUsersByTier(db, 'enterprise'),
      D1.countBets(db),
      D1.countArbs(db),
      D1.countRecentScrapes(db, yesterday),
      D1.countNewUsersSince(db, startOfToday),
    ])

  return NextResponse.json({
    stats: {
      totalUsers,
      activeUsers,
      proUsers,
      enterpriseUsers,
      totalBets,
      totalArbs,
      recentScrapes,
      newUsersToday,
    },
  })
}

// ─── Prisma Implementation (Local Dev) ────────────────────────────────

async function handleStatsPrisma() {
  const { db } = await import('@/lib/db')

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    activeUsers,
    proUsers,
    enterpriseUsers,
    totalBets,
    totalArbs,
    recentScrapes,
    newUsersToday,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { isActive: true } }),
    db.user.count({ where: { subscriptionTier: 'pro', isActive: true } }),
    db.user.count({ where: { subscriptionTier: 'enterprise', isActive: true } }),
    db.betJournal.count(),
    db.arbAlert.count(),
    db.scrapingLog.count({ where: { createdAt: { gte: yesterday } } }),
    db.user.count({ where: { createdAt: { gte: startOfToday } } }),
  ])

  return NextResponse.json({
    stats: {
      totalUsers,
      activeUsers,
      proUsers,
      enterpriseUsers,
      totalBets,
      totalArbs,
      recentScrapes,
      newUsersToday,
    },
  })
}
import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request)

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}
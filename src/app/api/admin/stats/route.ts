import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

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
      db.scrapingLog.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      db.user.count({ where: { createdAt: { gte: today } } }),
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
  } catch (error) {
    console.error('Admin stats fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
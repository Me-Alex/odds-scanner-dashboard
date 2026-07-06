import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    const user = await requireAuthFromRequest(request)

    try {
      // D1 first
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      // Overall stats
      const totalResult = await db
        .prepare('SELECT COUNT(*) as count FROM Bet WHERE userId = ?')
        .bind(user.id)
        .first<{ count: number }>()
      const totalBets = totalResult?.count ?? 0

      const wonResult = await db
        .prepare("SELECT COUNT(*) as count FROM Bet WHERE userId = ? AND result = 'won'")
        .bind(user.id)
        .first<{ count: number }>()
      const wonBets = wonResult?.count ?? 0

      const lostResult = await db
        .prepare("SELECT COUNT(*) as count FROM Bet WHERE userId = ? AND result = 'lost'")
        .bind(user.id)
        .first<{ count: number }>()
      const lostBets = lostResult?.count ?? 0

      const pendingResult = await db
        .prepare("SELECT COUNT(*) as count FROM Bet WHERE userId = ? AND result = 'pending'")
        .bind(user.id)
        .first<{ count: number }>()
      const pendingBets = pendingResult?.count ?? 0

      // Financials
      const stakeResult = await db
        .prepare('SELECT COALESCE(SUM(stake), 0) as total FROM Bet WHERE userId = ?')
        .bind(user.id)
        .first<{ total: number }>()
      const totalStake = stakeResult?.total ?? 0

      const payoutResult = await db
        .prepare("SELECT COALESCE(SUM(payout), 0) as total FROM Bet WHERE userId = ? AND result IN ('won', 'void', 'cashout')")
        .bind(user.id)
        .first<{ total: number }>()
      const totalPayout = payoutResult?.total ?? 0

      const profitLoss = totalPayout - totalStake

      // By sport
      const sportResult = await db
        .prepare(
          `SELECT sport,
                  COUNT(*) as totalBets,
                  SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as wonBets,
                  SUM(CASE WHEN result = 'lost' THEN 1 ELSE 0 END) as lostBets,
                  SUM(stake) as totalStake,
                  SUM(CASE WHEN result IN ('won', 'void', 'cashout') THEN COALESCE(payout, 0) ELSE 0 END) as totalPayout
           FROM Bet WHERE userId = ? AND sport IS NOT NULL
           GROUP BY sport ORDER BY totalBets DESC`
        )
        .bind(user.id)
        .all()

      const bySport = (sportResult.results || []) as Record<string, unknown>[]

      // By month (last 12 months)
      const twelveMonthsAgo = new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000).toISOString()
      const monthResult = await db
        .prepare(
          `SELECT strftime('%Y-%m', createdAt) as month,
                  COUNT(*) as totalBets,
                  SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as wonBets,
                  SUM(CASE WHEN result = 'lost' THEN 1 ELSE 0 END) as lostBets,
                  SUM(stake) as totalStake,
                  SUM(CASE WHEN result IN ('won', 'void', 'cashout') THEN COALESCE(payout, 0) ELSE 0 END) as totalPayout
           FROM Bet WHERE userId = ? AND createdAt >= ?
           GROUP BY month ORDER BY month DESC`
        )
        .bind(user.id, twelveMonthsAgo)
        .all()

      const byMonth = (monthResult.results || []) as Record<string, unknown>[]

      return NextResponse.json({
        summary: {
          totalBets,
          wonBets,
          lostBets,
          pendingBets,
          totalStake: Math.round(totalStake * 100) / 100,
          totalPayout: Math.round(totalPayout * 100) / 100,
          profitLoss: Math.round(profitLoss * 100) / 100,
          winRate: totalBets > 0 ? Math.round((wonBets / (wonBets + lostBets)) * 10000) / 100 : 0,
        },
        bySport: bySport.map((s) => ({
          sport: s.sport,
          totalBets: s.totalBets,
          wonBets: s.wonBets,
          lostBets: s.lostBets,
          totalStake: Math.round((s.totalStake as number) * 100) / 100,
          totalPayout: Math.round((s.totalPayout as number) * 100) / 100,
          profitLoss: Math.round(((s.totalPayout as number) - (s.totalStake as number)) * 100) / 100,
        })),
        byMonth: byMonth.map((m) => ({
          month: m.month,
          totalBets: m.totalBets,
          wonBets: m.wonBets,
          lostBets: m.lostBets,
          totalStake: Math.round((m.totalStake as number) * 100) / 100,
          totalPayout: Math.round((m.totalPayout as number) * 100) / 100,
          profitLoss: Math.round(((m.totalPayout as number) - (m.totalStake as number)) * 100) / 100,
        })),
      })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const where = { userId: user.id }

      const [totalBets, wonBets, lostBets, pendingBets] = await Promise.all([
        db.bet.count({ where }),
        db.bet.count({ where: { ...where, result: 'won' } }),
        db.bet.count({ where: { ...where, result: 'lost' } }),
        db.bet.count({ where: { ...where, result: 'pending' } }),
      ])

      const settledBets = await db.bet.findMany({
        where: { ...where, result: { in: ['won', 'lost', 'void', 'cashout'] } },
        select: { stake: true, payout: true },
      })

      const totalStake = settledBets.reduce((s, b) => s + b.stake, 0)
      const totalPayout = settledBets.reduce((s, b) => s + (b.payout || 0), 0)
      const profitLoss = totalPayout - totalStake

      // By sport
      const sportAgg = await db.bet.groupBy({
        by: ['sport'],
        where: { ...where, sport: { not: null } },
        _count: { id: true },
        _sum: { stake: true, payout: true },
        orderBy: { _count: { id: 'desc' } },
      })

      const bySport = sportAgg.map((s) => ({
        sport: s.sport,
        totalBets: s._count.id,
        totalStake: Math.round((s._sum.stake || 0) * 100) / 100,
        totalPayout: Math.round((s._sum.payout || 0) * 100) / 100,
      }))

      // By month
      const twelveMonthsAgo = new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000)
      const recentBets = await db.bet.findMany({
        where: { ...where, createdAt: { gte: twelveMonthsAgo } },
        select: { createdAt: true, stake: true, payout: true, result: true },
      })

      const monthMap = new Map<string, { totalBets: number; wonBets: number; lostBets: number; totalStake: number; totalPayout: number }>()

      for (const bet of recentBets) {
        const month = bet.createdAt.toISOString().slice(0, 7) // YYYY-MM
        if (!monthMap.has(month)) {
          monthMap.set(month, { totalBets: 0, wonBets: 0, lostBets: 0, totalStake: 0, totalPayout: 0 })
        }
        const entry = monthMap.get(month)!
        entry.totalBets++
        if (bet.result === 'won') entry.wonBets++
        if (bet.result === 'lost') entry.lostBets++
        entry.totalStake += bet.stake
        entry.totalPayout += bet.payout || 0
      }

      const byMonth = Array.from(monthMap.entries())
        .map(([month, data]) => ({
          month,
          ...data,
          totalStake: Math.round(data.totalStake * 100) / 100,
          totalPayout: Math.round(data.totalPayout * 100) / 100,
          profitLoss: Math.round((data.totalPayout - data.totalStake) * 100) / 100,
        }))
        .sort((a, b) => b.month.localeCompare(a.month))

      return NextResponse.json({
        summary: {
          totalBets,
          wonBets,
          lostBets,
          pendingBets,
          totalStake: Math.round(totalStake * 100) / 100,
          totalPayout: Math.round(totalPayout * 100) / 100,
          profitLoss: Math.round(profitLoss * 100) / 100,
          winRate: totalBets > 0 ? Math.round((wonBets / (wonBets + lostBets)) * 10000) / 100 : 0,
        },
        bySport,
        byMonth,
      })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
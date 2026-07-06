import { NextResponse } from 'next/server'
import {
  generateSessionToken,
  requireAuthFromRequest,
  requireAdminFromRequest,
  getTokenFromRequest,
  AuthUser,
  AuthError,
} from '@/lib/auth'
import { hashPassword, verifyPassword } from '@/lib/password'
import { countOdds } from '@/lib/scrapers/types'
import { generateOddsData } from '@/lib/odds-data'

export const runtime = 'edge'

// ─── Route Configuration ────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'

interface RouteEntry {
  /** Match against path segments (use ':param' for dynamic segment) */
  segments: (string | RegExp)[]
  method: HttpMethod | '*'
  handler: (request: Request, pathParams: Record<string, string>) => Promise<Response>
}

/**
 * Simple trie-less router: scan all entries, first match wins.
 * `:x` in a segment means "capture this segment as pathParams[x]".
 * A RegExp matches the segment literally.
 */
const ROUTES: RouteEntry[] = [
  // ── Auth ───────────────────────────────────────────────────────────
  { segments: ['auth', 'login'],    method: 'POST',   handler: postAuthLogin },
  { segments: ['auth', 'register'], method: 'POST',   handler: postAuthRegister },
  { segments: ['auth', 'logout'],   method: 'POST',   handler: postAuthLogout },
  { segments: ['auth', 'me'],       method: 'GET',    handler: getAuthMe },

  // ── Admin ──────────────────────────────────────────────────────────
  { segments: ['admin', 'stats'],       method: 'GET',  handler: getAdminStats },
  { segments: ['admin', 'users'],       method: 'GET',  handler: getAdminUsers },
  { segments: ['admin', 'users', ':id'], method: 'PATCH', handler: patchAdminUser },
  { segments: ['admin', 'activity'],    method: 'GET',  handler: getAdminActivity },
  { segments: ['admin', 'scraping-logs'], method: 'GET', handler: getAdminScrapingLogs },

  // ── Odds ───────────────────────────────────────────────────────────
  { segments: ['odds', 'stream'],   method: 'GET', handler: getOddsStream },
  { segments: ['odds', 'movement'], method: 'GET', handler: getOddsMovement },
  { segments: ['odds'],             method: 'GET', handler: getOdds },

  // ── Data ───────────────────────────────────────────────────────────
  { segments: ['opportunities'], method: 'GET', handler: getOpportunities },
  { segments: ['value-bets'],    method: 'GET', handler: getValueBets },
  { segments: ['arbs', 'log'],   method: 'POST', handler: postArbsLog },
  { segments: ['arbs'],          method: 'GET',  handler: getArbs },

  // ── Bookmakers & Sports ────────────────────────────────────────────
  { segments: ['bookmakers'], method: 'GET', handler: getBookmakers },
  { segments: ['sports'],      method: 'GET', handler: getSports },

  // ── Bets ───────────────────────────────────────────────────────────
  { segments: ['bets', 'analytics'], method: 'GET',  handler: getBetsAnalytics },
  { segments: ['bets', 'import'],    method: 'POST', handler: postBetsImport },
  { segments: ['bets', 'settle'],    method: 'POST', handler: postBetsSettle },
  { segments: ['bets', ':id'],       method: 'PATCH',  handler: patchBet },
  { segments: ['bets', ':id'],       method: 'DELETE', handler: deleteBet },
  { segments: ['bets'],              method: 'POST',   handler: postBet },
  { segments: ['bets'],              method: 'GET',    handler: getBets },

  // ── AI Picks ───────────────────────────────────────────────────────
  { segments: ['ai-picks', 'log'],    method: 'POST', handler: postAiPickLog },
  { segments: ['ai-picks', 'settle'], method: 'POST', handler: postAiPickSettle },
  { segments: ['ai-picks'],           method: 'GET',  handler: getAiPicks },

  // ── Subscription ───────────────────────────────────────────────────
  { segments: ['subscription', 'change-plan'], method: 'POST', handler: postSubscriptionChangePlan },
]

// ─── Main Dispatch ──────────────────────────────────────────────────────

function matchRoute(
  pathSegments: string[],
  method: string,
): { handler: RouteEntry['handler']; pathParams: Record<string, string> } | null {
  for (const route of ROUTES) {
    if (route.method !== '*' && route.method !== method) continue
    if (route.segments.length !== pathSegments.length) continue

    const params: Record<string, string> = {}
    let matched = true

    for (let i = 0; i < route.segments.length; i++) {
      const pattern = route.segments[i]
      const actual = pathSegments[i]

      if (typeof pattern === 'string') {
        if (pattern.startsWith(':')) {
          params[pattern.slice(1)] = actual
        } else if (pattern !== actual) {
          matched = false
          break
        }
      } else if (pattern instanceof RegExp) {
        if (!pattern.test(actual)) {
          matched = false
          break
        }
      }
    }

    if (matched) return { handler: route.handler, pathParams: params }
  }
  return null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const match = matchRoute(path, 'GET')
  if (!match) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  return match.handler(request, match.pathParams)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const match = matchRoute(path, 'POST')
  if (!match) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  return match.handler(request, match.pathParams)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const match = matchRoute(path, 'PATCH')
  if (!match) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  return match.handler(request, match.pathParams)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const match = matchRoute(path, 'DELETE')
  if (!match) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  return match.handler(request, match.pathParams)
}

// ════════════════════════════════════════════════════════════════════════
// AUTH HANDLERS
// ════════════════════════════════════════════════════════════════════════

const ADMIN_EMAILS = ['admin@arbdesk.com', 'me.alex.21.3@gmail.com']

// POST /api/auth/login
async function postAuthLogin(request: Request, _pp: Record<string, string>) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    try {
      return await handleLoginD1(normalizedEmail, password, request)
    } catch {
      return await handleLoginPrisma(normalizedEmail, password, request)
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleLoginD1(email: string, password: string, request: Request) {
  const D1 = await import('@/lib/cloudflare-db')
  const db = await D1.getD1()
  const row = await D1.getUserByEmail(db, email)

  if (!row) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const user = row as Record<string, unknown>
  const isActive = user.isActive === 1 || user.isActive === true

  if (!isActive) {
    return NextResponse.json({ error: 'Account is deactivated. Please contact support.' }, { status: 403 })
  }

  if (!user.passwordHash) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const isValid = await verifyPassword(password, user.passwordHash as string)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  await D1.createSession(db, user.id as string, token, expiresAt)
  await D1.updateUser(db, user.id as string, { lastLoginAt: new Date().toISOString() })

  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null
  await D1.createActivityLog(db, user.id as string, 'login', null, ip)

  const authUser: AuthUser = {
    id: user.id as string,
    email: user.email as string,
    name: (user.name as string) || null,
    role: user.role as string,
    subscriptionTier: user.subscriptionTier as string,
    subscriptionExpiresAt: (user.subscriptionExpiresAt as string) || null,
    isActive,
    createdAt: user.createdAt as string,
    updatedAt: user.updatedAt as string,
  }

  return NextResponse.json({ user: authUser, token })
}

async function handleLoginPrisma(email: string, password: string, request: Request) {
  const { db } = await import('@/lib/db')

  const user = await db.user.findUnique({ where: { email } })

  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  if (!user.isActive) {
    return NextResponse.json({ error: 'Account is deactivated. Please contact support.' }, { status: 403 })
  }

  if (!user.passwordHash) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const isValid = await verifyPassword(password, user.passwordHash)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db.session.create({ data: { userId: user.id, token, expiresAt } })
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'login',
      ipAddress: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
    },
  })

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    subscriptionTier: user.subscriptionTier,
    subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }

  return NextResponse.json({ user: authUser, token })
}

// POST /api/auth/register
async function postAuthRegister(request: Request, _pp: Record<string, string>) {
  try {
    const body = await request.json()
    const { email, password, name } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    try {
      return await handleRegisterD1(normalizedEmail, password, name, request)
    } catch {
      return await handleRegisterPrisma(normalizedEmail, password, name, request)
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Register error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleRegisterD1(email: string, password: string, name: string | undefined, request: Request) {
  const D1 = await import('@/lib/cloudflare-db')
  const db = await D1.getD1()

  const existing = await D1.getUserByEmail(db, email)
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
  }

  const isAdmin = ADMIN_EMAILS.includes(email)
  const passwordHash = await hashPassword(password)
  const userId = crypto.randomUUID()

  await D1.createUser(db, {
    id: userId,
    email,
    passwordHash,
    name: name?.trim() || null,
    role: isAdmin ? 'admin' : 'user',
    subscriptionTier: isAdmin ? 'enterprise' : 'free',
    isActive: true,
  })

  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await D1.createSession(db, userId, token, expiresAt)

  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null
  await D1.createActivityLog(db, userId, 'register', null, ip)

  const authUser: AuthUser = {
    id: userId,
    email,
    name: name?.trim() || null,
    role: isAdmin ? 'admin' : 'user',
    subscriptionTier: isAdmin ? 'enterprise' : 'free',
    subscriptionExpiresAt: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  return NextResponse.json({ user: authUser, token }, { status: 201 })
}

async function handleRegisterPrisma(email: string, password: string, name: string | undefined, request: Request) {
  const { db } = await import('@/lib/db')

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
  }

  const isAdmin = ADMIN_EMAILS.includes(email)
  const passwordHash = await hashPassword(password)

  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      name: name?.trim() || null,
      role: isAdmin ? 'admin' : 'user',
      subscriptionTier: isAdmin ? 'enterprise' : 'free',
      isActive: true,
    },
  })

  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db.session.create({ data: { userId: user.id, token, expiresAt } })
  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'register',
      ipAddress: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
    },
  })

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    subscriptionTier: user.subscriptionTier,
    subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }

  return NextResponse.json({ user: authUser, token }, { status: 201 })
}

// POST /api/auth/logout
async function postAuthLogout(request: Request, _pp: Record<string, string>) {
  try {
    const token = await getTokenFromRequest(request)

    if (token) {
      try {
        const D1 = await import('@/lib/cloudflare-db')
        const db = await D1.getD1()
        await D1.deleteSession(db, token)
      } catch {
        const { db } = await import('@/lib/db')
        await db.session.deleteMany({ where: { token } })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/auth/me
async function getAuthMe(request: Request, _pp: Record<string, string>) {
  try {
    const user = await requireAuthFromRequest(request)

    const token = await getTokenFromRequest(request)
    if (token) {
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      try {
        const D1 = await import('@/lib/cloudflare-db')
        const db = await D1.getD1()
        await D1.updateSessionExpiry(db, token, user.id, newExpiresAt)
      } catch {
        const { db } = await import('@/lib/db')
        await db.session.updateMany({
          where: { token, userId: user.id },
          data: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        })
      }
    }

    return NextResponse.json({ user })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Me error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ════════════════════════════════════════════════════════════════════════
// ADMIN HANDLERS
// ════════════════════════════════════════════════════════════════════════

// GET /api/admin/stats
async function getAdminStats(request: Request, _pp: Record<string, string>) {
  try {
    await requireAdminFromRequest(request)

    try {
      return await handleStatsD1()
    } catch {
      return await handleStatsPrisma()
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}

async function handleStatsD1() {
  const D1 = await import('@/lib/cloudflare-db')
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

  return NextResponse.json({ stats: { totalUsers, activeUsers, proUsers, enterpriseUsers, totalBets, totalArbs, recentScrapes, newUsersToday } })
}

async function handleStatsPrisma() {
  const { db } = await import('@/lib/db')
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [totalUsers, activeUsers, proUsers, enterpriseUsers, totalBets, totalArbs, recentScrapes, newUsersToday] =
    await Promise.all([
      db.user.count(),
      db.user.count({ where: { isActive: true } }),
      db.user.count({ where: { subscriptionTier: 'pro', isActive: true } }),
      db.user.count({ where: { subscriptionTier: 'enterprise', isActive: true } }),
      db.betJournal.count(),
      db.arbAlert.count(),
      db.scrapingLog.count({ where: { createdAt: { gte: yesterday } } }),
      db.user.count({ where: { createdAt: { gte: startOfToday } } }),
    ])

  return NextResponse.json({ stats: { totalUsers, activeUsers, proUsers, enterpriseUsers, totalBets, totalArbs, recentScrapes, newUsersToday } })
}

// GET /api/admin/users
async function getAdminUsers(request: Request, _pp: Record<string, string>) {
  try {
    await requireAdminFromRequest(request)

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()

    try {
      return await handleUsersD1(search)
    } catch {
      return await handleUsersPrisma(search)
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}

async function handleUsersD1(search?: string | null) {
  const D1 = await import('@/lib/cloudflare-db')
  const db = await D1.getD1()
  const users = await D1.getAllUsers(db, search || undefined)

  const formattedUsers = users.map((u: Record<string, unknown>) => ({
    id: u.id,
    email: u.email,
    name: u.name || null,
    role: u.role,
    subscriptionTier: u.subscriptionTier,
    subscriptionExpiresAt: u.subscriptionExpiresAt || null,
    isActive: u.isActive === 1 || u.isActive === true,
    lastLoginAt: u.lastLoginAt || null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }))

  return NextResponse.json({ users: formattedUsers })
}

async function handleUsersPrisma(search?: string | null) {
  const { db } = await import('@/lib/db')

  const users = await db.user.findMany({
    where: search
      ? { OR: [{ email: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }] }
      : undefined,
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, name: true, role: true, subscriptionTier: true, subscriptionExpiresAt: true, isActive: true, lastLoginAt: true, createdAt: true, updatedAt: true },
  })

  const formattedUsers = users.map((u) => ({
    ...u,
    subscriptionExpiresAt: u.subscriptionExpiresAt?.toISOString() ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }))

  return NextResponse.json({ users: formattedUsers })
}

// PATCH /api/admin/users/:id
async function patchAdminUser(request: Request, pp: Record<string, string>) {
  try {
    const admin = await requireAdminFromRequest(request)
    const id = pp.id

    const body = await request.json()

    try {
      return await handleUpdateD1(id, body, admin)
    } catch {
      return await handleUpdatePrisma(id, body, admin)
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}

async function handleUpdateD1(userId: string, body: Record<string, unknown>, admin: { email: string }) {
  const D1 = await import('@/lib/cloudflare-db')
  const db = await D1.getD1()

  const updateData: Record<string, unknown> = {}
  if (body.subscriptionTier) updateData.subscriptionTier = body.subscriptionTier
  if (body.role) updateData.role = body.role
  if (typeof body.isActive === 'boolean') updateData.isActive = body.isActive

  await D1.updateUser(db, userId, updateData)

  const actions: string[] = []
  if (body.subscriptionTier) actions.push(`subscription changed to ${body.subscriptionTier}`)
  if (body.role) actions.push(`role changed to ${body.role}`)
  if (typeof body.isActive === 'boolean') actions.push(`active set to ${body.isActive}`)

  if (actions.length > 0) {
    await D1.createActivityLog(db, userId, 'admin_update', `Admin ${admin.email}: ${actions.join(', ')}`, null)
  }

  const user = await D1.getUserById(db, userId)

  return NextResponse.json({
    user: user
      ? {
          id: user.id as string,
          email: user.email as string,
          name: (user.name as string) || null,
          role: user.role as string,
          subscriptionTier: user.subscriptionTier as string,
          subscriptionExpiresAt: (user.subscriptionExpiresAt as string) || null,
          isActive: user.isActive === 1 || user.isActive === true,
          lastLoginAt: (user.lastLoginAt as string) || null,
          createdAt: user.createdAt as string,
          updatedAt: user.updatedAt as string,
        }
      : null,
  })
}

async function handleUpdatePrisma(userId: string, body: Record<string, unknown>, admin: { email: string }) {
  const { db } = await import('@/lib/db')

  const updateData: Record<string, unknown> = {}
  if (body.subscriptionTier) updateData.subscriptionTier = body.subscriptionTier
  if (body.role) updateData.role = body.role
  if (typeof body.isActive === 'boolean') updateData.isActive = body.isActive

  const user = await db.user.update({ where: { id: userId }, data: updateData })

  const actions: string[] = []
  if (body.subscriptionTier) actions.push(`subscription changed to ${body.subscriptionTier}`)
  if (body.role) actions.push(`role changed to ${body.role}`)
  if (typeof body.isActive === 'boolean') actions.push(`active set to ${body.isActive}`)

  if (actions.length > 0) {
    await db.activityLog.create({
      data: { userId: user.id, action: 'admin_update', details: `Admin ${admin.email}: ${actions.join(', ')}` },
    })
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      subscriptionTier: user.subscriptionTier,
      subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
  })
}

// GET /api/admin/activity
async function getAdminActivity(request: Request, _pp: Record<string, string>) {
  try {
    await requireAdminFromRequest(request)

    try {
      return await handleActivityD1()
    } catch {
      return await handleActivityPrisma()
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}

async function handleActivityD1() {
  const D1 = await import('@/lib/cloudflare-db')
  const db = await D1.getD1()
  const logs = await D1.getActivityLogs(db, 50)

  const activities = logs.map((log: Record<string, unknown>) => ({
    id: log.id,
    userEmail: log.userEmail,
    userName: log.userName,
    action: log.action,
    details: log.details || null,
    ipAddress: log.ipAddress || null,
    createdAt: log.createdAt,
  }))

  return NextResponse.json({ activities })
}

async function handleActivityPrisma() {
  const { db } = await import('@/lib/db')

  const logs = await db.activityLog.findMany({
    include: { user: { select: { email: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const activities = logs.map((log) => ({
    id: log.id,
    userEmail: log.user.email,
    userName: log.user.name,
    action: log.action,
    details: log.details,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
  }))

  return NextResponse.json({ activities })
}

// GET /api/admin/scraping-logs
async function getAdminScrapingLogs(request: Request, _pp: Record<string, string>) {
  try {
    await requireAdminFromRequest(request)

    try {
      return await handleScrapingLogsD1()
    } catch {
      return await handleScrapingLogsPrisma()
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}

async function handleScrapingLogsD1() {
  const D1 = await import('@/lib/cloudflare-db')
  const db = await D1.getD1()
  const logs = await D1.getScrapingLogs(db)

  const formattedLogs = logs.map((log: Record<string, unknown>) => ({
    id: log.id,
    provider: log.provider,
    status: log.status,
    eventsFound: log.eventsFound,
    durationMs: log.durationMs || null,
    createdAt: log.createdAt,
  }))

  return NextResponse.json({ logs: formattedLogs })
}

async function handleScrapingLogsPrisma() {
  const { db } = await import('@/lib/db')

  const logs = await db.scrapingLog.findMany({ orderBy: { createdAt: 'desc' } })

  const formattedLogs = logs.map((log) => ({
    id: log.id,
    provider: log.provider,
    status: log.status,
    eventsFound: log.eventsFound,
    durationMs: log.durationMs,
    createdAt: log.createdAt.toISOString(),
  }))

  return NextResponse.json({ logs: formattedLogs })
}

// ════════════════════════════════════════════════════════════════════════
// ODDS HANDLERS
// ════════════════════════════════════════════════════════════════════════

// GET /api/odds
async function getOdds(request: Request, _pp: Record<string, string>) {
  try {
    await requireAuthFromRequest(request)

    const { searchParams } = new URL(request.url)
    const refresh = searchParams.get('refresh')
    const sport = searchParams.get('sport')
    const provider = searchParams.get('provider')
    const scrapeProvider = searchParams.get('scrape')

    if (refresh === '1' || scrapeProvider) {
      const scrapeResult = await triggerScrape(scrapeProvider, sport || undefined)
      return NextResponse.json(scrapeResult)
    }

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM ScrapedEvent'
      const binds: unknown[] = []
      const conditions: string[] = []

      if (sport) { conditions.push('sport = ?'); binds.push(sport) }
      if (provider) { conditions.push('provider = ?'); binds.push(provider) }

      if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ')
      query += ' ORDER BY fetchedAt DESC LIMIT 500'

      const stmt = db.prepare(query)
      const result = await (binds.length > 0 ? stmt.bind(...binds) : stmt).all()
      const scrapedEvents = result.results || []

      if (!Array.isArray(scrapedEvents) || scrapedEvents.length === 0) {
        const demoData = generateOddsData()
        return NextResponse.json(demoData)
      }

      return NextResponse.json(buildOddsResponse(scrapedEvents as Record<string, unknown>[]))
    } catch {
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = {}
      if (sport) where.sport = sport
      if (provider) where.provider = provider

      const scrapedEvents = await db.scrapedEvent.findMany({
        where,
        orderBy: { fetchedAt: 'desc' },
        take: 500,
      })

      if (scrapedEvents.length === 0) {
        const demoData = generateOddsData()
        return NextResponse.json(demoData)
      }

      const mapped = scrapedEvents.map((e) => ({ ...e, matchTime: e.matchTime.toISOString(), fetchedAt: e.fetchedAt.toISOString() }))
      return NextResponse.json(buildOddsResponse(mapped))
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/odds/stream (SSE)
async function getOddsStream(request: Request, _pp: Record<string, string>) {
  try {
    await requireAuthFromRequest(request)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        let intervalId: ReturnType<typeof setInterval> | undefined

        const sendUpdate = async () => {
          try {
            const data = await fetchOddsSnapshot()
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'fetch_failed' })}\n\n`))
          }
        }

        await sendUpdate()
        intervalId = setInterval(sendUpdate, 10_000)

        request.signal.addEventListener('abort', () => {
          if (intervalId) clearInterval(intervalId)
          try { controller.close() } catch { /* already closed */ }
        })
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(JSON.stringify({ error: error.message }), { status: error.statusCode, headers: { 'Content-Type': 'application/json' } })
    }
    console.error('Route error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

async function fetchOddsSnapshot() {
  const now = new Date().toISOString()

  try {
    const D1 = await import('@/lib/cloudflare-db')
    const db = await D1.getD1()
    const result = await db.prepare('SELECT COUNT(*) as count FROM ScrapedEvent').first<{ count: number }>()
    const hasData = (result?.count ?? 0) > 0

    if (!hasData) return { ...generateOddsData(), fetchedAt: now }

    const eventsResult = await db.prepare('SELECT * FROM ScrapedEvent ORDER BY fetchedAt DESC LIMIT 200').all()
    const events = eventsResult.results || []

    return { mode: 'live', fetchedAt: now, eventCount: Array.isArray(events) ? events.length : 0, events: Array.isArray(events) ? events.slice(0, 20) : [] }
  } catch {
    const { db } = await import('@/lib/db')
    const count = await db.scrapedEvent.count()

    if (count === 0) return { ...generateOddsData(), fetchedAt: now }

    const events = await db.scrapedEvent.findMany({ orderBy: { fetchedAt: 'desc' }, take: 200 })

    return {
      mode: 'live',
      fetchedAt: now,
      eventCount: events.length,
      events: events.slice(0, 20).map((e) => ({ ...e, matchTime: e.matchTime.toISOString(), fetchedAt: e.fetchedAt.toISOString() })),
    }
  }
}

// GET /api/odds/movement
async function getOddsMovement(request: Request, _pp: Record<string, string>) {
  try {
    await requireAuthFromRequest(request)

    const { searchParams } = new URL(request.url)
    const sport = searchParams.get('sport')
    const hours = parseInt(searchParams.get('hours') || '24', 10)
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM OddsMovement WHERE createdAt >= ?'
      const binds: unknown[] = [since]

      if (sport) { query += ' AND sport = ?'; binds.push(sport) }
      query += ' ORDER BY createdAt DESC LIMIT 100'

      const stmt = db.prepare(query)
      const result = await stmt.bind(...binds).all()

      return NextResponse.json({ movements: result.results || [] })
    } catch {
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = { createdAt: { gte: new Date(since) } }
      if (sport) where.sport = sport

      const movements = await db.oddsMovement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })

      return NextResponse.json({ movements: movements.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })) })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Scraping Helpers ───────────────────────────────────────────────────

async function triggerScrape(scrapeProvider?: string | null, sport?: string) {
  try {
    const { scrapeSingle, scrapeAll } = await import('@/lib/scrapers/scraping-engine')

    let scrapeResult: Record<string, unknown>
    if (scrapeProvider) {
      const result = await scrapeSingle(scrapeProvider, sport ? [sport] : undefined)
      scrapeResult = {
        totalEvents: result.eventsFound,
        results: [{ provider: result.provider, status: result.status, eventsFound: result.eventsFound, durationMs: result.durationMs, error: result.error }],
      }
      await storeScrapedEvents(result.events)
      await storeScrapingLog(result)
    } else {
      const fullResult = await scrapeAll(sport ? [sport] : undefined)
      scrapeResult = fullResult as unknown as Record<string, unknown>

      await storeScrapedEvents(fullResult.newEvents)

      for (const r of fullResult.results) {
        await storeScrapingLog({ provider: r.provider, status: r.status, eventsFound: r.eventsFound, durationMs: r.durationMs, error: r.error })
      }

      if (fullResult.movements.length > 0) await storeOddsMovements(fullResult.movements)
      if (fullResult.arbs.length > 0) await storeArbOpportunities(fullResult.arbs)
    }

    return {
      mode: 'live',
      fetchedAt: new Date().toISOString(),
      scraping: scrapeResult,
      message: `Scraped ${(scrapeResult as { totalEvents: number }).totalEvents} events from ${((scrapeResult as { results: unknown[] }).results || []).length} providers`,
    }
  } catch (err) {
    return { mode: 'error', fetchedAt: new Date().toISOString(), error: String(err), message: 'Scraping failed — check bookmaker connectivity' }
  }
}

async function storeScrapedEvents(events: Array<{
  externalId: string; provider: string; sport: string; category: string; tournament: string
  homeTeam: string; awayTeam: string; matchTime: string; bettingStatus: boolean; isLive: boolean
  odds: Record<string, Record<string, number>>
}>) {
  if (events.length === 0) return
  const now = new Date().toISOString()

  try {
    const D1 = await import('@/lib/cloudflare-db')
    const db = await D1.getD1()

    const stmts = events.map(event =>
      db.prepare(
        `INSERT OR REPLACE INTO ScrapedEvent (id, externalId, provider, sport, category, tournament, homeTeam, awayTeam, matchTime, bettingStatus, isLive, oddsSnapshot, oddsCount, fetchedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(`${event.provider}_${event.externalId}`, event.externalId, event.provider, event.sport, event.category, event.tournament, event.homeTeam, event.awayTeam, event.matchTime, event.bettingStatus ? 1 : 0, event.isLive ? 1 : 0, JSON.stringify(event.odds), countOdds(event.odds), now)
    )

    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50))
    }
  } catch {
    try {
      const { db } = await import('@/lib/db')
      for (const event of events) {
        await db.scrapedEvent.upsert({
          where: { externalId_provider: { externalId: event.externalId, provider: event.provider } },
          create: {
            externalId: event.externalId, provider: event.provider, sport: event.sport, category: event.category,
            tournament: event.tournament, homeTeam: event.homeTeam, awayTeam: event.awayTeam,
            matchTime: new Date(event.matchTime), bettingStatus: event.bettingStatus, isLive: event.isLive,
            oddsSnapshot: JSON.stringify(event.odds), oddsCount: countOdds(event.odds),
          },
          update: {
            oddsSnapshot: JSON.stringify(event.odds), oddsCount: countOdds(event.odds),
            bettingStatus: event.bettingStatus, isLive: event.isLive, fetchedAt: new Date(now),
          },
        })
      }
    } catch (prismaErr) {
      console.error('[Odds] Failed to store events in Prisma:', prismaErr)
    }
  }
}

async function storeScrapingLog(result: { provider: string; status: string; eventsFound: number; durationMs: number; error?: string }) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  try {
    const D1 = await import('@/lib/cloudflare-db')
    const db = await D1.getD1()
    await db.prepare(
      'INSERT INTO ScrapingLog (id, provider, status, eventsFound, errorMsg, durationMs, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, result.provider, result.status, result.eventsFound, result.error || null, result.durationMs, now).run()
  } catch {
    try {
      const { db } = await import('@/lib/db')
      await db.scrapingLog.create({
        data: { provider: result.provider, status: result.status, eventsFound: result.eventsFound, errorMsg: result.error || null, durationMs: result.durationMs },
      })
    } catch { /* ignore */ }
  }
}

async function storeOddsMovements(movements: Array<{
  eventId: string; provider: string; sport: string; homeTeam: string; awayTeam: string
  marketType: string; selection: string; oldOdds: number; newOdds: number; change: number
}>) {
  const now = new Date().toISOString()

  try {
    const D1 = await import('@/lib/cloudflare-db')
    const db = await D1.getD1()

    const stmts = movements.slice(0, 200).map(m =>
      db.prepare(
        'INSERT INTO OddsMovement (id, eventId, provider, sport, homeTeam, awayTeam, marketType, selection, oldOdds, newOdds, change, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), m.eventId, m.provider, m.sport, m.homeTeam, m.awayTeam, m.marketType, m.selection, m.oldOdds, m.newOdds, m.change, now)
    )

    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50))
    }
  } catch {
    try {
      const { db } = await import('@/lib/db')
      await db.oddsMovement.createMany({
        data: movements.slice(0, 200).map(m => ({
          eventId: m.eventId, provider: m.provider, sport: m.sport, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
          marketType: m.marketType, selection: m.selection, oldOdds: m.oldOdds, newOdds: m.newOdds, change: m.change,
        })),
      })
    } catch { /* ignore */ }
  }
}

async function storeArbOpportunities(arbs: Array<{
  homeTeam: string; awayTeam: string; sport: string; competition: string; marketType: string
  selection1: string; selection2: string; bookmaker1: string; bookmaker2: string
  odds1: number; odds2: number; edge: number; impliedProb1: number; impliedProb2: number; matchTime: string
}>) {
  const now = new Date().toISOString()

  try {
    const D1 = await import('@/lib/cloudflare-db')
    const db = await D1.getD1()

    const stmts = arbs.slice(0, 100).map(a =>
      db.prepare(
        `INSERT INTO ArbOpportunity (id, sport, competition, homeTeam, awayTeam, marketType, selection1, selection2, bookmaker1, bookmaker2, odds1, odds2, edge, impliedProb1, impliedProb2, seen, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      ).bind(crypto.randomUUID(), a.sport, a.competition, a.homeTeam, a.awayTeam, a.marketType, a.selection1, a.selection2, a.bookmaker1, a.bookmaker2, a.odds1, a.odds2, a.edge, a.impliedProb1, a.impliedProb2, now)
    )

    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50))
    }
  } catch {
    try {
      const { db } = await import('@/lib/db')
      await db.arbOpportunity.createMany({
        data: arbs.slice(0, 100).map(a => ({
          sport: a.sport, competition: a.competition, homeTeam: a.homeTeam, awayTeam: a.awayTeam,
          marketType: a.marketType, selection1: a.selection1, selection2: a.selection2,
          bookmaker1: a.bookmaker1, bookmaker2: a.bookmaker2, odds1: a.odds1, odds2: a.odds2,
          edge: a.edge, impliedProb1: a.impliedProb1, impliedProb2: a.impliedProb2,
        })),
      })
    } catch { /* ignore */ }
  }
}

// ─── Odds Calculation Helpers ───────────────────────────────────────────

interface GroupedEvent {
  id: string; sport: string; competition: string; startsAt: string
  homeTeam: string; awayTeam: string
  bookmakers: { name: string; lastUpdate: string; markets: Record<string, Record<string, number>> }[]
}

function buildOddsResponse(scrapedEvents: Record<string, unknown>[]) {
  const eventMap = new Map<string, GroupedEvent>()

  for (const row of scrapedEvents) {
    const key = `${row.homeTeam}|${row.awayTeam}|${row.matchTime}`
    if (!eventMap.has(key)) {
      eventMap.set(key, {
        id: row.id as string, sport: row.sport as string,
        competition: (row.category as string) || '', startsAt: row.matchTime as string,
        homeTeam: row.homeTeam as string, awayTeam: row.awayTeam as string, bookmakers: [],
      })
    }

    let odds: Record<string, Record<string, number>> = {}
    try { odds = JSON.parse((row.oddsSnapshot as string) || '{}') } catch { odds = {} }

    const event = eventMap.get(key)!
    event.bookmakers.push({ name: row.provider as string, lastUpdate: row.fetchedAt as string, markets: odds })
  }

  const groupedEvents = Array.from(eventMap.values())
  const opportunities = calculateArbs(groupedEvents)

  return {
    mode: 'live',
    fetchedAt: new Date().toISOString(),
    previousFetchedAt: scrapedEvents.length > 0 ? (scrapedEvents[scrapedEvents.length - 1].fetchedAt as string) : new Date().toISOString(),
    events: groupedEvents,
    opportunities,
    arbitrages: opportunities,
    valueBets: calculateValueBetsFromEvents(groupedEvents),
  }
}

function calculateArbs(events: GroupedEvent[]) {
  const arbs: Array<{
    id: string; eventId: string; sport: string; competition: string; homeTeam: string; awayTeam: string
    marketType: string; edge: number; confidence: string; bookmaker1: string; bookmaker2: string
    selection1: string; selection2: string; odds1: number; odds2: number
    impliedProb1: number; impliedProb2: number; startsAt: string
  }> = []

  for (const event of events) {
    const allMarkets = new Set<string>()
    for (const bm of event.bookmakers) {
      for (const market of Object.keys(bm.markets)) allMarkets.add(market)
    }

    for (const market of allMarkets) {
      const selections: Record<string, { odds: number; bookmaker: string }[]> = {}

      for (const bm of event.bookmakers) {
        const marketOdds = bm.markets[market]
        if (!marketOdds) continue
        for (const [selection, odds] of Object.entries(marketOdds)) {
          if (!selections[selection]) selections[selection] = []
          selections[selection].push({ odds: odds as number, bookmaker: bm.name })
        }
      }

      const selKeys = Object.keys(selections)
      if (selKeys.length < 2) continue

      for (let i = 0; i < selKeys.length; i++) {
        for (let j = i + 1; j < selKeys.length; j++) {
          const s1 = selKeys[i]; const s2 = selKeys[j]
          for (const o1 of selections[s1]) {
            for (const o2 of selections[s2]) {
              if (o1.bookmaker === o2.bookmaker) continue
              const impl1 = 1 / o1.odds; const impl2 = 1 / o2.odds
              const totalImpl = impl1 + impl2
              if (totalImpl < 1) {
                const edge = (1 - totalImpl) / totalImpl
                if (edge >= 0.005) {
                  arbs.push({
                    id: crypto.randomUUID(), eventId: event.id, sport: event.sport, competition: event.competition,
                    homeTeam: event.homeTeam, awayTeam: event.awayTeam, marketType: market,
                    edge: Math.round(edge * 10000) / 10000,
                    confidence: edge > 0.05 ? 'high' : edge > 0.02 ? 'medium' : 'low',
                    bookmaker1: o1.bookmaker, bookmaker2: o2.bookmaker, selection1: s1, selection2: s2,
                    odds1: o1.odds, odds2: o2.odds,
                    impliedProb1: Math.round(impl1 * 10000) / 10000,
                    impliedProb2: Math.round(impl2 * 10000) / 10000,
                    startsAt: event.startsAt,
                  })
                }
              }
            }
          }
        }
      }
    }
  }

  arbs.sort((a, b) => b.edge - a.edge)
  return arbs.slice(0, 50)
}

function calculateValueBetsFromEvents(events: GroupedEvent[]) {
  const valueBets: Array<{
    id: string; eventId: string; sport: string; competition: string; homeTeam: string; awayTeam: string
    marketType: string; selection: string; bookmaker: string; odds: number
    consensusOdds: number; edge: number; startsAt: string
  }> = []

  for (const event of events) {
    const allMarkets = new Set<string>()
    for (const bm of event.bookmakers) {
      for (const market of Object.keys(bm.markets)) allMarkets.add(market)
    }

    for (const market of allMarkets) {
      const selectionOdds: Record<string, { bookmaker: string; odds: number }[]> = {}

      for (const bm of event.bookmakers) {
        const marketOdds = bm.markets[market]
        if (!marketOdds) continue
        for (const [selection, odds] of Object.entries(marketOdds)) {
          if (!selectionOdds[selection]) selectionOdds[selection] = []
          selectionOdds[selection].push({ bookmaker: bm.name, odds: odds as number })
        }
      }

      for (const [selection, entries] of Object.entries(selectionOdds)) {
        if (entries.length < 2) continue
        const avgOdds = entries.reduce((sum, e) => sum + e.odds, 0) / entries.length
        for (const entry of entries) {
          if (entry.odds > avgOdds * 1.05) {
            const edge = (entry.odds / avgOdds) - 1
            valueBets.push({
              id: crypto.randomUUID(), eventId: event.id, sport: event.sport, competition: event.competition,
              homeTeam: event.homeTeam, awayTeam: event.awayTeam, marketType: market, selection,
              bookmaker: entry.bookmaker, odds: entry.odds, consensusOdds: Math.round(avgOdds * 100) / 100,
              edge: Math.round(edge * 10000) / 10000, startsAt: event.startsAt,
            })
          }
        }
      }
    }
  }

  valueBets.sort((a, b) => b.edge - a.edge)
  return valueBets.slice(0, 50)
}

// ════════════════════════════════════════════════════════════════════════
// DATA HANDLERS (opportunities, value-bets, arbs)
// ════════════════════════════════════════════════════════════════════════

// GET /api/opportunities
async function getOpportunities(request: Request, _pp: Record<string, string>) {
  try {
    await requireAuthFromRequest(request)

    const { searchParams } = new URL(request.url)
    const sport = searchParams.get('sport')
    const minEdge = parseFloat(searchParams.get('minEdge') || '0.01')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const includeSeen = searchParams.get('includeSeen') === '1'

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM ArbOpportunity WHERE edge >= ?'
      const binds: unknown[] = [minEdge]

      if (!includeSeen) query += ' AND seen = 0'
      if (sport) { query += ' AND sport = ?'; binds.push(sport) }
      query += ' ORDER BY edge DESC LIMIT ?'
      binds.push(limit)

      const stmt = db.prepare(query)
      const result = await stmt.bind(...binds).all()
      const opportunities = (result.results || []) as Record<string, unknown>[]

      if (!includeSeen && opportunities.length > 0) {
        for (const o of opportunities) {
          await db.prepare('UPDATE ArbOpportunity SET seen = 1 WHERE id = ?').bind(o.id).run()
        }
      }

      return NextResponse.json({ opportunities })
    } catch {
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = { edge: { gte: minEdge } }
      if (!includeSeen) where.seen = false
      if (sport) where.sport = sport

      const opportunities = await db.arbOpportunity.findMany({ where, orderBy: { edge: 'desc' }, take: limit })

      if (!includeSeen && opportunities.length > 0) {
        await db.arbOpportunity.updateMany({
          where: { id: { in: opportunities.map((o) => o.id) } },
          data: { seen: true },
        })
      }

      return NextResponse.json({
        opportunities: opportunities.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })),
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

// GET /api/value-bets
async function getValueBets(request: Request, _pp: Record<string, string>) {
  try {
    await requireAuthFromRequest(request)

    const { searchParams } = new URL(request.url)
    const sport = searchParams.get('sport')

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM ScrapedEvent'
      const binds: unknown[] = []
      if (sport) { query += ' WHERE sport = ?'; binds.push(sport) }
      query += ' ORDER BY fetchedAt DESC LIMIT 500'

      const stmt = db.prepare(query)
      const result = await (binds.length > 0 ? stmt.bind(...binds) : stmt).all()
      const scrapedEvents = (result.results || []) as Record<string, unknown>[]

      if (!Array.isArray(scrapedEvents) || scrapedEvents.length === 0) {
        return NextResponse.json({ valueBets: [] })
      }

      const valueBets = computeValueBets(scrapedEvents)
      return NextResponse.json({ valueBets })
    } catch {
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = {}
      if (sport) where.sport = sport

      const scrapedEvents = await db.scrapedEvent.findMany({ where, orderBy: { fetchedAt: 'desc' }, take: 500 })

      if (scrapedEvents.length === 0) {
        return NextResponse.json({ valueBets: [] })
      }

      const mapped = scrapedEvents.map((e) => ({ ...e, matchTime: e.matchTime.toISOString(), fetchedAt: e.fetchedAt.toISOString() }))
      const valueBets = computeValueBets(mapped)
      return NextResponse.json({ valueBets })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function computeValueBets(events: Record<string, unknown>[]) {
  const eventGroups = new Map<string, Record<string, unknown>[]>()

  for (const event of events) {
    const key = `${event.homeTeam}|${event.awayTeam}|${event.matchTime}`
    if (!eventGroups.has(key)) eventGroups.set(key, [])
    eventGroups.get(key)!.push(event)
  }

  const valueBets: Array<Record<string, unknown>> = []

  for (const [, group] of eventGroups) {
    if (group.length < 2) continue

    const providerOdds = new Map<string, Record<string, Record<string, number>>>()

    for (const row of group) {
      let odds: Record<string, Record<string, number>> = {}
      try { odds = JSON.parse((row.oddsSnapshot as string) || '{}') } catch { continue }
      providerOdds.set(row.provider as string, odds)
    }

    if (providerOdds.size < 2) continue

    const allMarkets = new Map<string, Map<string, { odds: number; provider: string }[]>>()

    for (const [provider, markets] of providerOdds) {
      for (const [market, selections] of Object.entries(markets)) {
        if (!allMarkets.has(market)) allMarkets.set(market, new Map())
        const marketMap = allMarkets.get(market)!
        for (const [selection, odds] of Object.entries(selections)) {
          if (!marketMap.has(selection)) marketMap.set(selection, [])
          marketMap.get(selection)!.push({ odds: odds as number, provider })
        }
      }
    }

    for (const [market, selections] of allMarkets) {
      for (const [selection, entries] of selections) {
        if (entries.length < 2) continue
        const avgOdds = entries.reduce((s, e) => s + e.odds, 0) / entries.length

        for (const entry of entries) {
          if (entry.odds > avgOdds * 1.05) {
            const edge = (entry.odds / avgOdds) - 1
            valueBets.push({
              id: crypto.randomUUID(), eventId: group[0].id, sport: group[0].sport,
              competition: group[0].category || '', homeTeam: group[0].homeTeam, awayTeam: group[0].awayTeam,
              marketType: market, selection, bookmaker: entry.provider, odds: entry.odds,
              consensusOdds: Math.round(avgOdds * 100) / 100, edge: Math.round(edge * 10000) / 10000,
              startsAt: group[0].matchTime,
            })
          }
        }
      }
    }
  }

  valueBets.sort((a, b) => (b.edge as number) - (a.edge as number))
  return valueBets.slice(0, 50)
}

// GET /api/arbs
async function getArbs(request: Request, _pp: Record<string, string>) {
  try {
    await requireAuthFromRequest(request)

    const { searchParams } = new URL(request.url)
    const sport = searchParams.get('sport')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const minEdge = parseFloat(searchParams.get('minEdge') || '0')
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM ArbOpportunity WHERE 1=1'
      const binds: unknown[] = []

      if (sport) { query += ' AND sport = ?'; binds.push(sport) }
      if (from) { query += ' AND createdAt >= ?'; binds.push(from) }
      if (to) { query += ' AND createdAt <= ?'; binds.push(to) }
      if (minEdge > 0) { query += ' AND edge >= ?'; binds.push(minEdge) }
      query += ' ORDER BY createdAt DESC LIMIT ?'
      binds.push(limit)

      const stmt = db.prepare(query)
      const result = await stmt.bind(...binds).all()

      return NextResponse.json({ arbs: result.results || [] })
    } catch {
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = {}
      if (sport) where.sport = sport
      if (minEdge > 0) where.edge = { gte: minEdge }
      if (from || to) {
        where.createdAt = {}
        if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from)
        if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to)
      }

      const arbs = await db.arbOpportunity.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit })

      return NextResponse.json({ arbs: arbs.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })) })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/arbs/log
async function postArbsLog(request: Request, _pp: Record<string, string>) {
  try {
    await requireAuthFromRequest(request)

    const body = await request.json()
    const { eventId, sport, competition, homeTeam, awayTeam, marketType, selection1, selection2, bookmaker1, bookmaker2, odds1, odds2, edge } = body

    if (!sport || !homeTeam || !awayTeam || !marketType || !selection1 || !selection2 || !bookmaker1 || !bookmaker2 || odds1 == null || odds2 == null || edge == null) {
      return NextResponse.json(
        { error: 'Missing required fields: sport, homeTeam, awayTeam, marketType, selection1, selection2, bookmaker1, bookmaker2, odds1, odds2, edge' },
        { status: 400 },
      )
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const impliedProb1 = Math.round((1 / odds1) * 10000) / 10000
    const impliedProb2 = Math.round((1 / odds2) * 10000) / 10000

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      await db.prepare(
        `INSERT INTO ArbOpportunity (id, eventId, sport, competition, homeTeam, awayTeam, marketType, selection1, selection2, bookmaker1, bookmaker2, odds1, odds2, edge, impliedProb1, impliedProb2, seen, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      ).bind(id, eventId || null, sport, competition || '', homeTeam, awayTeam, marketType, selection1, selection2, bookmaker1, bookmaker2, odds1, odds2, edge, impliedProb1, impliedProb2, now).run()

      return NextResponse.json({ id, createdAt: now }, { status: 201 })
    } catch {
      const { db } = await import('@/lib/db')

      const arb = await db.arbOpportunity.create({
        data: {
          eventId: eventId || null, sport, competition: competition || '', homeTeam, awayTeam,
          marketType, selection1, selection2, bookmaker1, bookmaker2, odds1, odds2, edge, impliedProb1, impliedProb2,
        },
      })

      return NextResponse.json({ id: arb.id, createdAt: arb.createdAt.toISOString() }, { status: 201 })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ════════════════════════════════════════════════════════════════════════
// BOOKMAKER & SPORTS HANDLERS
// ════════════════════════════════════════════════════════════════════════

// GET /api/bookmakers
async function getBookmakers(request: Request, _pp: Record<string, string>) {
  try {
    await requireAuthFromRequest(request)

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      const result = await db.prepare('SELECT * FROM Bookmaker ORDER BY name ASC').all()
      const bookmakers = (result.results || []) as Record<string, unknown>[]
      const mapped = bookmakers.map((b) => ({
        id: b.id, name: b.name, slug: b.slug,
        isActive: b.isActive === 1 || b.isActive === true,
        lastScrapeAt: b.lastScrapeAt || null, lastError: b.lastError || null,
        eventsCount: b.eventsCount || 0, createdAt: b.createdAt, updatedAt: b.updatedAt,
      }))

      return NextResponse.json({ bookmakers: mapped })
    } catch {
      const { db } = await import('@/lib/db')

      const bookmakers = await db.bookmaker.findMany({ orderBy: { name: 'asc' } })
      const mapped = bookmakers.map((b) => ({
        id: b.id, name: b.name, slug: b.slug, isActive: b.isActive,
        lastScrapeAt: b.lastScrapeAt?.toISOString() || null, lastError: b.lastError || null,
        eventsCount: b.eventsCount, createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString(),
      }))

      return NextResponse.json({ bookmakers: mapped })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/sports
async function getSports(request: Request, _pp: Record<string, string>) {
  try {
    await requireAuthFromRequest(request)

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      const result = await db.prepare('SELECT sport, COUNT(*) as eventCount FROM ScrapedEvent GROUP BY sport ORDER BY eventCount DESC').all()
      return NextResponse.json({ sports: result.results || [] })
    } catch {
      const { db } = await import('@/lib/db')

      const sports = await db.scrapedEvent.groupBy({
        by: ['sport'], _count: { id: true }, orderBy: { _count: { id: 'desc' } },
      })

      const mapped = sports.map((s) => ({ sport: s.sport, eventCount: s._count.id }))
      return NextResponse.json({ sports: mapped })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ════════════════════════════════════════════════════════════════════════
// BET HANDLERS
// ════════════════════════════════════════════════════════════════════════

// GET /api/bets
async function getBets(request: Request, _pp: Record<string, string>) {
  try {
    const user = await requireAuthFromRequest(request)

    const { searchParams } = new URL(request.url)
    const sport = searchParams.get('sport')
    const result = searchParams.get('result')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM Bet WHERE userId = ?'
      const binds: unknown[] = [user.id]

      if (sport) { query += ' AND sport = ?'; binds.push(sport) }
      if (result) { query += ' AND result = ?'; binds.push(result) }

      const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total')
      const countResult = await db.prepare(countQuery).bind(...binds).first<{ total: number }>()
      const total = countResult?.total ?? 0

      query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?'
      binds.push(limit, offset)

      const stmt = db.prepare(query)
      const betsResult = await stmt.bind(...binds).all()
      const bets = (betsResult.results || []) as Record<string, unknown>[]

      return NextResponse.json({ bets, total, limit, offset })
    } catch {
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = { userId: user.id }
      if (sport) where.sport = sport
      if (result) where.result = result

      const [bets, total] = await Promise.all([
        db.bet.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
        db.bet.count({ where }),
      ])

      return NextResponse.json({
        bets: bets.map((b) => ({
          ...b, createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString(),
          settledAt: b.settledAt?.toISOString() || null,
        })),
        total, limit, offset,
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

// POST /api/bets
async function postBet(request: Request, _pp: Record<string, string>) {
  try {
    const user = await requireAuthFromRequest(request)

    const body = await request.json()
    const { externalEventId, provider, sport, competition, homeTeam, awayTeam, market, selection, odds, stake, notes } = body

    if (!homeTeam || !awayTeam || !market || !selection || odds == null || stake == null) {
      return NextResponse.json(
        { error: 'Missing required fields: homeTeam, awayTeam, market, selection, odds, stake' },
        { status: 400 },
      )
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      await db.prepare(
        `INSERT INTO Bet (id, userId, externalEventId, provider, sport, competition, homeTeam, awayTeam, market, selection, odds, stake, result, payout, settledAt, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?)`
      ).bind(id, user.id, externalEventId || null, provider || null, sport || null, competition || null, homeTeam, awayTeam, market, selection, odds, stake, notes || null, now, now).run()

      return NextResponse.json({ id, createdAt: now }, { status: 201 })
    } catch {
      const { db } = await import('@/lib/db')

      const bet = await db.bet.create({
        data: {
          userId: user.id, externalEventId: externalEventId || null, provider: provider || null,
          sport: sport || null, competition: competition || null, homeTeam, awayTeam, market,
          selection, odds, stake, notes: notes || null,
        },
      })

      return NextResponse.json({ id: bet.id, createdAt: bet.createdAt.toISOString() }, { status: 201 })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/bets/analytics
async function getBetsAnalytics(request: Request, _pp: Record<string, string>) {
  try {
    const user = await requireAuthFromRequest(request)

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      const [totalResult, wonResult, lostResult, pendingResult, stakeResult, payoutResult] = await Promise.all([
        db.prepare('SELECT COUNT(*) as count FROM Bet WHERE userId = ?').bind(user.id).first<{ count: number }>(),
        db.prepare("SELECT COUNT(*) as count FROM Bet WHERE userId = ? AND result = 'won'").bind(user.id).first<{ count: number }>(),
        db.prepare("SELECT COUNT(*) as count FROM Bet WHERE userId = ? AND result = 'lost'").bind(user.id).first<{ count: number }>(),
        db.prepare("SELECT COUNT(*) as count FROM Bet WHERE userId = ? AND result = 'pending'").bind(user.id).first<{ count: number }>(),
        db.prepare('SELECT COALESCE(SUM(stake), 0) as total FROM Bet WHERE userId = ?').bind(user.id).first<{ total: number }>(),
        db.prepare("SELECT COALESCE(SUM(payout), 0) as total FROM Bet WHERE userId = ? AND result IN ('won', 'void', 'cashout')").bind(user.id).first<{ total: number }>(),
      ])

      const totalBets = totalResult?.count ?? 0
      const wonBets = wonResult?.count ?? 0
      const lostBets = lostResult?.count ?? 0
      const pendingBets = pendingResult?.count ?? 0
      const totalStake = stakeResult?.total ?? 0
      const totalPayout = payoutResult?.total ?? 0
      const profitLoss = totalPayout - totalStake

      const sportResult = await db.prepare(
        `SELECT sport, COUNT(*) as totalBets, SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as wonBets,
                SUM(CASE WHEN result = 'lost' THEN 1 ELSE 0 END) as lostBets, SUM(stake) as totalStake,
                SUM(CASE WHEN result IN ('won', 'void', 'cashout') THEN COALESCE(payout, 0) ELSE 0 END) as totalPayout
         FROM Bet WHERE userId = ? AND sport IS NOT NULL GROUP BY sport ORDER BY totalBets DESC`
      ).bind(user.id).all()
      const bySport = (sportResult.results || []) as Record<string, unknown>[]

      const twelveMonthsAgo = new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000).toISOString()
      const monthResult = await db.prepare(
        `SELECT strftime('%Y-%m', createdAt) as month, COUNT(*) as totalBets,
                SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as wonBets,
                SUM(CASE WHEN result = 'lost' THEN 1 ELSE 0 END) as lostBets, SUM(stake) as totalStake,
                SUM(CASE WHEN result IN ('won', 'void', 'cashout') THEN COALESCE(payout, 0) ELSE 0 END) as totalPayout
         FROM Bet WHERE userId = ? AND createdAt >= ? GROUP BY month ORDER BY month DESC`
      ).bind(user.id, twelveMonthsAgo).all()
      const byMonth = (monthResult.results || []) as Record<string, unknown>[]

      return NextResponse.json({
        summary: {
          totalBets, wonBets, lostBets, pendingBets,
          totalStake: Math.round(totalStake * 100) / 100,
          totalPayout: Math.round(totalPayout * 100) / 100,
          profitLoss: Math.round(profitLoss * 100) / 100,
          winRate: totalBets > 0 ? Math.round((wonBets / (wonBets + lostBets)) * 10000) / 100 : 0,
        },
        bySport: bySport.map((s) => ({
          sport: s.sport, totalBets: s.totalBets, wonBets: s.wonBets, lostBets: s.lostBets,
          totalStake: Math.round((s.totalStake as number) * 100) / 100,
          totalPayout: Math.round((s.totalPayout as number) * 100) / 100,
          profitLoss: Math.round(((s.totalPayout as number) - (s.totalStake as number)) * 100) / 100,
        })),
        byMonth: byMonth.map((m) => ({
          month: m.month, totalBets: m.totalBets, wonBets: m.wonBets, lostBets: m.lostBets,
          totalStake: Math.round((m.totalStake as number) * 100) / 100,
          totalPayout: Math.round((m.totalPayout as number) * 100) / 100,
          profitLoss: Math.round(((m.totalPayout as number) - (m.totalStake as number)) * 100) / 100,
        })),
      })
    } catch {
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

      const sportAgg = await db.bet.groupBy({
        by: ['sport'], where: { ...where, sport: { not: null } },
        _count: { id: true }, _sum: { stake: true, payout: true },
        orderBy: { _count: { id: 'desc' } },
      })

      const bySport = sportAgg.map((s) => ({
        sport: s.sport, totalBets: s._count.id,
        totalStake: Math.round((s._sum.stake || 0) * 100) / 100,
        totalPayout: Math.round((s._sum.payout || 0) * 100) / 100,
      }))

      const twelveMonthsAgo = new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000)
      const recentBets = await db.bet.findMany({
        where: { ...where, createdAt: { gte: twelveMonthsAgo } },
        select: { createdAt: true, stake: true, payout: true, result: true },
      })

      const monthMap = new Map<string, { totalBets: number; wonBets: number; lostBets: number; totalStake: number; totalPayout: number }>()

      for (const bet of recentBets) {
        const month = bet.createdAt.toISOString().slice(0, 7)
        if (!monthMap.has(month)) monthMap.set(month, { totalBets: 0, wonBets: 0, lostBets: 0, totalStake: 0, totalPayout: 0 })
        const entry = monthMap.get(month)!
        entry.totalBets++
        if (bet.result === 'won') entry.wonBets++
        if (bet.result === 'lost') entry.lostBets++
        entry.totalStake += bet.stake
        entry.totalPayout += bet.payout || 0
      }

      const byMonth = Array.from(monthMap.entries())
        .map(([month, data]) => ({
          month, ...data,
          totalStake: Math.round(data.totalStake * 100) / 100,
          totalPayout: Math.round(data.totalPayout * 100) / 100,
          profitLoss: Math.round((data.totalPayout - data.totalStake) * 100) / 100,
        }))
        .sort((a, b) => b.month.localeCompare(a.month))

      return NextResponse.json({
        summary: {
          totalBets, wonBets, lostBets, pendingBets,
          totalStake: Math.round(totalStake * 100) / 100,
          totalPayout: Math.round(totalPayout * 100) / 100,
          profitLoss: Math.round(profitLoss * 100) / 100,
          winRate: totalBets > 0 ? Math.round((wonBets / (wonBets + lostBets)) * 10000) / 100 : 0,
        },
        bySport, byMonth,
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

// POST /api/bets/import
async function postBetsImport(request: Request, _pp: Record<string, string>) {
  try {
    const user = await requireAuthFromRequest(request)

    const body = await request.json()
    const bets = body.bets

    if (!Array.isArray(bets) || bets.length === 0) {
      return NextResponse.json({ error: 'bets array is required (minimum 1 bet)' }, { status: 400 })
    }

    if (bets.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 bets per import' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const created: Array<{ id: string; createdAt: string }> = []
    const errors: Array<{ index: number; error: string }> = []

    for (let i = 0; i < bets.length; i++) {
      const b = bets[i]
      if (!b.homeTeam || !b.awayTeam || !b.market || !b.selection || b.odds == null || b.stake == null) {
        errors.push({ index: i, error: 'Missing required fields: homeTeam, awayTeam, market, selection, odds, stake' })
        continue
      }

      const id = crypto.randomUUID()

      try {
        const D1 = await import('@/lib/cloudflare-db')
        const db = await D1.getD1()

        await db.prepare(
          `INSERT INTO Bet (id, userId, externalEventId, provider, sport, competition, homeTeam, awayTeam, market, selection, odds, stake, result, payout, settledAt, notes, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?)`
        ).bind(id, user.id, b.externalEventId || null, b.provider || null, b.sport || null, b.competition || null, b.homeTeam, b.awayTeam, b.market, b.selection, b.odds, b.stake, b.notes || null, now, now).run()

        created.push({ id, createdAt: now })
      } catch {
        try {
          const { db } = await import('@/lib/db')
          await db.bet.create({
            data: {
              userId: user.id, externalEventId: b.externalEventId || null, provider: b.provider || null,
              sport: b.sport || null, competition: b.competition || null, homeTeam: b.homeTeam, awayTeam: b.awayTeam,
              market: b.market, selection: b.selection, odds: b.odds, stake: b.stake, notes: b.notes || null,
            },
          })
          created.push({ id, createdAt: now })
        } catch (err) {
          errors.push({ index: i, error: String(err) })
        }
      }
    }

    return NextResponse.json({
      imported: created.length, failed: errors.length, bets: created,
      errors: errors.length > 0 ? errors : undefined,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/bets/settle
async function postBetsSettle(request: Request, _pp: Record<string, string>) {
  try {
    const user = await requireAuthFromRequest(request)

    const body = await request.json()
    const { id, result, payout } = body

    if (!id || !result) {
      return NextResponse.json({ error: 'id and result are required' }, { status: 400 })
    }

    const validResults = ['won', 'lost', 'void']
    if (!validResults.includes(result)) {
      return NextResponse.json({ error: `result must be one of: ${validResults.join(', ')}` }, { status: 400 })
    }

    const now = new Date().toISOString()

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      const bet = await db.prepare('SELECT * FROM Bet WHERE id = ?').bind(id).first()
      if (!bet) {
        return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
      }

      const betData = bet as Record<string, unknown>
      if (betData.userId !== user.id && user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const finalPayout = payout ?? (result === 'won' ? Math.round(((betData.odds as number) * (betData.stake as number)) * 100) / 100 : 0)

      await db.prepare('UPDATE Bet SET result = ?, payout = ?, settledAt = ?, updatedAt = ? WHERE id = ?')
        .bind(result, finalPayout, now, now, id).run()

      return NextResponse.json({ id, result, payout: finalPayout, settledAt: now })
    } catch {
      const { db } = await import('@/lib/db')

      const bet = await db.bet.findUnique({ where: { id } })
      if (!bet) return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
      if (bet.userId !== user.id && user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const finalPayout = payout ?? (result === 'won' ? Math.round(bet.odds * bet.stake * 100) / 100 : 0)

      await db.bet.update({ where: { id }, data: { result, payout: finalPayout, settledAt: new Date() } })
      return NextResponse.json({ id, result, payout: finalPayout, settledAt: now })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/bets/:id
async function patchBet(request: Request, pp: Record<string, string>) {
  try {
    const user = await requireAuthFromRequest(request)
    const id = pp.id

    const body = await request.json()
    const { stake, odds, market, selection, notes, result } = body

    if (stake == null && odds == null && !market && !selection && notes === undefined && !result) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const now = new Date().toISOString()

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      const bet = await db.prepare('SELECT * FROM Bet WHERE id = ?').bind(id).first()
      if (!bet) return NextResponse.json({ error: 'Bet not found' }, { status: 404 })

      const betData = bet as Record<string, unknown>
      if (betData.userId !== user.id && user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const fields: string[] = []
      const values: unknown[] = []

      if (stake != null) { fields.push('stake = ?'); values.push(stake) }
      if (odds != null) { fields.push('odds = ?'); values.push(odds) }
      if (market) { fields.push('market = ?'); values.push(market) }
      if (selection) { fields.push('selection = ?'); values.push(selection) }
      if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }
      if (result) { fields.push('result = ?'); values.push(result) }
      fields.push('updatedAt = ?')
      values.push(now)
      values.push(id)

      await db.prepare(`UPDATE Bet SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()

      return NextResponse.json({ id, updatedAt: now })
    } catch {
      const { db } = await import('@/lib/db')

      const bet = await db.bet.findUnique({ where: { id } })
      if (!bet) return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
      if (bet.userId !== user.id && user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const updateData: Record<string, unknown> = {}
      if (stake != null) updateData.stake = stake
      if (odds != null) updateData.odds = odds
      if (market) updateData.market = market
      if (selection) updateData.selection = selection
      if (notes !== undefined) updateData.notes = notes
      if (result) updateData.result = result

      await db.bet.update({ where: { id }, data: updateData })
      return NextResponse.json({ id, updatedAt: now })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/bets/:id
async function deleteBet(request: Request, pp: Record<string, string>) {
  try {
    const user = await requireAuthFromRequest(request)
    const id = pp.id
    const now = new Date().toISOString()

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      const bet = await db.prepare('SELECT * FROM Bet WHERE id = ?').bind(id).first()
      if (!bet) return NextResponse.json({ error: 'Bet not found' }, { status: 404 })

      const betData = bet as Record<string, unknown>
      if (betData.userId !== user.id && user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      await db.prepare("UPDATE Bet SET result = 'void', settledAt = ?, updatedAt = ? WHERE id = ?")
        .bind(now, now, id).run()

      return NextResponse.json({ id, deleted: true, settledAt: now })
    } catch {
      const { db } = await import('@/lib/db')

      const bet = await db.bet.findUnique({ where: { id } })
      if (!bet) return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
      if (bet.userId !== user.id && user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      await db.bet.update({ where: { id }, data: { result: 'void', settledAt: new Date() } })
      return NextResponse.json({ id, deleted: true, settledAt: now })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ════════════════════════════════════════════════════════════════════════
// AI PICK HANDLERS
// ════════════════════════════════════════════════════════════════════════

// GET /api/ai-picks
async function getAiPicks(request: Request, _pp: Record<string, string>) {
  try {
    const user = await requireAuthFromRequest(request)

    const { searchParams } = new URL(request.url)
    const sport = searchParams.get('sport')
    const result = searchParams.get('result')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM AiPickLog WHERE userId = ?'
      const binds: unknown[] = [user.id]
      if (sport) { query += ' AND sport = ?'; binds.push(sport) }
      if (result) { query += ' AND result = ?'; binds.push(result) }
      query += ' ORDER BY createdAt DESC LIMIT ?'
      binds.push(limit)

      const stmt = db.prepare(query)
      const picksResult = await stmt.bind(...binds).all()

      return NextResponse.json({ picks: picksResult.results || [] })
    } catch {
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = { userId: user.id }
      if (sport) where.sport = sport
      if (result) where.result = result

      const picks = await db.aiPickLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit })

      return NextResponse.json({
        picks: picks.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), settledAt: p.settledAt?.toISOString() || null })),
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

// POST /api/ai-picks/log
async function postAiPickLog(request: Request, _pp: Record<string, string>) {
  try {
    const user = await requireAuthFromRequest(request)

    const body = await request.json()
    const { sport, competition, homeTeam, awayTeam, market, selection, odds, confidence, reasoning, sourceEventId } = body

    if (!sport || !homeTeam || !awayTeam || !market || !selection || odds == null) {
      return NextResponse.json(
        { error: 'Missing required fields: sport, homeTeam, awayTeam, market, selection, odds' },
        { status: 400 },
      )
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      await db.prepare(
        `INSERT INTO AiPickLog (id, userId, sport, competition, homeTeam, awayTeam, market, selection, odds, confidence, reasoning, sourceEventId, result, settledAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?)`
      ).bind(id, user.id, sport, competition || null, homeTeam, awayTeam, market, selection, odds, confidence ?? null, reasoning ?? null, sourceEventId ?? null, now).run()

      return NextResponse.json({ id, createdAt: now }, { status: 201 })
    } catch {
      const { db } = await import('@/lib/db')

      const pick = await db.aiPickLog.create({
        data: {
          userId: user.id, sport, competition: competition || null, homeTeam, awayTeam, market, selection, odds,
          confidence: confidence ?? null, reasoning: reasoning ?? null, sourceEventId: sourceEventId ?? null,
        },
      })

      return NextResponse.json({ id: pick.id, createdAt: pick.createdAt.toISOString() }, { status: 201 })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/ai-picks/settle
async function postAiPickSettle(request: Request, _pp: Record<string, string>) {
  try {
    const user = await requireAuthFromRequest(request)

    const body = await request.json()
    const { id, result } = body

    if (!id || !result) {
      return NextResponse.json({ error: 'id and result are required' }, { status: 400 })
    }

    const validResults = ['won', 'lost', 'void']
    if (!validResults.includes(result)) {
      return NextResponse.json({ error: `result must be one of: ${validResults.join(', ')}` }, { status: 400 })
    }

    const now = new Date().toISOString()

    try {
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      const pick = await db.prepare('SELECT * FROM AiPickLog WHERE id = ?').bind(id).first()
      if (!pick) return NextResponse.json({ error: 'AI pick not found' }, { status: 404 })

      const pickData = pick as Record<string, unknown>
      if (pickData.userId && pickData.userId !== user.id && user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      await db.prepare('UPDATE AiPickLog SET result = ?, settledAt = ? WHERE id = ?').bind(result, now, id).run()

      return NextResponse.json({ id, result, settledAt: now })
    } catch {
      const { db } = await import('@/lib/db')

      const pick = await db.aiPickLog.findUnique({ where: { id } })
      if (!pick) return NextResponse.json({ error: 'AI pick not found' }, { status: 404 })
      if (pick.userId && pick.userId !== user.id && user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      await db.aiPickLog.update({ where: { id }, data: { result, settledAt: new Date() } })
      return NextResponse.json({ id, result, settledAt: now })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION HANDLERS
// ════════════════════════════════════════════════════════════════════════

const VALID_TIERS = ['free', 'pro', 'enterprise'] as const

// POST /api/subscription/change-plan
async function postSubscriptionChangePlan(request: Request, _pp: Record<string, string>) {
  try {
    const authUser = await requireAuthFromRequest(request)

    const body = await request.json()
    const { tier } = body

    if (!tier || !VALID_TIERS.includes(tier as typeof VALID_TIERS[number])) {
      return NextResponse.json({ error: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}` }, { status: 400 })
    }

    try {
      return await handleChangePlanD1(authUser, tier)
    } catch {
      return await handleChangePlanPrisma(authUser, tier)
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}

async function handleChangePlanD1(authUser: AuthUser, tier: string) {
  const D1 = await import('@/lib/cloudflare-db')
  const db = await D1.getD1()
  const expiresAt = tier === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await D1.updateUser(db, authUser.id, { subscriptionTier: tier, subscriptionExpiresAt: expiresAt })
  await D1.createActivityLog(db, authUser.id, 'subscription_change', `Changed subscription to ${tier}`, null)

  const updatedUser = await D1.getUserById(db, authUser.id)

  return NextResponse.json({
    user: updatedUser
      ? {
          id: updatedUser.id as string, email: updatedUser.email as string,
          name: (updatedUser.name as string) || null, role: updatedUser.role as string,
          subscriptionTier: updatedUser.subscriptionTier as string,
          subscriptionExpiresAt: (updatedUser.subscriptionExpiresAt as string) || null,
          isActive: updatedUser.isActive === 1 || updatedUser.isActive === true,
          createdAt: updatedUser.createdAt as string, updatedAt: updatedUser.updatedAt as string,
        }
      : authUser,
  })
}

async function handleChangePlanPrisma(authUser: AuthUser, tier: string) {
  const { db } = await import('@/lib/db')

  const expiresAt = tier === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const user = await db.user.update({
    where: { id: authUser.id },
    data: { subscriptionTier: tier, subscriptionExpiresAt: expiresAt },
  })

  await db.activityLog.create({
    data: { userId: user.id, action: 'subscription_change', details: `Changed subscription to ${tier}` },
  })

  return NextResponse.json({
    user: {
      id: user.id, email: user.email, name: user.name, role: user.role,
      subscriptionTier: user.subscriptionTier,
      subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
      isActive: user.isActive, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString(),
    },
  })
}
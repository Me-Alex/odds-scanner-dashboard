'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Users,
  Shield,
  CreditCard,
  TrendingUp,
  Target,
  Search,
  MoreVertical,
  Activity,
  Database,
  Server,
  UserCog,
  CheckCircle,
  XCircle,
} from 'lucide-react'

// --- Types ---

interface AdminStats {
  totalUsers: number
  activeUsers: number
  proUsers: number
  enterpriseUsers: number
  totalBets: number
  totalArbs: number
  recentScrapes: number
  newUsersToday: number
}

interface AdminUser {
  id: string
  email: string
  name: string | null
  role: string
  subscriptionTier: string
  subscriptionExpiresAt: string | null
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

interface LocalUser extends AdminUser {
  passwordHash: string
}

interface ActivityEntry {
  id: string
  userEmail: string
  userName: string | null
  action: string
  details: string | null
  ipAddress: string | null
  createdAt: string
}

interface ScrapingEntry {
  id: string
  provider: string
  status: string
  eventsFound: number
  durationMs: number | null
  createdAt: string
}

// --- Helpers ---

const TOKEN_KEY = 'arbdesk_token'
const LOCAL_USERS_KEY = 'arbdesk_local_users'

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

function loadLocalUsers(): LocalUser[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(LOCAL_USERS_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as LocalUser[]
  } catch {
    return []
  }
}

function saveLocalUsers(users: LocalUser[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users))
}

function localUsersToAdminUsers(users: LocalUser[]): AdminUser[] {
  return users.map(({ passwordHash: _, ...u }) => u)
}

function deriveStatsFromLocalUsers(users: LocalUser[]): AdminStats {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

  return {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.isActive).length,
    proUsers: users.filter(u => u.subscriptionTier === 'pro' && u.isActive).length,
    enterpriseUsers: users.filter(u => u.subscriptionTier === 'enterprise' && u.isActive).length,
    totalBets: users.length * 14,
    totalArbs: users.filter(u => u.subscriptionTier !== 'free').length * 6,
    recentScrapes: 48,
    newUsersToday: users.filter(u => u.createdAt >= startOfToday).length,
  }
}

function generateDemoActivities(users: AdminUser[]): ActivityEntry[] {
  const actions = [
    { action: 'login', detail: 'User logged in successfully' },
    { action: 'page_view', detail: 'Viewed scanner dashboard' },
    { action: 'arb_alert', detail: 'Received arb opportunity alert' },
    { action: 'bet_tracked', detail: 'Tracked a new bet' },
    { action: 'subscription_change', detail: 'Subscription tier updated' },
    { action: 'register', detail: 'Created a new account' },
    { action: 'logout', detail: 'User logged out' },
  ]

  const ips = [
    '192.168.1.42', '10.0.0.15', '172.16.0.88', '203.0.113.50',
    '198.51.100.23', '85.214.132.117', '104.26.7.91', '35.190.12.4',
  ]

  if (users.length === 0) {
    const now = Date.now()
    return actions.map((a, i) => ({
      id: `demo-act-${i}`,
      userEmail: 'admin@arbdesk.com',
      userName: 'Admin',
      action: a.action,
      details: a.detail,
      ipAddress: ips[i % ips.length],
      createdAt: new Date(now - i * 3600000 * 2).toISOString(),
    }))
  }

  const now = Date.now()
  const entries: ActivityEntry[] = []
  for (let i = 0; i < Math.min(users.length * 3, 20); i++) {
    const user = users[i % users.length]
    const act = actions[i % actions.length]
    const hoursAgo = i * 1.5 + Math.random() * 2
    entries.push({
      id: `local-act-${i}`,
      userEmail: user.email,
      userName: user.name,
      action: act.action,
      details: act.detail,
      ipAddress: ips[i % ips.length],
      createdAt: new Date(now - hoursAgo * 3600000).toISOString(),
    })
  }

  return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

async function fetchAdmin<T>(path: string): Promise<T | null> {
  const token = getAuthToken()
  if (!token) return null
  try {
    const res = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// --- Component ---

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [scrapingLogs, setScrapingLogs] = useState<ScrapingEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [isStaticMode, setIsStaticMode] = useState(false)

  // Load stats with fallback
  useEffect(() => {
    fetchAdmin<{ stats: AdminStats }>('/api/admin/stats').then((data) => {
      if (data) {
        setStats(data.stats)
      } else {
        const localUsers = loadLocalUsers()
        setStats(deriveStatsFromLocalUsers(localUsers))
        setIsStaticMode(true)
      }
    })
  }, [])

  // Load users with fallback
  const loadUsers = useCallback(async (search?: string) => {
    const query = search !== undefined ? search : searchQuery
    const url = query
      ? `/api/admin/users?search=${encodeURIComponent(query)}`
      : '/api/admin/users'
    const data = await fetchAdmin<{ users: AdminUser[] }>(url)
    if (data) {
      setUsers(data.users)
    } else {
      const localUsers = loadLocalUsers()
      let filtered = localUsersToAdminUsers(localUsers)
      if (query) {
        const q = query.toLowerCase()
        filtered = filtered.filter(
          (u) =>
            u.email.toLowerCase().includes(q) ||
            (u.name && u.name.toLowerCase().includes(q)),
        )
      }
      setUsers(filtered)
      setIsStaticMode(true)
    }
  }, [searchQuery])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await loadUsers()
      setLoading(false)
    }
    load()
  }, [loadUsers])

  // Load activity with fallback
  useEffect(() => {
    fetchAdmin<{ activities: ActivityEntry[] }>('/api/admin/activity').then(
      (data) => {
        if (data) {
          setActivities(data.activities)
        } else {
          const localUsers = localUsersToAdminUsers(loadLocalUsers())
          setActivities(generateDemoActivities(localUsers))
        }
      },
    )
  }, [])

  // Load scraping logs with fallback
  useEffect(() => {
    fetchAdmin<{ logs: ScrapingEntry[] }>('/api/admin/scraping-logs').then(
      (data) => {
        if (data) {
          setScrapingLogs(data.logs)
        } else {
          const providers = ['Bet365', 'Pinnacle', 'DraftKings', 'FanDuel', 'BetMGM', 'Caesars']
          const statuses = ['success', 'success', 'success', 'partial', 'error']
          const now = Date.now()
          const demoLogs: ScrapingEntry[] = providers.map((provider, i) => {
            const status = statuses[i % statuses.length]
            return {
              id: `local-scrape-${i}`,
              provider,
              status,
              eventsFound: status === 'error' ? 0 : 40 + Math.floor(Math.random() * 60),
              durationMs: status === 'error' ? null : 800 + Math.floor(Math.random() * 2000),
              createdAt: new Date(now - i * 7200000).toISOString(),
            }
          })
          setScrapingLogs(demoLogs)
        }
      },
    )
  }, [])

  // Search handler
  const handleSearch = (value: string) => {
    setSearchQuery(value)
    loadUsers(value)
  }

  // User update — works for both API and localStorage
  const updateUser = async (userId: string, updates: Record<string, unknown>) => {
    if (isStaticMode) {
      const localUsers = loadLocalUsers()
      const idx = localUsers.findIndex((u) => u.id === userId)
      if (idx >= 0) {
        localUsers[idx] = {
          ...localUsers[idx],
          ...updates,
          updatedAt: new Date().toISOString(),
        }
        saveLocalUsers(localUsers)
        await loadUsers()
        // Also refresh stats since they're derived from local users
        setStats(deriveStatsFromLocalUsers(localUsers))
      }
      return
    }

    const token = getAuthToken()
    if (!token) return
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        loadUsers()
      } else {
        // API failed, fall back to localStorage
        const localUsers = loadLocalUsers()
        const idx = localUsers.findIndex((u) => u.id === userId)
        if (idx >= 0) {
          localUsers[idx] = {
            ...localUsers[idx],
            ...updates,
            updatedAt: new Date().toISOString(),
          }
          saveLocalUsers(localUsers)
          setUsers(localUsersToAdminUsers(localUsers))
          setIsStaticMode(true)
        }
      }
    } catch {
      // Network error — update localStorage directly
      const localUsers = loadLocalUsers()
      const idx = localUsers.findIndex((u) => u.id === userId)
      if (idx >= 0) {
        localUsers[idx] = {
          ...localUsers[idx],
          ...updates,
          updatedAt: new Date().toISOString(),
        }
        saveLocalUsers(localUsers)
        setUsers(localUsersToAdminUsers(localUsers))
        setIsStaticMode(true)
      }
    }
  }

  // --- Stat Cards ---
  const statCards = [
    {
      label: 'Total Users',
      value: stats?.totalUsers ?? 0,
      icon: Users,
      accentColor: 'text-blue-400',
      accentBg: 'bg-blue-500/10',
      iconBg: 'bg-blue-500/20',
    },
    {
      label: 'Active Subscriptions',
      value: stats?.activeUsers ?? 0,
      icon: CreditCard,
      accentColor: 'text-emerald-400',
      accentBg: 'bg-emerald-500/10',
      iconBg: 'bg-emerald-500/20',
    },
    {
      label: 'Bets Tracked',
      value: stats?.totalBets ?? 0,
      icon: TrendingUp,
      accentColor: 'text-amber-400',
      accentBg: 'bg-amber-500/10',
      iconBg: 'bg-amber-500/20',
    },
    {
      label: 'Arb Opportunities',
      value: stats?.totalArbs ?? 0,
      icon: Target,
      accentColor: 'text-rose-400',
      accentBg: 'bg-rose-500/10',
      iconBg: 'bg-rose-500/20',
    },
  ]

  // --- Render ---
  return (
    <div className="min-h-screen flex flex-col bg-[#0d1117] p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20">
            <Shield className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-sm text-gray-400">
              Manage users, monitor activity, and view system status
              {isStaticMode && (
                <span className="ml-2 text-amber-400/80">
                  (static mode — localStorage)
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <Card
            key={card.label}
            className="bg-[#161b22] border-[#30363d] hover:border-[#484f58] transition-colors"
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.accentColor}`}>
                    {card.value.toLocaleString()}
                  </p>
                </div>
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-lg ${card.iconBg}`}
                >
                  <card.icon className={`h-5 w-5 ${card.accentColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex-1">
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="bg-[#161b22] border border-[#30363d] mb-6">
            <TabsTrigger
              value="users"
              className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 text-gray-400"
            >
              <UserCog className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 text-gray-400"
            >
              <Activity className="h-4 w-4 mr-2" />
              Activity
            </TabsTrigger>
            <TabsTrigger
              value="system"
              className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 text-gray-400"
            >
              <Server className="h-4 w-4 mr-2" />
              System
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card className="bg-[#161b22] border-[#30363d]">
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="text-white text-lg">
                      Users Management
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      Manage user accounts, roles, and subscriptions
                    </CardDescription>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      placeholder="Search by name or email..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      className="pl-9 bg-[#0d1117] border-[#30363d] text-white placeholder:text-gray-500 focus:border-emerald-500/50"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton
                        key={i}
                        className="h-12 bg-[#21262d] rounded"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-[#30363d] hover:bg-transparent">
                          <TableHead className="text-gray-400 font-medium">
                            Name
                          </TableHead>
                          <TableHead className="text-gray-400 font-medium">
                            Email
                          </TableHead>
                          <TableHead className="text-gray-400 font-medium">
                            Role
                          </TableHead>
                          <TableHead className="text-gray-400 font-medium">
                            Tier
                          </TableHead>
                          <TableHead className="text-gray-400 font-medium">
                            Status
                          </TableHead>
                          <TableHead className="text-gray-400 font-medium">
                            Last Login
                          </TableHead>
                          <TableHead className="text-gray-400 font-medium text-right">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.length === 0 ? (
                          <TableRow className="border-[#30363d]">
                            <TableCell
                              colSpan={7}
                              className="text-center text-gray-500 py-8"
                            >
                              No users found
                            </TableCell>
                          </TableRow>
                        ) : (
                          users.map((u) => (
                            <TableRow
                              key={u.id}
                              className="border-[#30363d] hover:bg-[#1c2128] transition-colors"
                            >
                              <TableCell className="text-white font-medium">
                                {u.name || '—'}
                              </TableCell>
                              <TableCell className="text-gray-300">
                                {u.email}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    u.role === 'admin'
                                      ? 'destructive'
                                      : 'default'
                                  }
                                  className={
                                    u.role !== 'admin'
                                      ? 'bg-[#30363d] text-gray-300 hover:bg-[#30363d]'
                                      : ''
                                  }
                                >
                                  {u.role}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    u.subscriptionTier === 'pro'
                                      ? 'secondary'
                                      : u.subscriptionTier === 'enterprise'
                                        ? 'outline'
                                        : 'default'
                                  }
                                  className={
                                    u.subscriptionTier === 'enterprise'
                                      ? 'border-emerald-500/50 text-emerald-400 hover:bg-transparent'
                                      : u.subscriptionTier === 'free'
                                        ? 'bg-[#30363d] text-gray-300 hover:bg-[#30363d]'
                                        : ''
                                  }
                                >
                                  {u.subscriptionTier}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`h-2 w-2 rounded-full ${u.isActive ? 'bg-emerald-400' : 'bg-red-400'}`}
                                  />
                                  <span className="text-gray-300 text-sm">
                                    {u.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-gray-400 text-sm">
                                {formatDateTime(u.lastLoginAt)}
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#30363d]"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="bg-[#1c2128] border-[#30363d]"
                                  >
                                    <DropdownMenuItem
                                      className="text-gray-300 focus:bg-[#30363d] focus:text-white cursor-pointer"
                                      onClick={() =>
                                        updateUser(u.id, {
                                          role:
                                            u.role === 'admin'
                                              ? 'user'
                                              : 'admin',
                                        })
                                      }
                                    >
                                      <Shield className="h-4 w-4 mr-2" />
                                      Set as{' '}
                                      {u.role === 'admin' ? 'User' : 'Admin'}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-[#30363d]" />
                                    <DropdownMenuItem
                                      className="text-gray-300 focus:bg-[#30363d] focus:text-white cursor-pointer"
                                      onClick={() =>
                                        updateUser(u.id, {
                                          subscriptionTier: 'free',
                                        })
                                      }
                                      disabled={u.subscriptionTier === 'free'}
                                    >
                                      Free Tier
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-gray-300 focus:bg-[#30363d] focus:text-white cursor-pointer"
                                      onClick={() =>
                                        updateUser(u.id, {
                                          subscriptionTier: 'pro',
                                        })
                                      }
                                      disabled={u.subscriptionTier === 'pro'}
                                    >
                                      Pro Tier
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-gray-300 focus:bg-[#30363d] focus:text-white cursor-pointer"
                                      onClick={() =>
                                        updateUser(u.id, {
                                          subscriptionTier: 'enterprise',
                                        })
                                      }
                                      disabled={
                                        u.subscriptionTier === 'enterprise'
                                      }
                                    >
                                      Enterprise Tier
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-[#30363d]" />
                                    <DropdownMenuItem
                                      className={`focus:bg-[#30363d] focus:text-white cursor-pointer ${u.isActive ? 'text-rose-400' : 'text-emerald-400'}`}
                                      onClick={() =>
                                        updateUser(u.id, {
                                          isActive: !u.isActive,
                                        })
                                      }
                                    >
                                      {u.isActive ? (
                                        <>
                                          <XCircle className="h-4 w-4 mr-2" />
                                          Deactivate
                                        </>
                                      ) : (
                                        <>
                                          <CheckCircle className="h-4 w-4 mr-2" />
                                          Activate
                                        </>
                                      )}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card className="bg-[#161b22] border-[#30363d]">
              <CardHeader>
                <CardTitle className="text-white text-lg">
                  Recent Activity
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Latest user actions and system events
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {activities.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      No recent activity
                    </div>
                  ) : (
                    activities.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg bg-[#0d1117] border border-[#30363d] hover:border-[#484f58] transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-white truncate">
                              {entry.userName || entry.userEmail}
                            </span>
                            <Badge
                              variant="outline"
                              className="border-[#30363d] text-gray-400 text-xs shrink-0"
                            >
                              {entry.action}
                            </Badge>
                          </div>
                          {entry.details && (
                            <p className="text-xs text-gray-500 mt-1 truncate">
                              {entry.details}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-4 shrink-0 text-xs text-gray-500">
                          {entry.ipAddress && <span>IP: {entry.ipAddress}</span>}
                          <span>{formatDateTime(entry.createdAt)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Tab */}
          <TabsContent value="system">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Database Health */}
              <Card className="bg-[#161b22] border-[#30363d]">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-emerald-400" />
                    <CardTitle className="text-white text-lg">
                      Database Health
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
                      <span className="text-gray-300">Status</span>
                      <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 border-0">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {isStaticMode ? 'localStorage' : 'Operational'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
                      <span className="text-gray-300">Engine</span>
                      <span className="text-gray-400 text-sm">
                        {isStaticMode ? 'localStorage (in-browser)' : 'SQLite'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
                      <span className="text-gray-300">ORM</span>
                      <span className="text-gray-400 text-sm">
                        {isStaticMode ? 'Client-side JS' : 'Prisma'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Scraping Stats */}
              <Card className="bg-[#161b22] border-[#30363d]">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-blue-400" />
                    <CardTitle className="text-white text-lg">
                      Scraping Stats (24h)
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
                      <span className="text-gray-300">Recent Scrapes</span>
                      <span className="text-white font-semibold">
                        {stats?.recentScrapes ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
                      <span className="text-gray-300">Total Arbs Found</span>
                      <span className="text-white font-semibold">
                        {stats?.totalArbs ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
                      <span className="text-gray-300">New Users Today</span>
                      <span className="text-white font-semibold">
                        {stats?.newUsersToday ?? 0}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Scraping Logs */}
              <Card className="bg-[#161b22] border-[#30363d] md:col-span-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-rose-400" />
                    <CardTitle className="text-white text-lg">
                      Recent Scraping Logs
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto custom-scrollbar">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-[#30363d] hover:bg-transparent">
                          <TableHead className="text-gray-400 font-medium">
                            Provider
                          </TableHead>
                          <TableHead className="text-gray-400 font-medium">
                            Status
                          </TableHead>
                          <TableHead className="text-gray-400 font-medium">
                            Events Found
                          </TableHead>
                          <TableHead className="text-gray-400 font-medium">
                            Duration
                          </TableHead>
                          <TableHead className="text-gray-400 font-medium">
                            Time
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scrapingLogs.length === 0 ? (
                          <TableRow className="border-[#30363d]">
                            <TableCell
                              colSpan={5}
                              className="text-center text-gray-500 py-6"
                            >
                              No scraping logs available
                            </TableCell>
                          </TableRow>
                        ) : (
                          scrapingLogs.map((log) => (
                            <TableRow
                              key={log.id}
                              className="border-[#30363d] hover:bg-[#1c2128] transition-colors"
                            >
                              <TableCell className="text-white font-medium">
                                {log.provider}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    log.status === 'success'
                                      ? 'border-emerald-500/50 text-emerald-400 hover:bg-transparent'
                                      : log.status === 'partial'
                                        ? 'border-amber-500/50 text-amber-400 hover:bg-transparent'
                                        : 'border-red-500/50 text-red-400 hover:bg-transparent'
                                  }
                                >
                                  {log.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-gray-300">
                                {log.eventsFound}
                              </TableCell>
                              <TableCell className="text-gray-400 text-sm">
                                {log.durationMs != null
                                  ? `${(log.durationMs / 1000).toFixed(1)}s`
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-gray-400 text-sm">
                                {formatDateTime(log.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* System Info */}
              <Card className="bg-[#161b22] border-[#30363d] md:col-span-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-amber-400" />
                    <CardTitle className="text-white text-lg">
                      System Information
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
                      <p className="text-xs text-gray-500 mb-1">Framework</p>
                      <p className="text-white font-medium">Next.js 16</p>
                    </div>
                    <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
                      <p className="text-xs text-gray-500 mb-1">Runtime</p>
                      <p className="text-white font-medium">Node.js / Bun</p>
                    </div>
                    <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
                      <p className="text-xs text-gray-500 mb-1">Pro Users</p>
                      <p className="text-emerald-400 font-semibold">
                        {stats?.proUsers ?? 0}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
                      <p className="text-xs text-gray-500 mb-1">
                        Enterprise Users
                      </p>
                      <p className="text-emerald-400 font-semibold">
                        {stats?.enterpriseUsers ?? 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky Footer */}
      <footer className="mt-auto pt-8 pb-2 text-center">
        <div className="border-t border-[#30363d] pt-4">
          <p className="text-xs text-gray-500">
            &copy; 2025 Arb Desk. All rights reserved.
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Built with Next.js &amp; Prisma
          </p>
        </div>
      </footer>

      {/* Custom scrollbar styles */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0d1117;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #30363d;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #484f58;
        }
      `}</style>
    </div>
  )
}
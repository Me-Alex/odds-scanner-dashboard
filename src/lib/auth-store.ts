import { create } from 'zustand'

interface User {
  id: string
  email: string
  name: string | null
  role: string
  subscriptionTier: string
  subscriptionExpiresAt: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
  checkSession: () => Promise<void>
  clearError: () => void
}

const TOKEN_KEY = 'arbdesk_token'
const USER_KEY = 'arbdesk_user'

const ADMIN_EMAILS = ['admin@arbdesk.com', 'me.alex.21.3@gmail.com']

const SEED_USERS = [
  {
    id: 'seed-admin-1',
    email: 'admin@arbdesk.com',
    name: 'Admin',
    passwordHash: btoa('Admin123!'),
    role: 'admin',
    subscriptionTier: 'enterprise',
    subscriptionExpiresAt: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date('2025-01-01').toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-admin-2',
    email: 'me.alex.21.3@gmail.com',
    name: 'Alex',
    passwordHash: btoa('Alex123!'),
    role: 'admin',
    subscriptionTier: 'enterprise',
    subscriptionExpiresAt: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date('2025-01-01').toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

async function authFetch(
  url: string,
  options: RequestInit = {},
): Promise<{ user: User; token?: string }> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(url, { ...options, headers })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || 'An unexpected error occurred')
  }

  return data
}

function saveUserLocally(user: User, token?: string) {
  if (typeof window === 'undefined') return
  if (token) localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

function loadUserLocally(): { user: User; token: string | null } | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    const user = JSON.parse(raw) as User
    const token = localStorage.getItem(TOKEN_KEY)
    return { user, token }
  } catch {
    return null
  }
}

function clearLocalAuth() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token:
    typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null,
  isLoading: false,
  isAuthenticated: false,
  isAdmin: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const data = await authFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })

      saveUserLocally(data.user, data.token)

      set({
        user: data.user,
        token: data.token ?? null,
        isAuthenticated: true,
        isAdmin: data.user.role === 'admin',
        isLoading: false,
      })
    } catch {
      // Fallback for static deployment: try client-side auth
      const demoUsers = loadAllLocalUsers()
      const found = demoUsers.find(u => u.email === email)
      if (found && found.passwordHash === btoa(password)) {
        const { passwordHash: _, ...user } = found
        saveUserLocally(user as User, 'demo-token')
        set({
          user: user as User,
          token: 'demo-token',
          isAuthenticated: true,
          isAdmin: (user as User).role === 'admin',
          isLoading: false,
        })
        return
      }
      // Auto-create account on static site
      const newUser: User = {
        id: crypto.randomUUID(),
        email,
        name: email.split('@')[0],
        role: ADMIN_EMAILS.includes(email) ? 'admin' : 'user',
        subscriptionTier: ADMIN_EMAILS.includes(email) ? 'enterprise' : 'free',
        subscriptionExpiresAt: null,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      saveLocalUser({ ...newUser, passwordHash: btoa(password) })
      saveUserLocally(newUser, 'demo-token')
      set({
        user: newUser,
        token: 'demo-token',
        isAuthenticated: true,
        isAdmin: newUser.role === 'admin',
        isLoading: false,
      })
    }
  },

  register: async (email: string, password: string, name: string) => {
    set({ isLoading: true, error: null })
    try {
      const data = await authFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      })

      saveUserLocally(data.user, data.token)

      set({
        user: data.user,
        token: data.token ?? null,
        isAuthenticated: true,
        isAdmin: data.user.role === 'admin',
        isLoading: false,
      })
    } catch {
      // Fallback: create user locally
      const newUser: User = {
        id: crypto.randomUUID(),
        email,
        name,
        role: 'user',
        subscriptionTier: 'free',
        subscriptionExpiresAt: null,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      saveLocalUser({ ...newUser, passwordHash: btoa(password) })
      saveUserLocally(newUser, 'demo-token')
      set({
        user: newUser,
        token: 'demo-token',
        isAuthenticated: true,
        isAdmin: false,
        isLoading: false,
      })
    }
  },

  logout: async () => {
    set({ isLoading: true })
    try {
      await authFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Ignore errors on logout
    } finally {
      clearLocalAuth()
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isAdmin: false,
        isLoading: false,
        error: null,
      })
    }
  },

  checkSession: async () => {
    const existingToken =
      typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
    if (!existingToken) {
      set({ user: null, token: null, isAuthenticated: false, isAdmin: false })
      return
    }

    set({ isLoading: true })
    try {
      const data = await authFetch('/api/auth/me')
      set({
        user: data.user,
        token: existingToken,
        isAuthenticated: true,
        isAdmin: data.user.role === 'admin',
        isLoading: false,
      })
    } catch {
      // Fallback: try loading from localStorage
      const local = loadUserLocally()
      if (local && local.user) {
        set({
          user: local.user,
          token: local.token,
          isAuthenticated: true,
          isAdmin: local.user.role === 'admin',
          isLoading: false,
        })
      } else {
        clearLocalAuth()
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isAdmin: false,
          isLoading: false,
        })
      }
    }
  },

  clearError: () => set({ error: null }),
}))

// Local user storage for static deployment
interface LocalUser extends User {
  passwordHash: string
}

function getLocalUsersKey() {
  return 'arbdesk_local_users'
}

function loadAllLocalUsers(): LocalUser[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(getLocalUsersKey())
  let users: LocalUser[] = []
  if (raw) {
    try {
      users = JSON.parse(raw) as LocalUser[]
    } catch {
      users = []
    }
  }
  // Ensure seed users always exist
  for (const seed of SEED_USERS) {
    const idx = users.findIndex(u => u.email === seed.email)
    if (idx < 0) {
      users.push(seed)
    } else {
      // Update role/tier if seed says admin/enterprise but local was downgraded
      if (seed.role === 'admin') {
        users[idx].role = 'admin'
        users[idx].subscriptionTier = seed.subscriptionTier
      }
    }
  }
  // Save back
  localStorage.setItem(getLocalUsersKey(), JSON.stringify(users))
  return users
}

function saveLocalUser(user: LocalUser) {
  if (typeof window === 'undefined') return
  const users = loadAllLocalUsers()
  const idx = users.findIndex(u => u.email === user.email)
  if (idx >= 0) {
    users[idx] = user
  } else {
    users.push(user)
  }
  localStorage.setItem(getLocalUsersKey(), JSON.stringify(users))
}
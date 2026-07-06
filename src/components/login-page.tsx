'use client'

import { useState, type FormEvent } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Shield, UserPlus, LogIn, Eye, EyeOff, Radar, Zap } from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'

interface LoginPageProps {
  onAuthSuccess?: () => void
}

function GridBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      {/* Base dark background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0d1117]" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Circuit-like radial glow at center */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.08)_0%,transparent_70%)]" />

      {/* Top-left accent glow */}
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/5 blur-3xl" />

      {/* Bottom-right accent glow */}
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-emerald-500/5 blur-3xl" />
      </div>
      {children}
    </div>
  )
}

function LoginForm({ onAuthSuccess }: LoginPageProps) {
  const { login, isLoading, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()
    try {
      await login(email, password)
      onAuthSuccess?.()
    } catch {
      // error is set in the store
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="login-email" className="text-sm font-medium text-gray-300">
          Email
        </Label>
        <Input
          id="login-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
          className="border-gray-700 bg-[#161b22] text-gray-100 placeholder:text-gray-500 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-password" className="text-sm font-medium text-gray-300">
          Password
        </Label>
        <div className="relative">
          <Input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            className="border-gray-700 bg-[#161b22] pr-10 text-gray-100 placeholder:text-gray-500 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-300"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className="w-full bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-500/50"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Signing in...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <LogIn className="h-4 w-4" />
            Sign In
          </span>
        )}
      </Button>
    </form>
  )
}

function RegisterForm({ onAuthSuccess }: LoginPageProps) {
  const { register, isLoading, error, clearError } = useAuthStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()
    setLocalError(null)

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters')
      return
    }

    try {
      await register(email, password, name)
      onAuthSuccess?.()
    } catch {
      // error is set in the store
    }
  }

  const displayError = localError || error

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {displayError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {displayError}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="reg-name" className="text-sm font-medium text-gray-300">
          Name
        </Label>
        <Input
          id="reg-name"
          type="text"
          placeholder="John Doe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
          className="border-gray-700 bg-[#161b22] text-gray-100 placeholder:text-gray-500 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reg-email" className="text-sm font-medium text-gray-300">
          Email
        </Label>
        <Input
          id="reg-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
          className="border-gray-700 bg-[#161b22] text-gray-100 placeholder:text-gray-500 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reg-password" className="text-sm font-medium text-gray-300">
          Password
        </Label>
        <div className="relative">
          <Input
            id="reg-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            className="border-gray-700 bg-[#161b22] pr-10 text-gray-100 placeholder:text-gray-500 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-300"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reg-confirm" className="text-sm font-medium text-gray-300">
          Confirm Password
        </Label>
        <div className="relative">
          <Input
            id="reg-confirm"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={isLoading}
            className="border-gray-700 bg-[#161b22] pr-10 text-gray-100 placeholder:text-gray-500 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-300"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className="w-full bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-500/50"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Creating account...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Create Account
          </span>
        )}
      </Button>
    </form>
  )
}

export default function LoginPage({ onAuthSuccess }: LoginPageProps) {
  return (
    <GridBackground>
      <div className="min-h-screen flex flex-col">
        <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Branding */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 shadow-lg shadow-emerald-500/10">
                <Radar className="h-8 w-8 text-emerald-400" />
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Arb <span className="text-emerald-400">Desk</span>
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Real-time odds scanning & arbitrage detection
            </p>
          </div>

          {/* Auth Card */}
          <Card className="border-gray-800 bg-[#161b22]/80 shadow-2xl shadow-black/40 backdrop-blur-sm">
            <Tabs defaultValue="login" className="w-full">
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-xl text-white">Welcome back</CardTitle>
                <CardDescription className="text-gray-400">
                  Sign in to your account or create a new one
                </CardDescription>
              </CardHeader>

              <CardContent>
                <TabsList className="mb-6 grid w-full grid-cols-2 bg-[#0d1117]">
                  <TabsTrigger
                    value="login"
                    className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-gray-400 transition-all"
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger
                    value="register"
                    className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-gray-400 transition-all"
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Register
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <LoginForm onAuthSuccess={onAuthSuccess} />
                </TabsContent>

                <TabsContent value="register">
                  <RegisterForm onAuthSuccess={onAuthSuccess} />
                </TabsContent>
              </CardContent>

              <CardFooter className="flex flex-col gap-4 border-t border-gray-800 pt-6">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Secured with end-to-end encryption</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Zap className="h-3.5 w-3.5" />
                  <span>Free tier includes 50 scans/day</span>
                </div>
              </CardFooter>
            </Tabs>
          </Card>
        </div>
      </main>
        <footer className="mt-auto border-t border-[#30363d] bg-[#0d1117] py-4 text-center text-xs text-gray-500">
          © 2025 Arb Desk. All rights reserved.
        </footer>
      </div>
    </GridBackground>
  )
}
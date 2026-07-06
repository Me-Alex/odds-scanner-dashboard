'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import LoginPage from '@/components/login-page';
import DashboardPage from '@/components/dashboard-page';
import AdminPage from '@/components/admin-page';
import SubscriptionPage from '@/components/subscription-page';
import { Button } from '@/components/ui/button';
import { Radar, Crown, LogOut, Shield, CreditCard } from 'lucide-react';

type AppView = 'loading' | 'login' | 'dashboard' | 'admin' | 'subscription';

export default function Home() {
  const { user, isAuthenticated, isAdmin, isLoading, checkSession, logout } = useAuthStore();
  const [view, setView] = useState<AppView>('loading');

  useEffect(() => {
    checkSession().finally(() => {
      const { isAuthenticated: authed } = useAuthStore.getState();
      if (authed) {
        setView('dashboard');
      } else {
        setView('login');
      }
    });
  }, []);

  const handleAuthSuccess = useCallback(() => {
    setView('dashboard');
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setView('login');
  }, [logout]);

  const handleGoToAdmin = useCallback(() => setView('admin'), []);
  const handleGoToSubscription = useCallback(() => setView('subscription'), []);
  const handleBackToDashboard = useCallback(() => setView('dashboard'), []);

  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d1117' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Radar className="w-16 h-16 text-emerald-500 animate-pulse" />
            <div className="absolute inset-0 w-16 h-16 border-2 border-emerald-500/30 rounded-full animate-ping" />
          </div>
          <p className="text-gray-400 text-sm">Loading Arb Desk...</p>
        </div>
      </div>
    );
  }

  if (view === 'login') {
    return <LoginPage onAuthSuccess={handleAuthSuccess} />;
  }

  if (view === 'admin' && isAuthenticated && isAdmin) {
    return (
      <div>
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBackToDashboard} className="bg-[#161b22] border-[#30363d] text-gray-300 hover:bg-[#1c2333] hover:text-white">
            ← Dashboard
          </Button>
        </div>
        <AdminPage />
      </div>
    );
  }

  if (view === 'subscription' && isAuthenticated) {
    return (
      <SubscriptionPage
        currentTier={user?.subscriptionTier || 'free'}
        onBack={handleBackToDashboard}
      />
    );
  }

  if (view === 'dashboard' && isAuthenticated) {
    return (
      <div className="relative">
        {/* Floating top-right controls */}
        <div className="fixed top-3 right-3 z-50 flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGoToAdmin}
              className="bg-[#161b22] border-[#30363d] text-gray-300 hover:bg-[#1c2333] hover:text-white"
              title="Admin Panel"
            >
              <Shield className="w-3.5 h-3.5 mr-1.5" />
              Admin
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoToSubscription}
            className="bg-[#161b22] border-[#30363d] text-gray-300 hover:bg-[#1c2333] hover:text-white"
            title="Subscription Plans"
          >
            <CreditCard className="w-3.5 h-3.5 mr-1.5" />
            <span className="hidden sm:inline">Plan: </span>
            <Crown className="w-3 h-3 ml-1 text-amber-400" />
            <span className="text-emerald-400 capitalize text-xs ml-0.5">{user?.subscriptionTier || 'free'}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-gray-400 hover:text-red-400 hover:bg-red-500/10"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
        <DashboardPage />
      </div>
    );
  }

  return null;
}
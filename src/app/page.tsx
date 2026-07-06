'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import LandingPage from '@/components/landing-page';
import LoginPage from '@/components/login-page';
import DashboardPage from '@/components/dashboard-page';
import AdminPage from '@/components/admin-page';
import SubscriptionPage from '@/components/subscription-page';
import { Button } from '@/components/ui/button';

type AppView = 'landing' | 'login' | 'dashboard' | 'admin' | 'subscription';

export default function Home() {
  const { user, isAuthenticated, isAdmin, checkSession, logout } = useAuthStore();
  const [view, setView] = useState<AppView>('landing');

  useEffect(() => {
    checkSession().finally(() => {
      const { isAuthenticated: authed } = useAuthStore.getState();
      if (authed) {
        setView('dashboard');
      }
    });
  }, []);

  const handleAuthSuccess = useCallback(() => {
    setView('dashboard');
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setView('landing');
  }, [logout]);

  const handleGoToAdmin = useCallback(() => setView('admin'), []);
  const handleGoToSubscription = useCallback(() => setView('subscription'), []);
  const handleBackToDashboard = useCallback(() => setView('dashboard'), []);

  if (view === 'landing') {
    return <LandingPage onLogin={() => setView('login')} onRegister={() => setView('login')} />;
  }

  if (view === 'login') {
    return <LoginPage onAuthSuccess={handleAuthSuccess} />;
  }

  if (view === 'admin' && isAuthenticated && isAdmin) {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
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
      <DashboardPage
        onGoToAdmin={handleGoToAdmin}
        onGoToSubscription={handleGoToSubscription}
        onLogout={handleLogout}
      />
    );
  }

  return null;
}
import { useState } from 'react';
import { Sidebar, type Page } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { Dashboard } from '@/pages/Dashboard';
import { Positions } from '@/pages/Positions';
import { Transactions } from '@/pages/Transactions';
import { Portfolio } from '@/pages/Portfolio';
import { Analytics } from '@/pages/Analytics';
import { Risk } from '@/pages/Risk';
import { Optimization } from '@/pages/Optimization';
import { StressTest } from '@/pages/StressTest';
import { PortfolioComparison } from '@/pages/PortfolioComparison';
import { Backtesting } from '@/pages/Backtesting';
import { Profile } from '@/pages/Profile';
import { About } from '@/pages/About';
import { UserPicker } from '@/pages/UserPicker';
import { PortfolioProvider } from '@/context/PortfolioContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { cn } from '@/utils/cn';

const pages: Record<Page, React.ComponentType> = {
  dashboard: Dashboard,
  positions: Positions,
  transactions: Transactions,
  portfolio: Portfolio,
  analytics: Analytics,
  risk: Risk,
  optimization: Optimization,
  stress: StressTest,
  comparison: PortfolioComparison,
  backtest: Backtesting,
  profile: Profile,
  about: About,
};

function MainApp() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const PageComponent = pages[currentPage];

  return (
    <PortfolioProvider>
      <div className="min-h-screen bg-slate-950">
        <Sidebar
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <main className={cn(
          'transition-all duration-300 min-h-screen',
          sidebarCollapsed ? 'ml-16' : 'ml-60'
        )}>
          <TopBar />
          <div className="p-6 lg:p-8 max-w-[1600px]">
            <PageComponent />
          </div>
        </main>
      </div>
    </PortfolioProvider>
  );
}

function AppRouter() {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <UserPicker />;
  }

  return <MainApp />;
}

export function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

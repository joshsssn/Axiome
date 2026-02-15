import { useState } from 'react';
import { Sidebar, type Page } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { Dashboard } from '@/pages/Dashboard';
import { Positions } from '@/pages/Positions';
import { Transactions } from '@/pages/Transactions';
import { Sharing } from '@/pages/Sharing';
import { Portfolio } from '@/pages/Portfolio';
import { Analytics } from '@/pages/Analytics';
import { Risk } from '@/pages/Risk';
import { Optimization } from '@/pages/Optimization';
import { StressTest } from '@/pages/StressTest';
import { PortfolioComparison } from '@/pages/PortfolioComparison';
import { Backtesting } from '@/pages/Backtesting';
import { Admin } from '@/pages/Admin';
import { Profile } from '@/pages/Profile';
import { About } from '@/pages/About';
import { Login } from '@/pages/Login';
import { PortfolioProvider } from '@/context/PortfolioContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { cn } from '@/utils/cn';

const pages: Record<Page, React.ComponentType> = {
  dashboard: Dashboard,
  positions: Positions,
  transactions: Transactions,
  sharing: Sharing,
  portfolio: Portfolio,
  analytics: Analytics,
  risk: Risk,
  optimization: Optimization,
  stress: StressTest,
  comparison: PortfolioComparison,
  backtest: Backtesting,
  admin: Admin,
  profile: Profile,
  about: About,
};

function AuthenticatedApp() {
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
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Login />;
  }

  return <AuthenticatedApp />;
}

export function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

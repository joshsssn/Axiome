import {
  LayoutDashboard, Briefcase, TrendingUp, ShieldAlert,
  Target, Zap, ChevronLeft, ChevronRight, ListPlus,
  ArrowLeftRight, UserCircle, GitCompareArrows, History, Info,
  Users
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuth } from '@/context/AuthContext';
import axiomeLogo from '@/img/axiome-logo.png';
import axiomeFavicon from '@/img/logo.ico';

export type Page = 'dashboard' | 'positions' | 'transactions' | 'portfolio' | 'analytics' | 'risk' | 'optimization' | 'stress' | 'comparison' | 'backtest' | 'profile' | 'about';

const navItems: { id: Page; label: string; icon: React.ElementType; section?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Overview' },
  { id: 'positions', label: 'Instruments', icon: ListPlus, section: 'Overview' },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight, section: 'Overview' },
  { id: 'portfolio', label: 'Allocation', icon: Briefcase, section: 'Analytics' },
  { id: 'analytics', label: 'Performance', icon: TrendingUp, section: 'Analytics' },
  { id: 'risk', label: 'Risk', icon: ShieldAlert, section: 'Analytics' },
  { id: 'optimization', label: 'Optimization', icon: Target, section: 'Tools' },
  { id: 'stress', label: 'Stress Test', icon: Zap, section: 'Tools' },
  { id: 'comparison', label: 'Comparison', icon: GitCompareArrows, section: 'Tools' },
  { id: 'backtest', label: 'Backtesting', icon: History, section: 'Tools' },
  { id: 'profile', label: 'Profile', icon: UserCircle, section: 'System' },
  { id: 'about', label: 'About', icon: Info, section: 'System' },
];

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ currentPage, onNavigate, collapsed, onToggle }: SidebarProps) {
  const sections = [...new Set(navItems.map(i => i.section))];
  const { currentUser, switchUser } = useAuth();

  const initials = currentUser?.displayName
    ? currentUser.displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <div className={cn(
      'flex flex-col h-screen bg-slate-900 border-r border-slate-800 transition-all duration-300 fixed left-0 top-0 z-50',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className="flex items-center justify-center h-20 border-b border-slate-800 shrink-0 overflow-hidden">
        <img
          src={collapsed ? axiomeFavicon : axiomeLogo}
          alt="Axiome"
          className={cn(
            "transition-all duration-300 object-contain mx-auto",
            collapsed ? "w-10 h-10" : "max-w-[80%] h-16"
          )}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {sections.map(section => {
          const items = navItems.filter(i => {
            if (i.section !== section) return false;
            return true;
          });
          return (
            <div key={section} className="mb-2">
              {!collapsed && (
                <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-3 py-1.5 mt-1">
                  {section}
                </div>
              )}
              {items.map(item => {
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                      isActive
                        ? 'bg-blue-600/20 text-blue-400 shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800',
                      collapsed && 'justify-center px-0'
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User info footer */}
      <div className="border-t border-slate-800 p-2 shrink-0 space-y-1">
        {/* User card */}
        <button
          onClick={() => onNavigate('profile')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-all group',
            collapsed && 'justify-center px-0',
            currentPage === 'profile' && 'bg-blue-600/10'
          )}
          title={collapsed ? `${currentUser?.displayName || 'User'}` : undefined}
        >
          {currentUser?.avatarUrl ? (
            <img
              src={currentUser.avatarUrl}
              alt=""
              className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-700"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 text-white text-[10px] font-bold">
              {initials}
            </div>
          )}
          {!collapsed && (
            <div className="flex-1 text-left overflow-hidden">
              <div className="text-xs font-semibold text-white truncate leading-tight">
                {currentUser?.displayName || 'User'}
              </div>
              <div className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">
                {currentUser?.organization || ''}
              </div>
            </div>
          )}
        </button>

        {/* Collapse */}
        <div className="flex gap-1">
          <button
            onClick={switchUser}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-sm transition-all"
            title="Switch user"
          >
            <Users className="w-4 h-4" />
          </button>
          <button
            onClick={onToggle}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-sm transition-all"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : (
              <>
                <ChevronLeft className="w-4 h-4" />
                {!collapsed && <span className="text-xs">Collapse</span>}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

import {
  LayoutDashboard, Briefcase, TrendingUp, ShieldAlert,
  Target, Zap, Users, ChevronLeft, ChevronRight, Activity, ListPlus,
  ArrowLeftRight, Share2, UserCircle, LogOut
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuth } from '@/context/AuthContext';

export type Page = 'dashboard' | 'positions' | 'transactions' | 'sharing' | 'portfolio' | 'analytics' | 'risk' | 'optimization' | 'stress' | 'admin' | 'profile';

const navItems: { id: Page; label: string; icon: React.ElementType; section?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Overview' },
  { id: 'positions', label: 'Instruments', icon: ListPlus, section: 'Overview' },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight, section: 'Overview' },
  { id: 'portfolio', label: 'Allocation', icon: Briefcase, section: 'Analytics' },
  { id: 'analytics', label: 'Performance', icon: TrendingUp, section: 'Analytics' },
  { id: 'risk', label: 'Risk', icon: ShieldAlert, section: 'Analytics' },
  { id: 'optimization', label: 'Optimization', icon: Target, section: 'Tools' },
  { id: 'stress', label: 'Stress Test', icon: Zap, section: 'Tools' },
  { id: 'sharing', label: 'Sharing', icon: Share2, section: 'Tools' },
  { id: 'profile', label: 'Profile', icon: UserCircle, section: 'System' },
  { id: 'admin', label: 'Admin', icon: Users, section: 'System' },
];

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ currentPage, onNavigate, collapsed, onToggle }: SidebarProps) {
  const sections = [...new Set(navItems.map(i => i.section))];
  const { user, logout } = useAuth();

  const initials = user?.displayName
    ? user.displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : user?.username.slice(0, 2).toUpperCase() || 'U';

  return (
    <div className={cn(
      'flex flex-col h-screen bg-slate-900 border-r border-slate-800 transition-all duration-300 fixed left-0 top-0 z-50',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-800 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
          <Activity className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <span className="text-sm font-bold text-white whitespace-nowrap">PortfolioTracker</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {sections.map(section => {
          const items = navItems.filter(i => {
            if (i.section !== section) return false;
            // Hide admin page for non-admin users
            if (i.id === 'admin' && user?.role !== 'admin') return false;
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
          title={collapsed ? `${user?.displayName || user?.username}` : undefined}
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
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
                {user?.displayName || user?.username || 'User'}
              </div>
              <div className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">
                {user?.organization || user?.email || ''}
              </div>
            </div>
          )}
        </button>

        {/* Collapse + Logout */}
        <div className="flex gap-1">
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
          {!collapsed && (
            <button
              onClick={logout}
              className="px-3 py-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

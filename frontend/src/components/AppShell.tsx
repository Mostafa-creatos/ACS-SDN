import React, { useState, useEffect } from 'react';
import { NavLink, Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { checkBackendHealth } from '../lib/api';
import logoImg from '../assets/logo_transparent.png';
import { 
  LayoutDashboard, 
  Network, 
  Binary, 
  ShieldCheck, 
  FileCheck, 
  LogOut, 
  Menu,
  ChevronDown,
  User as UserIcon,
  PlugZap,
  Users,
  Building2,
  GitBranch,
  FileSpreadsheet,
  Send,
  ScrollText,
  Database,
  Building
} from 'lucide-react';

export const AppShell: React.FC = () => {
  const { user, logout, selectedTenant, setSelectedTenant } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [backendConnected, setBackendConnected] = useState(true);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        setBackendConnected(await checkBackendHealth());
      } catch {
        setBackendConnected(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Gated access rules
  const showApprovals = user?.role === 'Platform Admin' || user?.role === 'platform_admin';
  const showUsersNav = user?.role === 'Platform Admin' || user?.role === 'platform_admin' || user?.role === 'Tenant Admin' || user?.role === 'tenant_admin';

  // Grouped Navigation Definitions
  const monitorItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Topology', path: '/topology', icon: Binary },
    { name: 'Reports', path: '/reports', icon: FileSpreadsheet },
  ];

  const fabricItems = [
    { name: 'Switches', path: '/switches', icon: Network },
    { name: 'Spanning Tree (STP)', path: '/stp', icon: GitBranch },
    { name: 'ZTP Console', path: '/ztp', icon: PlugZap },
    { name: 'Backup & Restore', path: '/backups', icon: Database },
  ];

  const policyItems = [
    { name: 'IP Management', path: '/ipam', icon: Network },
    { name: 'Config Push', path: '/config-push', icon: Send },
    { name: 'Compliance', path: '/compliance', icon: ShieldCheck },
  ];

  // Helper for rendering NavLink
  const renderNavLink = (item: { name: string; path: string; icon: React.ComponentType<any>; badge?: string }) => {
    const Icon = item.icon;
    const isActive = location.pathname.startsWith(item.path);

    return (
      <NavLink
        key={item.name}
        to={item.path}
        className={({ isActive: linkActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 group relative ${
            linkActive || isActive
              ? 'bg-indigo-600/20 text-white font-bold border border-indigo-500/30 shadow-sm'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
          }`
        }
      >
        {(isActive || location.pathname.startsWith(item.path)) && (
          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
        )}
        <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
        {sidebarOpen && (
          <span className="flex items-center justify-between w-full tracking-wide">
            <span>{item.name}</span>
            {item.badge && (
              <span className="bg-rose-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shadow-sm">
                {item.badge}
              </span>
            )}
          </span>
        )}
      </NavLink>
    );
  };

  return (
    <div className="min-h-screen flex bg-slate-100 text-slate-800 font-sans">
      
      {/* 1. Sidebar (Fixed, Left, Dark Slate with transparent logo header) */}
      <aside 
        className={`fixed top-0 left-0 bottom-0 z-40 bg-slate-900 text-white transition-all duration-300 ease-in-out flex flex-col border-r border-slate-800 shadow-xl ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        {/* Top logo header */}
        <div className="h-16 flex items-center px-4 border-b border-slate-800 bg-slate-900/90">
          <Link to="/" className="flex items-center gap-3 w-full">
            <div className="w-9 h-9 flex items-center justify-center shrink-0">
              <img src={logoImg} alt="Atlas Cloud Services" className="w-full h-full object-contain" />
            </div>
            {sidebarOpen && (
              <div className="flex flex-col overflow-hidden">
                <span className="font-extrabold text-xs tracking-wider text-white uppercase font-display truncate">
                  Atlas Cloud Services
                </span>
                <span className="text-[9px] font-semibold text-indigo-400 tracking-wider uppercase truncate">
                  SDN Orchestrator
                </span>
              </div>
            )}
          </Link>
        </div>

        {/* Sidebar Nav Navigation with Category Subheaders */}
        <nav className="flex-1 px-3 py-5 space-y-5 overflow-y-auto scrollbar-thin">
          
          {/* Operations / Monitoring */}
          <div className="space-y-1">
            {sidebarOpen && (
              <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-3 pb-1">
                Operations
              </div>
            )}
            {monitorItems.map(item => renderNavLink(item))}
          </div>

          {/* Fabric Management */}
          <div className="space-y-1">
            {sidebarOpen && (
              <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-3 pb-1">
                Fabric Management
              </div>
            )}
            {fabricItems.map(item => renderNavLink(item))}
          </div>

          {/* Policy Engine */}
          <div className="space-y-1">
            {sidebarOpen && (
              <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-3 pb-1">
                Policy Engine
              </div>
            )}
            {policyItems.map(item => renderNavLink(item))}
          </div>

          {/* Platform & Tenant Admin */}
          {(showUsersNav || showApprovals) && (
            <div className="space-y-1">
              {sidebarOpen && (
                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-3 pb-1">
                  Platform Admin
                </div>
              )}
              {showUsersNav && renderNavLink({ name: 'Users & Access', path: '/users', icon: Users })}
              {(user?.role === 'Platform Admin' || user?.role === 'platform_admin') && renderNavLink({ name: 'Tenant Management', path: '/tenants', icon: Building2 })}
              {showApprovals && renderNavLink({ name: 'Pending Approvals', path: '/pending-approvals', icon: FileCheck, badge: 'New' })}
              {showApprovals && renderNavLink({ name: 'Audit Logs', path: '/audit-logs', icon: ScrollText })}
            </div>
          )}

        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors duration-200 cursor-pointer"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <Menu className="w-4 h-4" />
          </button>
          {sidebarOpen && (
            <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-400">
              <span className={`w-2 h-2 rounded-full ${backendConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span>{backendConnected ? 'Orchestrator Connected' : 'Backend Offline'}</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area Container */}
      <div 
        className="flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out w-full"
        style={{ paddingLeft: sidebarOpen ? '16rem' : '5rem' }}
      >
        
        {/* 2. Top Bar (White, Fixed, Hairline border) */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-30 shadow-xs">
          
          {/* Left Brand Identifier in Top Bar */}
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Atlas Cloud Services" className="h-8 w-auto object-contain" />
            <div className="hidden sm:flex flex-col">
              <span className="text-xs font-bold text-slate-900 tracking-tight">Atlas Cloud Services</span>
              <span className="text-[10px] text-slate-500 font-medium">Enterprise SDN Platform</span>
            </div>
          </div>

          {/* Controls: Center-Right and Far-Right */}
          <div className="flex items-center gap-5">
            
            {/* Tenant Switcher Dropdown */}
            {user && user.tenants.length > 1 && (
              <div className="flex items-center gap-2">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-500 font-medium">Tenant:</span>
                <div className="relative">
                  <select 
                    value={selectedTenant}
                    onChange={(e) => setSelectedTenant(e.target.value)}
                    className="appearance-none bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 py-1.5 pl-3 pr-8 rounded-lg outline-none cursor-pointer focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 hover:bg-slate-100 transition-all shadow-2xs"
                  >
                    {user.tenants.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            {/* User Profile Menu */}
            {user && (
              <div className="relative">
                <button 
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2.5 text-left hover:opacity-90 transition-opacity py-1 px-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-600 border border-indigo-400/30 flex items-center justify-center text-white shadow-xs">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-xs font-bold text-slate-800 leading-tight">{user.email}</div>
                    <div className="inline-block text-[9px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full leading-none mt-0.5 uppercase tracking-wide">
                      {user.role}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* Dropdown Box */}
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl border border-slate-200 shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
                        <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Active Role</div>
                        <div className="text-xs font-bold text-slate-800 mt-0.5">{user.role}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate">{user.email}</div>
                      </div>
                      <button 
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors text-left cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-500" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {/* 3. Actual Full-Width Content area */}
        <main className="flex-grow p-6 md:p-8 space-y-6 w-full max-w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
export default AppShell;

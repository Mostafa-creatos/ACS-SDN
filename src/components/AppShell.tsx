import React, { useState } from 'react';
import { NavLink, Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import atlasLogo from '../assets/atlas-logo.svg';
import { 
  LayoutDashboard, 
  Network, 
  Binary, 
  ShieldCheck, 
  FileCheck, 
  LogOut, 
  Menu,
  ChevronDown,
  User as UserIcon
} from 'lucide-react';

export const AppShell: React.FC = () => {
  const { user, logout, selectedTenant, setSelectedTenant } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Nav items configuration
  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Switches', path: '/switches', icon: Network },
    { name: 'Topology', path: '/topology', icon: Binary },
    { name: 'IP Management', path: '/ipam', icon: Network }, // we will use Network icon or another
    { name: 'Compliance', path: '/compliance', icon: ShieldCheck },
  ];

  // Gated approvals page
  const showApprovals = user?.role === 'Platform Admin';

  return (
    <div className="min-h-screen flex bg-surface-light text-slate-800">
      
      {/* 1. Sidebar (Fixed, Left, Dark) */}
      <aside 
        className={`fixed top-0 left-0 bottom-0 z-40 bg-sidebar-bg text-white transition-all duration-300 flex flex-col border-r border-atlas-lavender/10 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        {/* Top: Logo icon ONLY to save space */}
        <div className="h-16 flex items-center justify-center border-b border-atlas-lavender/10">
          <Link to="/" className="flex items-center gap-3 px-4">
            <div className="w-9 h-9 flex items-center justify-center bg-gradient-to-br from-atlas-primary to-atlas-violet rounded-lg shadow-md font-bold text-lg font-display">
              A
            </div>
            {sidebarOpen && (
              <span className="font-display font-extrabold text-sm tracking-wider text-slate-100 uppercase">
                SDN Console
              </span>
            )}
          </Link>
        </div>

        {/* Sidebar Nav Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive: linkActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                    linkActive || isActive
                      ? 'bg-white/10 text-white font-semibold'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {/* Left Teal Accent Bar for Active Link */}
                {(isActive || location.pathname.startsWith(item.path)) && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-atlas-teal" />
                )}
                <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-atlas-teal' : 'text-slate-400 group-hover:text-white'}`} />
                {sidebarOpen && <span>{item.name}</span>}
              </NavLink>
            );
          })}

          {/* Pending Approvals (Visible only to Platform Admins) */}
          {showApprovals && (
            <NavLink
              to="/pending-approvals"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                  isActive
                    ? 'bg-white/10 text-white font-semibold'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-atlas-teal" />}
                  <FileCheck className={`w-5 h-5 ${isActive ? 'text-atlas-teal' : 'text-slate-400 group-hover:text-white'}`} />
                  {sidebarOpen && (
                    <span className="flex items-center justify-between w-full">
                      <span>Pending Approvals</span>
                      <span className="bg-atlas-coral text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        New
                      </span>
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-atlas-lavender/10 flex items-center justify-between">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <Menu className="w-5 h-5" />
          </button>
          {sidebarOpen && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-atlas-teal animate-pulse" />
              <span>Orchestrator Connected</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area Container */}
      <div 
        className="flex-1 flex flex-col min-h-screen transition-all duration-300"
        style={{ paddingLeft: sidebarOpen ? '16rem' : '5rem' }}
      >
        
        {/* 2. Top Bar (White, Fixed, Hairline border) */}
        <header className="h-16 bg-white border-b border-atlas-lavender/25 flex items-center justify-between px-6 sticky top-0 z-30 shadow-sm">
          {/* Logo Mark + Wordmark in Top Bar far left */}
          <div className="flex items-center">
            <img src={atlasLogo} alt="Atlas Cloud Services" className="h-7 w-auto" />
          </div>

          {/* Controls: Center-Right and Far-Right */}
          <div className="flex items-center gap-6">
            
            {/* Tenant Switcher Dropdown */}
            {user && user.tenants.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium font-sans">Tenant:</span>
                <div className="relative">
                  <select 
                    value={selectedTenant}
                    onChange={(e) => setSelectedTenant(e.target.value)}
                    className="appearance-none bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 py-1.5 pl-3 pr-8 rounded-lg outline-none cursor-pointer focus:border-atlas-primary hover:bg-slate-100 transition-colors"
                  >
                    {user.tenants.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            {/* User Menu */}
            {user && (
              <div className="relative">
                <button 
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 text-left hover:opacity-85 transition-opacity py-1"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-atlas-primary">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-xs font-bold text-slate-700 leading-tight">{user.email}</div>
                    <div className="inline-block text-[10px] font-semibold text-atlas-violet bg-atlas-violet/5 px-1 py-0.5 rounded leading-none mt-0.5">
                      {user.role}
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                </button>

                {/* Dropdown Box */}
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-slate-100 shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-4 py-2 border-b border-slate-50">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Active Role</div>
                        <div className="text-xs font-semibold text-slate-700 mt-0.5">{user.role}</div>
                      </div>
                      <button 
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {/* 3. Actual Content area (Light Gray) */}
        <main className="flex-grow p-6 md:p-8 space-y-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

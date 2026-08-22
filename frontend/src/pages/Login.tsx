import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser, changePassword } from '../lib/api';
import logoImg from '../assets/logo_transparent.png';
import { ShieldAlert, Info, Key, Lock, UserCheck, Shield } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin');
  const [password, setPassword] = useState('admin_password_123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Must-change-password state
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { ok, data } = await loginUser(email, password);

      if (ok) {
        login(data.access_token, data.refresh_token);

        const decoded = decodeToken(data.access_token);
        if (decoded.must_change_password) {
          setShowChangePw(true);
        } else {
          navigate('/dashboard');
        }
      } else {
        setError(data.detail || 'Authentication failed. Please verify credentials.');
      }
    } catch (err) {
      setError('Unable to reach the backend server. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwLoading(true);
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword });
      setShowChangePw(false);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const decodeToken = (token: string): any => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        window.atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return {};
    }
  };

  // Helper login buttons to swap roles quickly
  const handleQuickLogin = (quickEmail: string, quickPass: string) => {
    setEmail(quickEmail);
    setPassword(quickPass);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 relative overflow-hidden font-sans select-none">
      
      {/* Dynamic Glowing Radial Lights */}
      <div className="absolute -top-32 -left-32 w-[32rem] h-[32rem] rounded-full bg-indigo-600/15 filter blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-[32rem] h-[32rem] rounded-full bg-blue-600/15 filter blur-[100px] pointer-events-none" />
      
      <div className="w-full max-w-md z-10 space-y-6">
        
        {/* Glassmorphic Enterprise Sign-In Card */}
        <div className="bg-slate-900/90 border border-slate-800 shadow-2xl rounded-2xl p-8 backdrop-blur-xl relative overflow-hidden">
          
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-600" />

          {/* Header & Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 flex items-center justify-center mb-3 hover:scale-105 transition-transform">
              <img src={logoImg} alt="Atlas Cloud Services" className="w-full h-full object-contain" />
            </div>
            
            <h1 className="text-xl font-extrabold tracking-tight text-white font-display text-center">
              Atlas Cloud Services
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-indigo-400 tracking-wide uppercase">
                SDN Orchestrator Portal
              </span>
            </div>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex gap-3 items-start text-xs text-rose-300 mb-5 animate-in fade-in duration-200">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {showChangePw ? (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="flex flex-col items-center mb-4">
                <div className="w-12 h-12 bg-indigo-500/15 rounded-full flex items-center justify-center text-indigo-400 mb-2 border border-indigo-500/30">
                  <Key className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">Password Change Required</h3>
                <p className="text-xs text-slate-400 text-center mt-1">First-time login credentials must be updated before proceeding.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">Current Password</label>
                <input type="password" required value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-600 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">New Password</label>
                <input type="password" required value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-100 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-600 transition-all" />
              </div>
              <button type="submit" disabled={pwLoading}
                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 py-3 rounded-xl font-bold text-sm hover:from-indigo-500 hover:to-indigo-400 text-white transition-all shadow-lg disabled:opacity-50 mt-2 cursor-pointer">
                {pwLoading ? 'Updating Password...' : 'Update Password & Access'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-1.5">
                  Account Username
                </label>
                <div className="relative">
                  <input 
                    type="text" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-slate-100 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-600 transition-all"
                    placeholder="Username or email"
                  />
                  <UserCheck className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input 
                    type="password" 
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-slate-100 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-600 transition-all"
                    placeholder="••••••••••••"
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 py-3 rounded-xl font-bold text-sm text-white shadow-lg transition-all transform active:scale-[0.99] disabled:opacity-50 mt-2 cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <span>Sign In to Console</span>
                )}
              </button>
            </form>
          )}

          {/* Quick SSO role-swappers */}
          <div className="mt-7 pt-5 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                Quick Role Simulation
              </span>
              <Shield className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button 
                onClick={() => handleQuickLogin('admin', 'admin_password_123!')}
                className="bg-slate-950 hover:bg-slate-800/90 border border-slate-800 text-slate-300 hover:text-white py-2 px-2 rounded-xl transition-all text-center text-[10px] font-bold cursor-pointer"
              >
                Platform Admin
              </button>
              <button 
                onClick={() => handleQuickLogin('operator', 'operator_password_123!')}
                className="bg-slate-950 hover:bg-slate-800/90 border border-slate-800 text-slate-300 hover:text-white py-2 px-2 rounded-xl transition-all text-center text-[10px] font-bold cursor-pointer"
              >
                Tenant Operator
              </button>
              <button 
                onClick={() => handleQuickLogin('auditor', 'auditor_password_123!')}
                className="bg-slate-950 hover:bg-slate-800/90 border border-slate-800 text-slate-300 hover:text-white py-2 px-2 rounded-xl transition-all text-center text-[10px] font-bold cursor-pointer"
              >
                Tenant Auditor
              </button>
            </div>
          </div>

        </div>

        {/* Info panel */}
        <div className="flex gap-2 text-slate-500 text-[10px] justify-center items-center font-medium">
          <Info className="w-3.5 h-3.5" />
          <span>Atlas Cloud Services • Enterprise SDN Platform v5.2</span>
        </div>
      </div>
    </div>
  );
};
export default Login;

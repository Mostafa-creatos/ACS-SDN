import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import logo from '../assets/atlas-logo.svg';
import { ShieldAlert, Info, Key } from 'lucide-react';

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
      const response = await fetch('/api/v5/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password })
      });

      if (response.ok) {
        const data = await response.json();
        login(data.access_token, data.refresh_token);

        const decoded = decodeToken(data.access_token);
        if (decoded.must_change_password) {
          setShowChangePw(true);
        } else {
          navigate('/dashboard');
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.detail || 'Authentication failed. Please verify credentials.');
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
      const res = await fetch('/api/v5/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('atlas_jwt')}`
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });
      if (!res.ok) throw new Error('Failed to change password');
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
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 relative overflow-hidden font-sans">
      {/* Background Watermark/Glowing node design */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-atlas-primary/5 filter blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-atlas-violet/5 filter blur-3xl" />
      
      <div className="w-full max-w-md z-10 space-y-6">
        
        {/* Card Panel */}
        <Card className="bg-slate-900 border-slate-800 shadow-2xl p-8 relative">
          
          <div className="flex flex-col items-center mb-6">
            <img src={logo} alt="Atlas Logo" className="h-10 mb-2 brightness-110" />
            <h2 className="text-xl font-bold font-display text-white text-center">
              Operator Console Sign-In
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Enter credentials to access the SDN orchestrator
            </p>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/25 rounded-lg p-3 flex gap-2.5 items-start text-xs text-rose-300 mb-4">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {showChangePw ? (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="flex flex-col items-center mb-4">
                <div className="w-12 h-12 bg-atlas-teal/10 rounded-full flex items-center justify-center text-atlas-teal mb-2">
                  <Key className="w-6 h-6" />
                </div>
                <h3 className="text-md font-bold text-white">Change Required</h3>
                <p className="text-xs text-slate-400 text-center mt-1">You must change your password before continuing.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Current Password</label>
                <input type="password" required value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm outline-none focus:border-atlas-primary placeholder-slate-600 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">New Password</label>
                <input type="password" required value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm outline-none focus:border-atlas-primary placeholder-slate-600 transition-colors" />
              </div>
              <button type="submit" disabled={pwLoading}
                className="w-full btn-primary bg-atlas-teal py-3 rounded-lg font-semibold text-sm hover:bg-teal-600 text-white transition-all disabled:opacity-50 mt-2">
                {pwLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Username / Email
                </label>
                <input 
                  type="text" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm outline-none focus:border-atlas-primary placeholder-slate-600 transition-colors"
                  placeholder="e.g. admin"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm outline-none focus:border-atlas-primary placeholder-slate-600 transition-colors"
                  placeholder="••••••••••••"
                />
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full btn-primary bg-atlas-primary py-3 rounded-lg font-semibold text-sm hover:bg-atlas-primary/90 text-white transition-all disabled:opacity-50 mt-2"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          )}

          {/* Quick SSO role-swappers */}
          <div className="mt-8 pt-6 border-t border-slate-800/80">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
              Quick Role Simulation logins
            </span>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <button 
                onClick={() => handleQuickLogin('admin', 'admin_password_123!')}
                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 py-2 px-2 rounded-lg transition-colors text-left font-medium"
              >
                Platform Admin
              </button>
              <button 
                onClick={() => handleQuickLogin('operator', 'operator_password_123!')}
                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 py-2 px-2 rounded-lg transition-colors text-left font-medium"
              >
                Tenant Operator
              </button>
              <button 
                onClick={() => handleQuickLogin('auditor', 'auditor_password_123!')}
                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 py-2 px-2 rounded-lg transition-colors text-left font-medium"
              >
                Tenant Auditor
              </button>
            </div>
          </div>

        </Card>

        {/* Info panel */}
        <div className="flex gap-2 text-slate-500 text-[10px] justify-center items-center">
          <Info className="w-3.5 h-3.5" />
          <span>Security Notice: Accidental click protection active.</span>
        </div>
      </div>
    </div>
  );
};
export default Login;

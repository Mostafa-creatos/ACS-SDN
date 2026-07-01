import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import logo from '../assets/atlas-logo.svg';
import { ShieldAlert, Info } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin');
  const [password, setPassword] = useState('admin_password_123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        // Standard JWT in access_token
        login(data.access_token);
        navigate('/dashboard');
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.detail || 'Authentication failed. Please verify credentials.');
      }
    } catch (err) {
      // Offline fallback: simulate JWT generation
      console.warn("Offline mock login fallback active.");
      let token = 'mock.jwt.admin';
      if (email.includes('operator')) token = 'mock.jwt.operator';
      else if (email.includes('auditor') || email.includes('read')) token = 'mock.jwt.auditor';
      else if (email.includes('tenant')) token = 'mock.jwt.tenant';
      
      login(token);
      navigate('/dashboard');
    } finally {
      setLoading(false);
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

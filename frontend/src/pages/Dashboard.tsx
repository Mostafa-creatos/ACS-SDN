import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { ShieldCheck, Network, AlertTriangle, FileClock, Play, Eye } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { token, selectedTenant } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    totalSwitches: number;
    activeSwitches: number;
    driftedSwitches: number;
    pendingApprovals: number;
    switchDistribution: { name: string; value: number; color: string }[];
    complianceTrend: { date: string; score: number }[];
  }>({
    totalSwitches: 0,
    activeSwitches: 0,
    driftedSwitches: 0,
    pendingApprovals: 0,
    switchDistribution: [],
    complianceTrend: []
  });

  const [auditRunning, setAuditRunning] = useState(false);
  const [auditStep, setAuditStep] = useState(0);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const headers: any = { 'Authorization': `Bearer ${token}` };
      if (selectedTenant) {
        headers['X-Tenant-ID'] = selectedTenant;
      }
      
      // Attempt to load from real API routes
      const swRes = await fetch('/api/v5/visibility/inventory', { headers });
      const compRes = await fetch('/api/v5/visibility/compliance/latest', { headers });
      const switches = swRes.ok ? await swRes.json() : [];
      const compliance = compRes.ok ? await compRes.json() : null;

      let switchesList = [];
      if (Array.isArray(switches)) {
        switchesList = switches;
      } else if (switches.items && Array.isArray(switches.items)) {
        switchesList = switches.items;
      }

      // Extract details
      const total = switchesList.length;
      const active = switchesList.filter((s: any) => s.status === 'Up' || s.lifecycle_status === 'compliant_active').length;
      const drifted = switchesList.filter((s: any) => s.lifecycle_status === 'configuration_drifted').length;
      let approvals = 0;
      try {
        const approvalRes = await fetch('/api/v5/orchestrator/approvals', { headers });
        const approvalsList = approvalRes.ok ? await approvalRes.json() : [];
        approvals = approvalsList.length;
      } catch {}

      // Distribution
      const distribution = [
        { name: 'Compliant & Active', value: active, color: '#42CCB2' },
        { name: 'Drifted / Warning', value: drifted, color: '#E26C48' },
        { name: 'Discovered Raw', value: total - active - drifted > 0 ? total - active - drifted : 1, color: '#BAC0D8' },
        { name: 'Auditing Status', value: 0, color: '#564EBD' }
      ];

      // Compliance Trend — fetch real history
      let trend: { date: string; score: number }[] = [];
      try {
        const histRes = await fetch('/api/v5/visibility/compliance/history', { headers });
        if (histRes.ok) {
          const histData = await histRes.json();
          if (Array.isArray(histData) && histData.length > 0) {
            trend = histData.map((h: any) => ({
              date: new Date(h.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              score: h.compliance_score_pct || 0
            }));
          }
        }
      } catch {}
      // Fallback: use today's score only
      if (trend.length === 0) {
        const todayScore = compliance?.summary?.compliance_score_pct || 0;
        if (todayScore > 0) {
          trend = [{ date: 'Today', score: todayScore }];
        }
      }

      setData({
        totalSwitches: total,
        activeSwitches: active,
        driftedSwitches: drifted,
        pendingApprovals: approvals,
        switchDistribution: distribution,
        complianceTrend: trend
      });
    } catch (err) {
      // Empty fallback on error
      setData({
        totalSwitches: 0,
        activeSwitches: 0,
        driftedSwitches: 0,
        pendingApprovals: 0,
        switchDistribution: [],
        complianceTrend: []
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [token, selectedTenant]);

  const handleRunAudit = () => {
    setAuditRunning(true);
    setAuditStep(1);

    // Trigger real backend compliance run in parallel
    const triggerAudit = async () => {
      try {
        const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
        if (selectedTenant) {
          headers['X-Tenant-ID'] = selectedTenant;
        }
        await fetch('/api/v5/visibility/compliance/run', { method: 'POST', headers });
      } catch (e) {
        console.error("Failed to run audit on backend:", e);
      }
    };
    triggerAudit();

    const interval = setInterval(() => {
      setAuditStep(prev => {
        if (prev >= 3) {
          clearInterval(interval);
          setTimeout(() => {
            setAuditRunning(false);
            fetchDashboardData();
          }, 1000);
          return 3;
        }
        return prev + 1;
      });
    }, 1200);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">Dashboard</h1>
        
        {/* Skeleton Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse flex flex-col justify-between h-32 py-5">
              <div className="h-4 bg-slate-200 rounded w-2/3" />
              <div className="h-8 bg-slate-200 rounded w-1/3 mt-3" />
            </Card>
          ))}
        </div>

        {/* Skeleton Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="h-[380px] animate-pulse flex flex-col justify-between">
            <div className="h-5 bg-slate-200 rounded w-1/3" />
            <div className="w-48 h-48 rounded-full border-8 border-slate-100 mx-auto my-6" />
          </Card>
          <Card className="h-[380px] animate-pulse flex flex-col justify-between">
            <div className="h-5 bg-slate-200 rounded w-1/3" />
            <div className="h-44 bg-slate-100 rounded w-full my-6" />
          </Card>
        </div>
      </div>
    );
  }

  // Empty State: if total switches = 0
  if (data.totalSwitches === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">Dashboard</h1>
        
        <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-2">
          <Network className="w-16 h-16 text-atlas-lavender/80 mb-4 stroke-[1.25]" />
          <h3 className="text-lg font-bold font-display text-atlas-ink mb-1">No Switches Onboarded</h3>
          <p className="text-sm text-slate-500 max-w-sm mb-6">
            Begin zero-touch configuration or manually onboard switches to view compliance health, live topology charts, and telemetry maps.
          </p>
          <button 
            onClick={() => navigate('/switches')} 
            className="btn-primary"
          >
            Go to Switch Inventory
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">Dashboard</h1>
        <p className="text-xs text-slate-400 mt-1">Tenant Overview: <span className="font-semibold text-slate-600">{selectedTenant}</span></p>
      </div>

      {/* Row of 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Total Switches */}
        <Card className="flex items-center gap-4 hoverable" onClick={() => navigate('/switches')}>
          <div className="p-3 bg-atlas-primary/10 text-atlas-primary rounded-xl">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Total Devices</span>
            <span className="text-2xl font-bold font-display text-slate-800 leading-tight">{data.totalSwitches}</span>
          </div>
        </Card>

        {/* Compliant & Active */}
        <Card className="flex items-center gap-4 hoverable" onClick={() => navigate('/compliance')}>
          <div className="p-3 bg-atlas-teal/10 text-atlas-teal rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Compliant / Active</span>
            <span className="text-2xl font-bold font-display text-atlas-teal leading-tight">{data.activeSwitches}</span>
          </div>
        </Card>

        {/* Configuration Drifted */}
        <Card className="flex items-center gap-4 hoverable" onClick={() => navigate('/switches')}>
          <div className={`p-3 rounded-xl ${
            data.driftedSwitches > 0 ? 'bg-atlas-coral/10 text-atlas-coral' : 'bg-slate-100 text-slate-400'
          }`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Drifted Configurations</span>
            <span className={`text-2xl font-bold font-display leading-tight ${
              data.driftedSwitches > 0 ? 'text-atlas-coral' : 'text-slate-500'
            }`}>
              {data.driftedSwitches}
            </span>
          </div>
        </Card>

        {/* Pending Approvals (Clickable) */}
        <Card 
          className="flex items-center gap-4 cursor-pointer hoverable hover:border-atlas-violet/30 active:scale-[0.99] transition-transform" 
          onClick={() => navigate('/pending-approvals')}
        >
          <div className="p-3 bg-atlas-violet/10 text-atlas-violet rounded-xl">
            <FileClock className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Approvals</span>
            <span className="text-2xl font-bold font-display text-atlas-violet leading-tight">{data.pendingApprovals}</span>
          </div>
        </Card>
      </div>

      {/* Side-by-side Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Donut Chart - Device State Distribution */}
        <Card className="flex flex-col h-[380px]">
          <h3 className="text-base font-bold font-display text-atlas-ink mb-4">Switch Lifecycle States</h3>
          <div className="flex-grow flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data.switchDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.switchDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ background: '#fff', border: '1px solid #BAC0D8', borderRadius: '8px', fontSize: '11px' }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36} 
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '11px', fontWeight: '500' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Line Chart - Compliance Scoring */}
        <Card className="flex flex-col h-[380px]">
          <h3 className="text-base font-bold font-display text-atlas-ink mb-4">Fabric Compliance History (30 Days)</h3>
          <div className="flex-grow">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data.complianceTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#BAC0D8/30" opacity={0.25} />
                <XAxis dataKey="date" stroke="#6B6B85" fontSize={10} tickLine={false} />
                <YAxis stroke="#6B6B85" fontSize={10} tickLine={false} domain={[50, 100]} />
                <Tooltip 
                  contentStyle={{ background: '#fff', border: '1px solid #BAC0D8', borderRadius: '8px', fontSize: '11px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="score" 
                  stroke="#51509D" 
                  strokeWidth={2.5} 
                  dot={{ r: 4, stroke: '#51509D', fill: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 6 }} 
                  name="Compliance score (%)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Quick Actions Row */}
      <Card className="flex flex-col sm:flex-row justify-between items-center gap-4 py-4 px-6 bg-slate-50 border-slate-200">
        <div>
          <h4 className="text-sm font-bold font-display text-atlas-ink">Quick Fabric Actions</h4>
          <p className="text-xs text-slate-500">Run security verification checks or monitor pending change streams</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleRunAudit}
            disabled={auditRunning}
            className="btn-secondary flex items-center gap-2"
          >
            <Play className={`w-4 h-4 ${auditRunning ? 'animate-spin' : ''}`} />
            <span>
              {auditRunning ? `Running Audit (Step ${auditStep}/3)...` : 'Run Compliance Audit'}
            </span>
          </button>
          <button 
            onClick={() => navigate('/pending-approvals')}
            className="btn-primary flex items-center gap-2"
          >
            <Eye className="w-4 h-4" />
            <span>View Pending Approvals ({data.pendingApprovals})</span>
          </button>
        </div>
      </Card>

    </div>
  );
};
export default Dashboard;

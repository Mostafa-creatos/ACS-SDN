import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../hooks/useDashboard';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { WidgetSkeleton } from '../components/dashboard/WidgetSkeleton';
import { WidgetError } from '../components/dashboard/WidgetError';
import { runComplianceAudit } from '../lib/api';
import { toast } from 'sonner';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  ShieldCheck, 
  Network, 
  AlertTriangle, 
  FileClock, 
  Activity, 
  History, 
  Cpu, 
  Database,
  CheckCircle2,
  AlertCircle,
  Clock,
  Terminal,
  HeartPulse,
  Layers,
  Fingerprint
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { selectedTenant } = useAuth();
  const { data, isLoading, isFetching, error, refetch } = useDashboard(selectedTenant);

  const [auditRunning, setAuditRunning] = useState(false);
  const [auditStep, setAuditStep] = useState(0);

  const metrics = data?.metrics ?? {
    totalSwitches: 0,
    activeSwitches: 0,
    driftedSwitches: 0,
    unreachableSwitches: 0,
    pendingApprovals: 0,
    ztpPoolCount: 0,
    subnetsCount: 0,
    fabricsCount: 0,
    allocatedIpsCount: 0
  };

  const healthScore = data?.health_score ?? 100;
  const celeryStats = data?.celery_stats ?? {
    status: 'offline' as const,
    active_tasks_count: 0,
    reserved_tasks_count: 0,
    scheduled_tasks_count: 0,
    workers_count: 0
  };
  const cpuLeaderboard = data?.cpu_leaderboard ?? [];
  const memLeaderboard = data?.mem_leaderboard ?? [];
  const recentJobs = data?.recent_jobs ?? [];
  const telemetryHistory = data?.telemetry_history ?? [];
  const auditLogs = data?.audit_logs ?? [];
  const ztpDevices = data?.ztp_devices ?? [];

  const handleRefresh = async () => {
    const result = await refetch();
    if (result.error) {
      toast.error('Failed to refresh dashboard');
    } else {
      toast.success('Dashboard refreshed');
    }
  };

  const handleRunAudit = () => {
    setAuditRunning(true);
    setAuditStep(1);
    toast.info('Compliance audit started');

    const triggerAudit = async () => {
      try {
        await runComplianceAudit(selectedTenant);
      } catch (e) {
        console.error("Failed to run audit on backend:", e);
        toast.error('Failed to trigger compliance audit');
      }
    };
    triggerAudit();

    const stepInterval = setInterval(() => {
      setAuditStep(prev => {
        if (prev >= 3) {
          clearInterval(stepInterval);
          setTimeout(() => {
            setAuditRunning(false);
            handleRefresh();
          }, 1000);
          return 3;
        }
        return prev + 1;
      });
    }, 1200);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <DashboardHeader
          isLoading={true}
          auditRunning={auditRunning}
          auditStep={auditStep}
          onRefresh={handleRefresh}
          onRunAudit={handleRunAudit}
        />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <WidgetSkeleton className="h-[240px] lg:col-span-1" />
          <WidgetSkeleton className="h-[240px] lg:col-span-3" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <WidgetSkeleton className="h-[380px] lg:col-span-2" />
          <WidgetSkeleton className="h-[380px]" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <WidgetSkeleton className="h-[380px]" />
          <WidgetSkeleton className="h-[380px] lg:col-span-2" />
        </div>
        <WidgetSkeleton className="h-[200px]" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WidgetSkeleton className="h-[360px]" />
          <WidgetSkeleton className="h-[360px]" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <DashboardHeader
          isLoading={isFetching}
          auditRunning={auditRunning}
          auditStep={auditStep}
          onRefresh={handleRefresh}
          onRunAudit={handleRunAudit}
        />
        <WidgetError
          message={error.message}
          onRetry={handleRefresh}
          className="h-[300px]"
        />
      </div>
    );
  }

  // Calculate dynamic health color
  const getHealthColor = (score: number) => {
    if (score >= 90) return 'text-emerald-500 stroke-emerald-500';
    if (score >= 70) return 'text-amber-500 stroke-amber-500';
    return 'text-rose-500 stroke-rose-500';
  };

  const getHealthTag = (score: number) => {
    if (score >= 90) return { label: 'OPTIMAL', bg: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
    if (score >= 70) return { label: 'DEGRADED', bg: 'bg-amber-50 text-amber-600 border-amber-100' };
    return { label: 'CRITICAL', bg: 'bg-rose-50 text-rose-600 border-rose-100' };
  };

  // Compile Active Alarms List
  const alarms = [];
  if (metrics.driftedSwitches > 0) {
    alarms.push({
      id: 'drift',
      title: 'Configuration Drift Alert',
      severity: 'major',
      msg: `${metrics.driftedSwitches} switches have drifted configurations. Apply remediation template.`,
      action: 'Resolve',
      onClick: () => navigate('/compliance')
    });
  }
  const offlineSwitchesCount = metrics.unreachableSwitches ?? 0;
  if (offlineSwitchesCount > 0) {
    alarms.push({
      id: 'offline',
      title: 'Switch Node Unreachable',
      severity: 'critical',
      msg: `${offlineSwitchesCount} of your fabrics switches are down or not responding.`,
      action: 'Inspect Switches',
      onClick: () => navigate('/switches')
    });
  }
  if (celeryStats.status === 'offline') {
    alarms.push({
      id: 'celery',
      title: 'Task Orchestration Offline',
      severity: 'critical',
      msg: 'Celery message broker is unreachable. Automatic provisioning tasks are suspended.',
      action: null
    });
  }
  if (metrics.pendingApprovals > 0) {
    alarms.push({
      id: 'approvals',
      title: 'Orchestration Policy Approval Awaiting',
      severity: 'minor',
      msg: `${metrics.pendingApprovals} pending templates awaiting validation.`,
      action: 'Approve',
      onClick: () => navigate('/pending-approvals')
    });
  }
  if (metrics.ztpPoolCount > 0) {
    alarms.push({
      id: 'ztp',
      title: 'Unassigned Discovered Hardware',
      severity: 'info',
      msg: `${metrics.ztpPoolCount} unassigned bare-metal switches awaiting fabric placement in ZTP pool.`,
      action: 'Assign Pool',
      onClick: () => navigate('/switches')
    });
  }

  const healthTag = getHealthTag(healthScore);

  return (
    <div className="space-y-6">
      <DashboardHeader
        isLoading={isFetching}
        lastUpdated={data?.last_updated}
        auditRunning={auditRunning}
        auditStep={auditStep}
        onRefresh={handleRefresh}
        onRunAudit={handleRunAudit}
      />

      {/* Top Section: Health Radial & Core Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Dynamic health radial score */}
        <Card className="flex flex-col justify-between items-center py-6 text-center shadow-md relative overflow-hidden bg-white border border-slate-100">
          <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50/50 rounded-bl-full -z-10" />
          <div className="w-full flex justify-between px-4 items-center">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Fabric Health</span>
            <span className={`px-2 py-0.5 text-[9px] font-extrabold tracking-wider border rounded-md ${healthTag.bg}`}>
              {healthTag.label}
            </span>
          </div>

          <div className="relative my-4 flex items-center justify-center">
            {/* SVG radial ring */}
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="52"
                stroke="#F1F5F9"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="64"
                cy="64"
                r="52"
                className={`transition-all duration-1000 ease-out ${getHealthColor(healthScore)}`}
                strokeWidth="10"
                strokeDasharray={2 * Math.PI * 52}
                strokeDashoffset={2 * Math.PI * 52 * (1 - healthScore / 100)}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-slate-800 font-display">{healthScore}%</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-0.5">
                <HeartPulse className="w-2.5 h-2.5 text-rose-400" /> index
              </span>
            </div>
          </div>

          <span className="text-[11px] text-slate-400 font-medium px-4 leading-normal">
            Dynamic fabric index calculated from live syncs, alarms, and offline events.
          </span>
        </Card>

        {/* Dynamic Capacity & KPIs Grid */}
        <Card className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-6 p-6 shadow-md bg-white border border-slate-100">
          
          <div className="p-4 rounded-2xl bg-slate-50/50 border border-slate-100/50 hover:bg-slate-50 transition-all cursor-pointer" onClick={() => navigate('/switches')}>
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Total Switches</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-display text-slate-800">{metrics.totalSwitches}</span>
              <span className="text-xs text-slate-400">nodes</span>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Network className="w-3.5 h-3.5 text-atlas-primary" />
              <span>{metrics.activeSwitches} online</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50/50 border border-slate-100/50 hover:bg-slate-50 transition-all cursor-pointer" onClick={() => navigate('/compliance')}>
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Config Drift</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-black font-display ${metrics.driftedSwitches > 0 ? 'text-rose-500' : 'text-slate-800'}`}>
                {metrics.driftedSwitches}
              </span>
              <span className="text-xs text-slate-400">drifted</span>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>{metrics.totalSwitches - metrics.driftedSwitches} in-sync</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50/50 border border-slate-100/50 hover:bg-slate-50 transition-all cursor-pointer" onClick={() => navigate('/ipam')}>
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">IPAM Allocations</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-display text-slate-800">{metrics.allocatedIpsCount}</span>
              <span className="text-xs text-slate-400">IPs</span>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>{metrics.subnetsCount} active subnets</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50/50 border border-slate-100/50 hover:bg-slate-50 transition-all cursor-pointer" onClick={() => navigate('/pending-approvals')}>
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pending Changes</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-display text-slate-800">{metrics.pendingApprovals}</span>
              <span className="text-xs text-slate-400">approvals</span>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500">
              <FileClock className="w-3.5 h-3.5 text-atlas-violet" />
              <span>Security templates</span>
            </div>
          </div>

        </Card>
      </div>

      {/* Middle Section: Alarms & Resource Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Active Alarms Console */}
        <Card className="lg:col-span-2 flex flex-col justify-between h-[360px] shadow-sm bg-white border border-slate-100">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-3">
              <div>
                <h3 className="text-base font-bold font-display text-atlas-ink">Active Fabric Alarm Console</h3>
                <p className="text-xs text-slate-400">Active alerts requiring attention in the fabric</p>
              </div>
              <span className="text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded-md text-slate-500 font-mono">
                {alarms.length} Alarms
              </span>
            </div>
            
            <div className="space-y-3 overflow-y-auto max-h-[240px] pr-1">
              {alarms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-100 stroke-emerald-500 mb-2 fill-emerald-50" />
                  <p className="text-xs font-semibold text-slate-600">All Fabrics Synchronized</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Zero active alarms or configuration template drifts detected.</p>
                </div>
              ) : (
                alarms.map((alarm) => (
                  <div key={alarm.id} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-slate-100/60 hover:bg-slate-50/30 transition-colors">
                    <div className="flex gap-3">
                      <div className="mt-0.5">
                        {alarm.severity === 'critical' && <AlertTriangle className="w-5 h-5 text-rose-500 fill-rose-50" />}
                        {alarm.severity === 'major' && <AlertCircle className="w-5 h-5 text-amber-500 fill-amber-50" />}
                        {alarm.severity === 'minor' && <Clock className="w-5 h-5 text-atlas-violet fill-violet-50" />}
                        {alarm.severity === 'info' && <ShieldCheck className="w-5 h-5 text-indigo-500 fill-indigo-50" />}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-700">{alarm.title}</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">{alarm.msg}</p>
                      </div>
                    </div>
                    {alarm.action && (
                      <button 
                        onClick={alarm.onClick}
                        className="text-xs font-bold text-atlas-primary hover:underline whitespace-nowrap ml-4"
                      >
                        {alarm.action} &rarr;
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        {/* Switch Resource Leaderboards */}
        <Card className="flex flex-col justify-between h-[360px] shadow-sm bg-white border border-slate-100">
          <div>
            <h3 className="text-base font-bold font-display text-atlas-ink mb-1">Top Resource Consumers</h3>
            <p className="text-xs text-slate-400 mb-4">Highest utilization nodes in the fabric</p>

            <div className="space-y-6">
              {/* CPU progress bar */}
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Cpu className="w-3.5 h-3.5 text-atlas-primary" /> CPU Utilization
                </span>
                <div className="space-y-2.5">
                  {cpuLeaderboard.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic">No CPU metrics available</p>
                  ) : (
                    cpuLeaderboard.map((item) => (
                      <div key={item.hostname} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium text-slate-600">
                          <span>{item.hostname}</span>
                          <span className="font-bold">{item.value.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              item.value > 80 ? 'bg-rose-500' : item.value > 60 ? 'bg-amber-500' : 'bg-atlas-primary'
                            }`}
                            style={{ width: `${item.value}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Memory progress bar */}
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Database className="w-3.5 h-3.5 text-indigo-500" /> Memory Utilization
                </span>
                <div className="space-y-2.5">
                  {memLeaderboard.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic">No Memory metrics available</p>
                  ) : (
                    memLeaderboard.map((item) => (
                      <div key={item.hostname} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium text-slate-600">
                          <span>{item.hostname}</span>
                          <span className="font-bold">{item.value.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              item.value > 85 ? 'bg-rose-500' : item.value > 70 ? 'bg-amber-500' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${item.value}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

      </div>

      {/* Engine & Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Celery worker monitor */}
        <Card className="flex flex-col justify-between h-[380px] shadow-sm bg-white border border-slate-100">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-50">
              <h3 className="text-base font-bold font-display text-atlas-ink">Worker Engines</h3>
              <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md border ${
                celeryStats.status === 'online' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-500 border-rose-100'
              }`}>
                {celeryStats.status}
              </span>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-slate-100/50">
                <span className="text-xs text-slate-500 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-slate-400" /> Active Executing Tasks
                </span>
                <span className="text-xs font-bold text-slate-700">{celeryStats.active_tasks_count}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100/50">
                <span className="text-xs text-slate-500 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> Queued / Reserved
                </span>
                <span className="text-xs font-bold text-slate-700">{celeryStats.reserved_tasks_count}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100/50">
                <span className="text-xs text-slate-500 flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-slate-400" /> Scheduled Actions
                </span>
                <span className="text-xs font-bold text-slate-700">{celeryStats.scheduled_tasks_count}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-xs text-slate-500 flex items-center gap-2">
                  <Network className="w-3.5 h-3.5 text-slate-400" /> Active Worker Nodes
                </span>
                <span className="text-xs font-bold text-slate-700">{celeryStats.workers_count}</span>
              </div>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><Fingerprint className="w-3.5 h-3.5" /> redis-sentinel pool</span>
            <span className="font-semibold text-slate-500">Live Auto-Refreshes</span>
          </div>
        </Card>

        {/* Telemetry charts */}
        <Card className="lg:col-span-2 flex flex-col h-[380px] shadow-sm bg-white border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold font-display text-atlas-ink">Fabric CPU & Memory Telemetry</h3>
              <p className="text-xs text-slate-400 mt-0.5">Real-time switch resource metrics pulled from database telemetry streams</p>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-atlas-primary"><Cpu className="w-3.5 h-3.5" /> CPU</span>
              <span className="flex items-center gap-1.5 text-indigo-500"><Database className="w-3.5 h-3.5" /> Memory</span>
            </div>
          </div>
          <div className="flex-grow flex items-center justify-center">
            {telemetryHistory.length === 0 ? (
              <div className="text-center py-8">
                <Database className="w-12 h-12 text-slate-200 mx-auto mb-2 animate-pulse" />
                <p className="text-xs text-slate-400">Waiting for live switch telemetry metrics to populate...</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={telemetryHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#564EBD" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#564EBD" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="timestamp" stroke="#6B6B85" fontSize={10} tickLine={false} />
                  <YAxis stroke="#6B6B85" fontSize={10} tickLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', fontSize: '11px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                  <Area type="monotone" dataKey="cpu" stroke="#564EBD" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" name="CPU Usage (%)" />
                  <Area type="monotone" dataKey="memory" stroke="#6366F1" strokeWidth={2} fillOpacity={1} fill="url(#colorMem)" name="Memory Usage (%)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

      </div>

      {/* Recent Celery Provisioning Jobs Grid */}
      <Card className="shadow-sm bg-white border border-slate-100">
        <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-3">
          <div>
            <h3 className="text-base font-bold font-display text-atlas-ink">Recent Configuration Jobs</h3>
            <p className="text-xs text-slate-400 mt-0.5">Status of Celery orchestration and provisioning workflows</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          {recentJobs.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No recent fabric orchestration jobs detected.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                  <th className="py-2.5">Subnet CIDR</th>
                  <th className="py-2.5">VRF Context</th>
                  <th className="py-2.5">Fabric Target</th>
                  <th className="py-2.5">Job Triggered</th>
                  <th className="py-2.5">Sync Status</th>
                  <th className="py-2.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => (
                  <tr key={job.job_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                    <td className="py-3 font-semibold text-slate-700">{job.subnet_cidr}</td>
                    <td className="py-3 text-slate-500 font-mono">{job.vrf_name}</td>
                    <td className="py-3 text-slate-600 font-medium">{job.fabric_name}</td>
                    <td className="py-3 text-slate-400">
                      {new Date(job.started_at).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3">
                      <span className={`px-2.5 py-0.5 text-[9px] font-bold rounded-md uppercase tracking-wider border ${
                        job.status === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        job.status === 'failed' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                        job.status === 'in_progress' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                        'bg-slate-50 text-slate-500 border-slate-100'
                      }`}>
                        {job.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {job.error_message ? (
                        <span className="text-[10px] text-rose-500 font-medium" title={job.error_message}>
                          Error details &rarr;
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Sync complete</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Row of Audit & ZTP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Real-time Audit Trail Feed */}
        <Card className="flex flex-col justify-between h-[360px] shadow-sm bg-white border border-slate-100">
          <div>
            <h3 className="text-base font-bold font-display text-atlas-ink mb-1">NOC Audit Trail</h3>
            <p className="text-xs text-slate-400 mb-4">Latest actions performed on the platform</p>
            
            <div className="space-y-4">
              {auditLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  No recent audit logs found in the database.
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.log_id} className="flex gap-3 text-xs leading-normal">
                    <div className="p-1.5 bg-slate-100 text-slate-600 rounded-lg h-7 w-7 flex items-center justify-center mt-0.5">
                      <Terminal className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-grow">
                      <p className="font-semibold text-slate-700">
                        {log.username} <span className="font-normal text-slate-500">performed</span> {log.action}
                      </p>
                      <div className="flex gap-2 text-[10px] text-slate-400 mt-1">
                        <span>{log.ip_address || 'internal'}</span>
                        <span>·</span>
                        <span>{new Date(log.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          <button 
            onClick={() => navigate('/audit-logs')}
            className="w-full text-center text-xs font-semibold text-atlas-primary hover:underline pt-4 border-t border-slate-100 flex items-center justify-center gap-1"
          >
            <History className="w-3.5 h-3.5" /> View All System Audit Logs &rarr;
          </button>
        </Card>

        {/* ZTP Discovery Pool Widget */}
        <Card className="flex flex-col justify-between h-[360px] shadow-sm bg-white border border-slate-100">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-3">
              <div>
                <h3 className="text-base font-bold font-display text-atlas-ink">ZTP Discovery Pool</h3>
                <p className="text-xs text-slate-400">Newly detected hardware waiting for onboarding</p>
              </div>
              <button 
                onClick={() => navigate('/switches')} 
                className="text-xs font-semibold text-atlas-primary hover:underline"
              >
                Onboard &rarr;
              </button>
            </div>
            
            <div className="space-y-4 overflow-y-auto max-h-[220px] pr-1">
              {ztpDevices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <HeartPulse className="w-12 h-12 text-slate-200 stroke-slate-400 mb-2 fill-slate-50" />
                  <p className="text-xs font-semibold text-slate-600">ZTP Pool Clear</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">No unassigned switches discovered in the local subnets.</p>
                </div>
              ) : (
                ztpDevices.map((dev) => (
                  <div key={dev.discovery_id} className="flex justify-between items-center py-2.5 border-b border-slate-100/50 last:border-0">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-700">{dev.mac_address}</div>
                      <div className="text-[10px] text-slate-400">{dev.hardware_vendor} {dev.hardware_model} | IP: {dev.current_dhcp_ip}</div>
                    </div>
                    <button 
                      onClick={() => navigate('/switches')}
                      className="btn-secondary py-1 px-2.5 text-[10px]"
                    >
                      Onboard
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          
          <div className="text-[10px] text-slate-400 flex items-center gap-1 justify-end pt-3 border-t border-slate-50">
            <span>Pool count: {metrics.ztpPoolCount} pending</span>
          </div>
        </Card>

      </div>

    </div>
  );
};

export default Dashboard;

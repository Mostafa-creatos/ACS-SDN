import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
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
  Play, 
  Activity, 
  History, 
  PlusCircle, 
  Cpu, 
  Database,
  CheckCircle2,
  AlertCircle,
  Clock,
  Terminal
} from 'lucide-react';

interface ZtpDevice {
  discovery_id: string;
  mac_address: string;
  serial_number: string;
  hardware_vendor: string;
  hardware_model: string;
  current_dhcp_ip: string;
  base_os_version: string;
}

interface CeleryStats {
  status: 'online' | 'offline';
  active_tasks_count: number;
  reserved_tasks_count: number;
  scheduled_tasks_count: number;
  workers_count: number;
  error?: string;
}

interface TelemetryPoint {
  timestamp: string;
  cpu: number;
  memory: number;
}

interface AuditLog {
  log_id: string;
  username: string;
  action: string;
  ip_address: string | null;
  status: string;
  created_at: string;
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { token, selectedTenant } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalSwitches: 0,
    activeSwitches: 0,
    driftedSwitches: 0,
    pendingApprovals: 0
  });

  const [ztpDevices, setZtpDevices] = useState<ZtpDevice[]>([]);
  const [celeryStats, setCeleryStats] = useState<CeleryStats>({
    status: 'offline',
    active_tasks_count: 0,
    reserved_tasks_count: 0,
    scheduled_tasks_count: 0,
    workers_count: 0
  });
  
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditStep, setAuditStep] = useState(0);

  const fetchDashboardData = async () => {
    try {
      const headers: any = { 'Authorization': `Bearer ${token}` };
      if (selectedTenant) {
        headers['X-Tenant-ID'] = selectedTenant;
      }
      
      // 1. Fetch Switches Summary
      const swRes = await fetch('/api/v5/visibility/inventory', { headers });
      const switches = swRes.ok ? await swRes.json() : [];
      let switchesList = Array.isArray(switches) ? switches : (switches.items || []);
      
      const total = switchesList.length;
      const active = switchesList.filter((s: any) => s.status === 'Up' || s.lifecycle_status === 'compliant_active').length;
      const drifted = switchesList.filter((s: any) => s.lifecycle_status === 'configuration_drifted').length;

      // 2. Fetch Pending Approvals Count
      let approvals = 0;
      try {
        const approvalRes = await fetch('/api/v5/orchestrator/approvals', { headers });
        if (approvalRes.ok) {
          const approvalsList = await approvalRes.json();
          approvals = approvalsList.length;
        }
      } catch {}

      setMetrics({
        totalSwitches: total,
        activeSwitches: active,
        driftedSwitches: drifted,
        pendingApprovals: approvals
      });

      // 3. Fetch ZTP pool
      try {
        const ztpRes = await fetch('/api/v5/admin/ztp-pool', { headers });
        if (ztpRes.ok) {
          const ztpData = await ztpRes.json();
          setZtpDevices(ztpData || []);
        }
      } catch (err) {
        console.error("Failed to load ZTP pool:", err);
      }

      // 4. Fetch Celery Stats
      try {
        const celeryRes = await fetch('/api/v5/admin/celery-stats', { headers });
        if (celeryRes.ok) {
          const celeryData = await celeryRes.json();
          setCeleryStats(celeryData);
        }
      } catch (err) {
        console.error("Failed to load Celery stats:", err);
      }

      // 5. Fetch Real Telemetry Metrics (CPU & Memory utilization)
      try {
        const cpuMetricRes = await fetch('/api/v5/visibility/telemetry?metric_name=cpu_utilization', { headers });
        const memMetricRes = await fetch('/api/v5/visibility/telemetry?metric_name=memory_utilization', { headers });
        
        const cpuData = cpuMetricRes.ok ? await cpuMetricRes.json() : [];
        const memData = memMetricRes.ok ? await memMetricRes.json() : [];

        // Align timestamps into unified points
        const pointsMap: { [timestamp: string]: TelemetryPoint } = {};
        
        cpuData.forEach((item: any) => {
          const dateStr = new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          if (!pointsMap[dateStr]) {
            pointsMap[dateStr] = { timestamp: dateStr, cpu: 0, memory: 0 };
          }
          pointsMap[dateStr].cpu = parseFloat(item.metric_value) || 0;
        });

        memData.forEach((item: any) => {
          const dateStr = new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          if (!pointsMap[dateStr]) {
            pointsMap[dateStr] = { timestamp: dateStr, cpu: 0, memory: 0 };
          }
          pointsMap[dateStr].memory = parseFloat(item.metric_value) || 0;
        });

        const sortedPoints = Object.values(pointsMap).reverse();
        setTelemetryHistory(sortedPoints);
      } catch (err) {
        console.error("Failed to load telemetry history:", err);
      }

      // 6. Fetch 5 Recent Audit Logs
      try {
        const auditRes = await fetch('/api/v5/admin/audit-logs?page=1&limit=5', { headers });
        if (auditRes.ok) {
          const auditData = await auditRes.json();
          setAuditLogs(auditData.items || []);
        }
      } catch (err) {
        console.error("Failed to load audit logs:", err);
      }

    } catch (err) {
      console.error("Error loading dashboard metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [token, selectedTenant]);

  const handleRunAudit = () => {
    setAuditRunning(true);
    setAuditStep(1);

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

    const stepInterval = setInterval(() => {
      setAuditStep(prev => {
        if (prev >= 3) {
          clearInterval(stepInterval);
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
        <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">NOC Control Room</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse h-32 flex flex-col justify-between py-5">
              <div className="h-4 bg-slate-200 rounded w-2/3" />
              <div className="h-8 bg-slate-200 rounded w-1/3 mt-3" />
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="h-[380px] lg:col-span-2 animate-pulse" />
          <Card className="h-[380px] animate-pulse" />
        </div>
      </div>
    );
  }

  // Calculate task checks status
  const checklist = [
    {
      id: 'ztp',
      title: 'Zero-Touch Device Provisioning',
      description: ztpDevices.length > 0 
        ? `${ztpDevices.length} raw switches discovered and waiting in DHCP pool` 
        : 'All discovered fabric devices onboarded successfully',
      status: ztpDevices.length > 0 ? 'warning' : 'success',
      actionLabel: 'View ZTP Queue',
      onClick: () => navigate('/switches')
    },
    {
      id: 'drift',
      title: 'Configuration Drift Audit',
      description: metrics.driftedSwitches > 0 
        ? `${metrics.driftedSwitches} switches showing out-of-sync/drifted configuration templates` 
        : 'All switch active configurations in-sync with golden templates',
      status: metrics.driftedSwitches > 0 ? 'danger' : 'success',
      actionLabel: 'View Compliance',
      onClick: () => navigate('/compliance')
    },
    {
      id: 'approvals',
      title: 'Security Change Approvals',
      description: metrics.pendingApprovals > 0 
        ? `${metrics.pendingApprovals} pending deployment requests requiring administrator validation` 
        : 'No pending security configuration changes awaiting approval',
      status: metrics.pendingApprovals > 0 ? 'info' : 'success',
      actionLabel: 'Review Approvals',
      onClick: () => navigate('/pending-approvals')
    },
    {
      id: 'workers',
      title: 'Background Workers Engine',
      description: celeryStats.status === 'online'
        ? `Task workers online. ${celeryStats.active_tasks_count} active / ${celeryStats.reserved_tasks_count} queued tasks`
        : 'Broker connection unreachable. Background workers disconnected.',
      status: celeryStats.status === 'online' ? 'success' : 'danger',
      actionLabel: celeryStats.status === 'online' ? null : 'Troubleshoot'
    }
  ];

  return (
    <div className="space-y-6">
      
      {/* Control Room Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">NOC Control Room</h1>
          <p className="text-xs text-slate-400 mt-1">Real-Time Core Orchestrator & Telemetry Stream</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleRunAudit}
            disabled={auditRunning}
            className="btn-secondary flex items-center gap-2"
          >
            <Play className={`w-4 h-4 ${auditRunning ? 'animate-spin' : ''}`} />
            <span>
              {auditRunning ? `Running Verification (Step ${auditStep}/3)...` : 'Trigger Compliance Run'}
            </span>
          </button>
        </div>
      </div>

      {/* Row of 4 Core KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Total Switches */}
        <Card className="flex items-center gap-4 hoverable cursor-pointer" onClick={() => navigate('/switches')}>
          <div className="p-3 bg-atlas-primary/10 text-atlas-primary rounded-xl">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Total Devices</span>
            <span className="text-2xl font-bold font-display text-slate-800 leading-tight">{metrics.totalSwitches}</span>
          </div>
        </Card>

        {/* Compliant & Active */}
        <Card className="flex items-center gap-4 hoverable cursor-pointer" onClick={() => navigate('/compliance')}>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Compliant & Active</span>
            <span className="text-2xl font-bold font-display text-emerald-600 leading-tight">{metrics.activeSwitches}</span>
          </div>
        </Card>

        {/* Drifted */}
        <Card className="flex items-center gap-4 hoverable cursor-pointer" onClick={() => navigate('/compliance')}>
          <div className={`p-3 rounded-xl ${
            metrics.driftedSwitches > 0 ? 'bg-rose-50 text-rose-500' : 'bg-slate-100 text-slate-400'
          }`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Drifted Switches</span>
            <span className={`text-2xl font-bold font-display leading-tight ${
              metrics.driftedSwitches > 0 ? 'text-rose-500' : 'text-slate-500'
            }`}>
              {metrics.driftedSwitches}
            </span>
          </div>
        </Card>

        {/* Pending Approvals */}
        <Card className="flex items-center gap-4 hoverable cursor-pointer" onClick={() => navigate('/pending-approvals')}>
          <div className="p-3 bg-atlas-violet/10 text-atlas-violet rounded-xl">
            <FileClock className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Changes</span>
            <span className="text-2xl font-bold font-display text-atlas-violet leading-tight">{metrics.pendingApprovals}</span>
          </div>
        </Card>
      </div>

      {/* Main Grid: Checklist & Monitors */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Day-to-Day Checklist Panel */}
        <Card className="lg:col-span-2 flex flex-col h-full justify-between">
          <div>
            <h3 className="text-lg font-bold font-display text-atlas-ink mb-1">Daily Operations Checklist</h3>
            <p className="text-xs text-slate-500 mb-6">Verify and action critical day-to-day network orchestrations</p>
            
            <div className="space-y-4">
              {checklist.map((item) => (
                <div key={item.id} className="flex items-start gap-4 p-3 rounded-xl hover:bg-slate-50/50 transition-colors border border-slate-100">
                  <div className="mt-0.5">
                    {item.status === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-50" />}
                    {item.status === 'warning' && <AlertCircle className="w-5 h-5 text-amber-500 fill-amber-50" />}
                    {item.status === 'danger' && <AlertTriangle className="w-5 h-5 text-rose-500 fill-rose-50" />}
                    {item.status === 'info' && <Clock className="w-5 h-5 text-atlas-violet fill-violet-50" />}
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-700">{item.title}</h4>
                      {item.actionLabel && (
                        <button 
                          onClick={item.onClick}
                          className="text-xs font-semibold text-atlas-primary hover:underline flex items-center gap-1"
                        >
                          {item.actionLabel} &rarr;
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Background Workers Monitor */}
        <Card className="flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold font-display text-atlas-ink">Worker Engines</h3>
              <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${
                celeryStats.status === 'online' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
              }`}>
                {celeryStats.status}
              </span>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-slate-400" /> Active Executing Tasks
                </span>
                <span className="text-sm font-bold text-slate-700">{celeryStats.active_tasks_count}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> Queued / Reserved
                </span>
                <span className="text-sm font-bold text-slate-700">{celeryStats.reserved_tasks_count}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-slate-400" /> Scheduled Actions
                </span>
                <span className="text-sm font-bold text-slate-700">{celeryStats.scheduled_tasks_count}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5 text-slate-400" /> Active Worker Nodes
                </span>
                <span className="text-sm font-bold text-slate-700">{celeryStats.workers_count}</span>
              </div>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Broker: Redis://localhost:6379/0</span>
            <span className="font-semibold text-slate-500">Auto-Refreshes Live</span>
          </div>
        </Card>
      </div>

      {/* Telemetry Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Telemetry charts */}
        <Card className="lg:col-span-2 flex flex-col h-[380px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold font-display text-atlas-ink">Fabric CPU & Memory Telemetry</h3>
              <p className="text-xs text-slate-400 mt-0.5">Real-time switch resource metrics pulled from database telemetry streams</p>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1 text-atlas-primary"><Cpu className="w-3 h-3" /> CPU Utilization</span>
              <span className="flex items-center gap-1 text-indigo-500"><Database className="w-3 h-3" /> Memory Utilization</span>
            </div>
          </div>
          <div className="flex-grow flex items-center justify-center">
            {telemetryHistory.length === 0 ? (
              <div className="text-center py-8">
                <Database className="w-12 h-12 text-slate-300 mx-auto mb-2 animate-pulse" />
                <p className="text-xs text-slate-400">Waiting for live switch telemetry metrics to populate...</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={telemetryHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#BAC0D8/30" opacity={0.15} />
                  <XAxis dataKey="timestamp" stroke="#6B6B85" fontSize={10} tickLine={false} />
                  <YAxis stroke="#6B6B85" fontSize={10} tickLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #BAC0D8', borderRadius: '8px', fontSize: '11px' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="cpu" stroke="#564EBD" strokeWidth={2} dot={{ r: 3 }} name="CPU Usage (%)" />
                  <Line type="monotone" dataKey="memory" stroke="#6366F1" strokeWidth={2} dot={{ r: 3 }} name="Memory Usage (%)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Real-time Audit Trail Feed */}
        <Card className="flex flex-col justify-between h-[380px]">
          <div>
            <h3 className="text-base font-bold font-display text-atlas-ink mb-1">NOC Audit Trail</h3>
            <p className="text-xs text-slate-500 mb-4">Latest actions performed on the platform</p>
            
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
      </div>

      {/* ZTP Discovery Pool Widget (Displayed only when devices are discovered) */}
      {ztpDevices.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold font-display text-atlas-ink">Unprovisioned ZTP Discovery Pool</h3>
              <p className="text-xs text-slate-500 mt-0.5">Auto-detected switches in the subnet waiting for cluster onboarding</p>
            </div>
            <button 
              onClick={() => navigate('/switches')} 
              className="text-xs font-semibold text-atlas-primary hover:underline flex items-center gap-1"
            >
              Onboard Switches &rarr;
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                  <th className="py-2.5">MAC Address</th>
                  <th className="py-2.5">Serial Number</th>
                  <th className="py-2.5">Hardware Model</th>
                  <th className="py-2.5">DHCP IP Address</th>
                  <th className="py-2.5">Base OS Version</th>
                  <th className="py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {ztpDevices.map((dev) => (
                  <tr key={dev.discovery_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                    <td className="py-3 font-semibold text-slate-700">{dev.mac_address}</td>
                    <td className="py-3 text-slate-500">{dev.serial_number || 'N/A'}</td>
                    <td className="py-3 text-slate-600 font-medium">
                      {dev.hardware_vendor} {dev.hardware_model}
                    </td>
                    <td className="py-3 text-slate-500">{dev.current_dhcp_ip}</td>
                    <td className="py-3 text-slate-400">{dev.base_os_version}</td>
                    <td className="py-3 text-right">
                      <button 
                        onClick={() => navigate('/switches')}
                        className="text-xs font-bold text-atlas-primary hover:text-atlas-ink transition-colors flex items-center gap-1 ml-auto"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Onboard
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

    </div>
  );
};

export default Dashboard;

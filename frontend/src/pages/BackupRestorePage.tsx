import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { 
  Database, 
  Calendar, 
  PlusCircle, 
  Play, 
  Trash2, 
  GitCompare, 
  CheckCircle2, 
  AlertTriangle,
  X,
  RefreshCw,
  Eye,
  Copy,
  Check,
  Search,
  Loader2
} from 'lucide-react';

interface Snapshot {
  backup_id: string;
  switch_id: string;
  switch_hostname: string;
  created_at: string;
  created_by: string;
  config_hash: string;
  backup_type: string;
  status: string;
  error_message: string | null;
}

interface Schedule {
  schedule_id: string;
  fabric_id: string | null;
  fabric_name: string;
  schedule_interval: string;
  cron_expression: string | null;
  is_active: boolean;
  last_run: string | null;
  next_run: string | null;
}

interface SwitchItem {
  switch_id: string;
  hostname: string;
  vendor: string;
}

interface FabricItem {
  fabric_id: string;
  fabric_name: string;
}

interface TaskStatus {
  task_id: string;
  status: string;
  ready: boolean;
  result?: any;
  error?: string;
}

export const BackupRestorePage: React.FC = () => {
  const { token } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'snapshots' | 'schedules'>('snapshots');
  const [loading, setLoading] = useState(true);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [switches, setSwitches] = useState<SwitchItem[]>([]);
  const [fabrics, setFabrics] = useState<FabricItem[]>([]);
  
  const [selectedSwitch, setSelectedSwitch] = useState('');
  const [takingSnapshot, setTakingSnapshot] = useState(false);
  const [taskStatusMsg, setTaskStatusMsg] = useState<string | null>(null);
  const [taskSuccess, setTaskSuccess] = useState<boolean | null>(null);

  // Raw configuration content viewer state
  const [viewingConfig, setViewingConfig] = useState<string | null>(null);
  const [viewingConfigTitle, setViewingConfigTitle] = useState('');
  const [configSearchQuery, setConfigSearchQuery] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [diffData, setDiffData] = useState<{ switch_hostname: string; diff: string } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const [confirmRestore, setConfirmRestore] = useState<Snapshot | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [restoreTaskStatus, setRestoreTaskStatus] = useState<string | null>(null);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedFabric, setSelectedFabric] = useState('all');
  const [selectedInterval, setSelectedInterval] = useState('daily');
  const [creatingSchedule, setCreatingSchedule] = useState(false);

  // Polling ref for task status
  const pollIntervalRef = useRef<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      // 1. Fetch Backups
      const backupsRes = await fetch('/api/v5/backups', { headers });
      if (backupsRes.ok) {
        const backupsData = await backupsRes.json();
        setSnapshots(backupsData);
      }

      // 2. Fetch Schedules
      const schedulesRes = await fetch('/api/v5/backups/schedules', { headers });
      if (schedulesRes.ok) {
        const schedulesData = await schedulesRes.json();
        setSchedules(schedulesData);
      }

      // 3. Fetch Switches (for selection dropdown)
      const swRes = await fetch('/api/v5/visibility/inventory', { headers });
      if (swRes.ok) {
        const swData = await swRes.json();
        const swList = Array.isArray(swData) ? swData : (swData.items || []);
        setSwitches(swList.map((s: any) => ({
          switch_id: s.switch_id,
          hostname: s.hostname,
          vendor: s.vendor
        })));
        
        // Compute unique fabrics from switches
        const uniqueFabrics: FabricItem[] = [];
        const seen = new Set<string>();
        swList.forEach((s: any) => {
          if (s.fabric_id && !seen.has(s.fabric_id)) {
            seen.add(s.fabric_id);
            uniqueFabrics.push({
              fabric_id: s.fabric_id,
              fabric_name: s.fabric_name || `Fabric (ID: ${s.fabric_id.substring(0, 8)})`
            });
          }
        });
        setFabrics(uniqueFabrics);
      }

    } catch (e) {
      console.error("Failed to load backups data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [token]);

  // Celery Task Status Polling helper
  const startTaskPolling = (taskId: string, isRestore: boolean = false) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    
    setTaskSuccess(null);
    const headers = { 'Authorization': `Bearer ${token}` };
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v5/backups/tasks/${taskId}`, { headers });
        if (res.ok) {
          const taskData: TaskStatus = await res.json();
          const displayStatus = taskData.status.toUpperCase();
          
          if (isRestore) {
            setRestoreTaskStatus(`Remediation Rollback Job: ${displayStatus}`);
          } else {
            setTaskStatusMsg(`Task Status: ${displayStatus}`);
          }

          if (taskData.ready) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            const isSuccess = taskData.status === 'SUCCESS';
            
            if (isRestore) {
              setRestoring(false);
              if (isSuccess) {
                setRestoreSuccess(true);
                setTimeout(() => {
                  setConfirmRestore(null);
                  setRestoreSuccess(false);
                  setRestoreTaskStatus(null);
                  fetchData();
                }, 3000);
              } else {
                setRestoreTaskStatus(`Rollback failed: ${taskData.error || 'Check celery logs.'}`);
              }
            } else {
              setTakingSnapshot(false);
              setTaskSuccess(isSuccess);
              if (isSuccess) {
                setTaskStatusMsg("Snapshot successfully completed!");
                setTimeout(() => {
                  setTaskStatusMsg(null);
                  setTaskSuccess(null);
                  fetchData();
                }, 3000);
              } else {
                setTaskStatusMsg(`Snapshot failed: ${taskData.error || 'Check switch parameters.'}`);
              }
            }
          }
        }
      } catch (e) {
        console.error("Error polling task:", e);
      }
    }, 1000);
  };

  const handleTakeSnapshot = async () => {
    if (!selectedSwitch) return;
    setTakingSnapshot(true);
    setTaskStatusMsg("Triggering Celery snapshot task...");
    setTaskSuccess(null);
    try {
      const res = await fetch('/api/v5/backups/snapshot', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ switch_id: selectedSwitch })
      });
      if (res.ok) {
        const data = await res.json();
        startTaskPolling(data.task_id, false);
      } else {
        const err = await res.json();
        setTaskStatusMsg(`Error: ${err.detail || 'Failed to trigger snapshot.'}`);
        setTakingSnapshot(false);
      }
    } catch (e) {
      setTaskStatusMsg("Network error initiating snapshot.");
      setTakingSnapshot(false);
    }
  };

  const handleViewConfigContent = async (snap: Snapshot) => {
    setViewingConfigTitle(`${snap.switch_hostname} snapshot config (${new Date(snap.created_at).toLocaleDateString()})`);
    setViewingConfig("");
    setConfigLoading(true);
    setConfigSearchQuery("");
    try {
      const res = await fetch(`/api/v5/backups/${snap.backup_id}/content`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setViewingConfig(data.config_content || "No configuration content found.");
      } else {
        setViewingConfig("Failed to load configuration content.");
      }
    } catch (e) {
      setViewingConfig("Network error fetching configuration content.");
    } finally {
      setConfigLoading(false);
    }
  };

  const handleViewDiff = async (snap: Snapshot) => {
    setDiffLoading(true);
    setDiffData(null);
    try {
      const res = await fetch(`/api/v5/backups/diff/${snap.backup_id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDiffData(data);
      }
    } catch (e) {
      console.error("Failed to load diff:", e);
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!confirmRestore) return;
    setRestoring(true);
    setRestoreSuccess(false);
    setRestoreTaskStatus("Initiating rollback configuration transfer...");
    try {
      const res = await fetch('/api/v5/backups/restore', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ backup_id: confirmRestore.backup_id })
      });
      if (res.ok) {
        const data = await res.json();
        startTaskPolling(data.task_id, true);
      } else {
        const err = await res.json();
        setRestoreTaskStatus(`Error: ${err.detail || 'Failed to start restore rollback.'}`);
        setRestoring(false);
      }
    } catch (e) {
      setRestoreTaskStatus("Network error starting configuration rollback.");
      setRestoring(false);
    }
  };

  const handleCreateSchedule = async () => {
    setCreatingSchedule(true);
    try {
      const res = await fetch('/api/v5/backups/schedules', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fabric_id: selectedFabric === 'all' ? null : selectedFabric,
          schedule_interval: selectedInterval
        })
      });
      if (res.ok) {
        setShowScheduleModal(false);
        fetchData();
      }
    } catch (e) {
      console.error("Failed to create schedule:", e);
    } finally {
      setCreatingSchedule(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm("Are you sure you want to delete this scheduled backup rule?")) return;
    try {
      const res = await fetch(`/api/v5/backups/schedules/${scheduleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error("Failed to delete schedule:", e);
    }
  };

  const handleCopyConfig = () => {
    if (!viewingConfig) return;
    navigator.clipboard.writeText(viewingConfig);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to filter config file lines by search query
  const getFilteredConfigText = () => {
    if (!viewingConfig) return "";
    if (!configSearchQuery.trim()) return viewingConfig;
    
    return viewingConfig
      .split('\n')
      .filter(line => line.toLowerCase().includes(configSearchQuery.toLowerCase()))
      .join('\n');
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">Sauvegarde & Restauration</h1>
          <p className="text-xs text-slate-400 mt-1">Network snapshots registry, automation cron scheduler and unified config difference analysis</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={fetchData}
            className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Manual snapshot card with Task Status monitoring */}
      <Card className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 py-4 border-l-4 border-l-atlas-primary shadow-sm bg-white/80 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-grow">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Manual Snapshot</span>
          <select 
            value={selectedSwitch}
            onChange={(e) => setSelectedSwitch(e.target.value)}
            className="select-field text-xs py-1.5 px-3 rounded-lg border border-slate-200 bg-white shadow-sm flex-grow sm:max-w-xs focus:ring-1 focus:ring-atlas-primary focus:border-atlas-primary"
          >
            <option value="">Select Switch Node...</option>
            {switches.map((sw) => (
              <option key={sw.switch_id} value={sw.switch_id}>
                {sw.hostname} ({sw.vendor})
              </option>
            ))}
          </select>
          <button
            onClick={handleTakeSnapshot}
            disabled={takingSnapshot || !selectedSwitch}
            className="btn-primary text-xs flex items-center gap-1.5 py-1.5 px-4 font-semibold shadow-sm transition-all active:scale-[0.98]"
          >
            {takingSnapshot ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
            ) : (
              <Play className="w-3.5 h-3.5 text-white" />
            )}
            Snapshot Now
          </button>
        </div>
        {taskStatusMsg && (
          <div className={`text-xs font-bold px-3 py-1.5 rounded-lg border flex items-center gap-2 animate-pulse ${
            taskSuccess === true 
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700 animate-none' 
              : taskSuccess === false 
              ? 'bg-rose-50 border-rose-100 text-rose-700 animate-none'
              : 'bg-indigo-50 border-indigo-100 text-indigo-700'
          }`}>
            {taskSuccess === true ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : taskSuccess === false ? (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
            )}
            <span>{taskStatusMsg}</span>
          </div>
        )}
      </Card>

      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        <button
          onClick={() => setActiveTab('snapshots')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 text-xs font-bold tracking-wider uppercase transition-all ${
            activeTab === 'snapshots' 
              ? 'border-atlas-primary text-atlas-primary' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Database className="w-4 h-4" />
          Configuration Snapshots
        </button>
        <button
          onClick={() => setActiveTab('schedules')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 text-xs font-bold tracking-wider uppercase transition-all ${
            activeTab === 'schedules' 
              ? 'border-atlas-primary text-atlas-primary' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Planification (Scheduler)
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-24 text-center">
          <Loader2 className="w-10 h-10 text-atlas-primary animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Loading control center registry records...</p>
        </div>
      ) : activeTab === 'snapshots' ? (
        
        /* Snapshots Tab */
        <Card className="p-0 overflow-hidden bg-white/70 backdrop-blur-sm shadow-sm border border-slate-100 rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                  <th className="py-3 px-4">Taken At</th>
                  <th className="py-3 px-4">Switch Node</th>
                  <th className="py-3 px-4">Taken By</th>
                  <th className="py-3 px-4">Config Hash</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                      No configuration snapshots found in registry database. Select a device above to snapshot config manually.
                    </td>
                  </tr>
                ) : (
                  snapshots.map((snap) => (
                    <tr key={snap.backup_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40 transition-colors">
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {new Date(snap.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">{snap.switch_hostname}</td>
                      <td className="py-3 px-4 text-slate-500">{snap.created_by}</td>
                      <td className="py-3 px-4 font-mono text-[10px] text-slate-400">
                        {snap.config_hash !== 'N/A' ? snap.config_hash.substring(0, 12) : 'N/A'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          snap.backup_type === 'scheduled' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {snap.backup_type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          snap.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                        }`}>
                          {snap.status}
                        </span>
                        {snap.error_message && (
                          <span className="block text-[9px] text-rose-500 max-w-[150px] truncate mt-0.5">
                            {snap.error_message}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {snap.status === 'completed' && (
                          <div className="flex gap-3 justify-end items-center">
                            <button
                              onClick={() => handleViewConfigContent(snap)}
                              className="text-xs font-bold text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors"
                              title="View full configuration file"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </button>
                            <button
                              onClick={() => handleViewDiff(snap)}
                              className="text-xs font-bold text-slate-400 hover:text-atlas-primary flex items-center gap-1 transition-colors"
                              title="Compare vs current switch config"
                            >
                              <GitCompare className="w-3.5 h-3.5" />
                              Diff
                            </button>
                            <button
                              onClick={() => setConfirmRestore(snap)}
                              className="text-xs font-bold text-rose-400 hover:text-rose-600 flex items-center gap-1 transition-colors"
                              title="Rollback configuration snapshot"
                            >
                              <Play className="w-3.5 h-3.5" />
                              Rollback
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        
        /* Schedules Tab */
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-bold font-display text-atlas-ink">Planification Rules</h3>
              <p className="text-xs text-slate-500 mt-0.5">Define automatic routines to periodically dump fabric configurations</p>
            </div>
            <button
              onClick={() => setShowScheduleModal(true)}
              className="btn-primary text-xs flex items-center gap-1.5 py-1.5 px-4 font-semibold shadow-sm"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Add Backup Schedule
            </button>
          </div>

          <Card className="p-0 overflow-hidden bg-white/70 backdrop-blur-sm shadow-sm border border-slate-100 rounded-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                    <th className="py-3 px-4">Fabric target</th>
                    <th className="py-3 px-4">Interval</th>
                    <th className="py-3 px-4">Last Execution</th>
                    <th className="py-3 px-4">Next Scheduled Run</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                        No active periodic backup schedule rules defined. Click the button above to create one.
                      </td>
                    </tr>
                  ) : (
                    schedules.map((s) => (
                      <tr key={s.schedule_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-800">{s.fabric_name}</td>
                        <td className="py-3 px-4 capitalize text-slate-600 font-medium">{s.schedule_interval}</td>
                        <td className="py-3 px-4 text-slate-500">
                          {s.last_run ? new Date(s.last_run).toLocaleString() : 'Never Executed'}
                        </td>
                        <td className="py-3 px-4 font-semibold text-indigo-600">
                          {s.next_run ? new Date(s.next_run).toLocaleString() : 'N/A'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            s.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {s.is_active ? 'Active' : 'Paused'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeleteSchedule(s.schedule_id)}
                            className="text-rose-400 hover:text-rose-600 p-1 transition-colors"
                            title="Delete schedule routine"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Raw Config Content Viewer Modal */}
      {viewingConfig !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-800">Switch Configuration Viewer</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{viewingConfigTitle}</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Search query box */}
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-slate-400">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    value={configSearchQuery}
                    onChange={(e) => setConfigSearchQuery(e.target.value)}
                    placeholder="Search config lines..."
                    className="pl-8 pr-3 py-1 text-xs border border-slate-200 rounded-lg bg-white w-48 focus:ring-1 focus:ring-atlas-primary focus:border-atlas-primary outline-none"
                  />
                </div>
                
                {/* Copy to Clipboard */}
                <button
                  onClick={handleCopyConfig}
                  className="btn-secondary py-1 px-3 text-xs flex items-center gap-1.5 font-semibold"
                  title="Copy configuration content to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                
                <button 
                  onClick={() => setViewingConfig(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-grow p-6 overflow-y-auto font-mono text-xs leading-relaxed bg-slate-950 text-slate-200 max-h-[60vh] relative">
              {configLoading ? (
                <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 text-atlas-primary animate-spin" />
                  <span>Loading configuration contents...</span>
                </div>
              ) : (
                <pre className="whitespace-pre select-text h-full overflow-x-auto text-[11px] p-2 leading-relaxed">
                  {getFilteredConfigText() || "No matching configuration lines found."}
                </pre>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setViewingConfig(null)}
                className="btn-secondary py-2 px-4 text-xs font-bold"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diff Modal */}
      {diffData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-800">Configuration Diff Analysis</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{diffData.switch_hostname} · Snapshot compared to current running state</p>
              </div>
              <button 
                onClick={() => setDiffData(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-grow p-6 overflow-y-auto font-mono text-xs leading-relaxed bg-slate-950 text-slate-100 max-h-[60vh]">
              {diffLoading ? (
                <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 text-atlas-primary animate-spin" />
                  <span>Generating diff comparisons...</span>
                </div>
              ) : !diffData.diff ? (
                <div className="py-12 text-center text-emerald-400 font-semibold flex flex-col items-center gap-1.5">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  <span>No configuration differences found. Current configuration is fully in-sync with this snapshot!</span>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap select-text text-[11px]">
                  {diffData.diff.split('\n').map((line, idx) => {
                    let colorClass = 'text-slate-400';
                    if (line.startsWith('+') && !line.startsWith('+++')) {
                      colorClass = 'text-emerald-400 bg-emerald-950/40 font-semibold';
                    } else if (line.startsWith('-') && !line.startsWith('---')) {
                      colorClass = 'text-rose-400 bg-rose-950/40 font-semibold';
                    } else if (line.startsWith('@@')) {
                      colorClass = 'text-cyan-400';
                    }
                    return (
                      <div key={idx} className={`px-2 py-0.5 rounded ${colorClass}`}>
                        {line}
                      </div>
                    );
                  })}
                </pre>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setDiffData(null)}
                className="btn-secondary py-2 px-4 text-xs font-bold"
              >
                Close Diff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore/Rollback Confirmation Modal */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex items-center gap-3 text-rose-600 mb-3">
                <AlertTriangle className="w-8 h-8 fill-rose-50" />
                <h3 className="text-lg font-bold font-display">Confirm Snapshot Rollback?</h3>
              </div>
              <p className="text-xs text-slate-500 leading-normal">
                You are about to rollback the configuration of <strong>{confirmRestore.switch_hostname}</strong> to the snapshot taken on <strong>{new Date(confirmRestore.created_at).toLocaleString()}</strong> by <strong>{confirmRestore.created_by}</strong>.
              </p>
              <p className="text-xs text-rose-500 font-bold mt-3">
                WARNING: This will overwrite the switch's current running config and deploy snapshot commands onto the active device!
              </p>

              {restoreTaskStatus && (
                <div className={`mt-4 p-3 rounded-lg text-xs flex items-center gap-2 border ${
                  restoreSuccess 
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                    : restoreTaskStatus.includes('failed')
                    ? 'bg-rose-50 border-rose-100 text-rose-700'
                    : 'bg-indigo-50 border-indigo-100 text-indigo-700 animate-pulse'
                }`}>
                  {restoreSuccess ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : restoreTaskStatus.includes('failed') ? (
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                  )}
                  <span>{restoreTaskStatus}</span>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                disabled={restoring}
                onClick={() => {
                  setConfirmRestore(null);
                  setRestoreTaskStatus(null);
                  if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                }}
                className="btn-secondary text-xs py-2 px-4 font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={restoring || restoreSuccess}
                onClick={handleRestore}
                className="btn-danger text-xs py-2 px-4 font-bold flex items-center gap-1"
              >
                {restoring ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-white" />
                )}
                Confirm Rollback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-base font-bold text-slate-800">Add Backup Schedule Routine</h3>
              <button 
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Target Fabric Node Group</label>
                <select
                  value={selectedFabric}
                  onChange={(e) => setSelectedFabric(e.target.value)}
                  className="select-field text-xs w-full border border-slate-200 rounded-lg p-2 bg-white"
                >
                  <option value="all">All Switches (Fabric-wide)</option>
                  {fabrics.map((f) => (
                    <option key={f.fabric_id} value={f.fabric_id}>
                      {f.fabric_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Backup Interval Timeline</label>
                <select
                  value={selectedInterval}
                  onChange={(e) => setSelectedInterval(e.target.value)}
                  className="select-field text-xs w-full border border-slate-200 rounded-lg p-2 bg-white"
                >
                  <option value="hourly">Hourly (Incremental)</option>
                  <option value="daily">Daily Snapshot (Standard)</option>
                  <option value="weekly">Weekly Archive (Golden)</option>
                </select>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="btn-secondary text-xs py-2 px-4"
              >
                Close
              </button>
              <button
                disabled={creatingSchedule}
                onClick={handleCreateSchedule}
                className="btn-primary text-xs py-2 px-5 font-bold"
              >
                {creatingSchedule ? 'Creating...' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BackupRestorePage;

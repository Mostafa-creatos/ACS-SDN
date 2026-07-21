import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import {
  Send,
  Check,
  AlertTriangle,
  FileText,
  History,
  ChevronDown,
  ShieldAlert,
  RefreshCw
} from 'lucide-react';

interface SwitchItem {
  switch_id: string;
  hostname: string;
  management_ip: string;
  vendor: string;
  lifecycle_status: string;
}

interface PushResult {
  switch_id: string;
  hostname: string;
  diff?: string;
  validation_status?: string;
  task_id?: string;
}

interface PushHistoryEntry {
  id: string;
  tenant: string;
  summary: string;
  target_switches: string;
  blast_radius: number;
  status: string;
  diff: string;
  created_at: string;
}

export const ConfigPushPage: React.FC = () => {
  const { token, user, selectedTenant } = useAuth();

  const [activeTab, setActiveTab] = useState<'push' | 'history'>('push');

  // Push form state
  const [switches, setSwitches] = useState<SwitchItem[]>([]);
  const [selectedSwitchIds, setSelectedSwitchIds] = useState<string[]>([]);
  const [configPayload, setConfigPayload] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; diffs?: PushResult[]; task_ids?: any[]; blast_radius?: any; approval_id?: string } | null>(null);
  const [error, setError] = useState('');
  const [switchDropdownOpen, setSwitchDropdownOpen] = useState(false);

  // History state
  const [history, setHistory] = useState<PushHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const canPush = user?.role === 'Platform Admin' || user?.role === 'platform_admin' || user?.role === 'Tenant Admin' || user?.role === 'tenant_admin';

  // Fetch switches
  useEffect(() => {
    const fetchSwitches = async () => {
      try {
        const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
        if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;
        const res = await fetch('/api/v5/admin/switches', { headers });
        if (res.ok) {
          const data = await res.json();
          setSwitches(Array.isArray(data) ? data : []);
        }
      } catch {}
    };
    fetchSwitches();
  }, [token, selectedTenant]);

  // Fetch history
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;
      const res = await fetch('/api/v5/switch-config/history', { headers });
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch {}
    setHistoryLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, token, selectedTenant]);

  const toggleSwitch = (id: string) => {
    setSelectedSwitchIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedSwitchIds(switches.map(s => s.switch_id));
  };

  const handlePush = async () => {
    if (!configPayload.trim() || selectedSwitchIds.length === 0) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;

      const res = await fetch('/api/v5/switch-config/push', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          switch_ids: selectedSwitchIds,
          config_payload: configPayload,
          dry_run: dryRun
        })
      });

      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(data.detail || 'Config push failed');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  if (!canPush) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-2 min-h-[50vh]">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4 stroke-[1.25]" />
        <h3 className="text-xl font-bold font-display text-atlas-ink mb-1">Access Denied</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Config push requires Tenant Admin or Platform Admin privileges.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">Config Push</h1>
        <p className="text-xs text-slate-400 mt-1">Push configuration snippets to selected switches with dry-run validation</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('push')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-colors ${
            activeTab === 'push' ? 'bg-white text-atlas-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          Push Config
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-colors ${
            activeTab === 'history' ? 'bg-white text-atlas-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          History
        </button>
      </div>

      {activeTab === 'push' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Switch selector + Config input */}
          <div className="lg:col-span-2 space-y-4">
            {/* Switch Selector */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold font-display text-atlas-ink">Target Switches</h3>
                <button onClick={selectAll} className="text-[10px] font-semibold text-atlas-primary hover:underline">
                  Select All ({switches.length})
                </button>
              </div>
              <div className="relative">
                <button
                  onClick={() => setSwitchDropdownOpen(!switchDropdownOpen)}
                  className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span>
                    {selectedSwitchIds.length === 0
                      ? 'Select switches...'
                      : `${selectedSwitchIds.length} switch(es) selected`}
                  </span>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>
                {switchDropdownOpen && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {switches.map(sw => (
                      <label
                        key={sw.switch_id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSwitchIds.includes(sw.switch_id)}
                          onChange={() => toggleSwitch(sw.switch_id)}
                          className="rounded border-slate-300 text-atlas-primary focus:ring-atlas-primary"
                        />
                        <div>
                          <span className="font-semibold text-slate-800">{sw.hostname}</span>
                          <span className="text-slate-400 ml-2">{sw.management_ip}</span>
                          <span className="text-slate-300 ml-2">({sw.vendor})</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Config Input */}
            <Card className="p-5">
              <h3 className="text-sm font-bold font-display text-atlas-ink mb-3">Configuration Snippet</h3>
              <textarea
                value={configPayload}
                onChange={e => setConfigPayload(e.target.value)}
                placeholder={"Enter configuration lines, for example:\ninterface ethernet1/1\n  description UPLINK-TO-SPINE-01\n  switchport mode trunk\n  switchport trunk allowed vlan 100,200"}
                className="w-full h-56 bg-slate-950 text-emerald-400 font-mono text-xs p-4 rounded-lg border border-slate-700 focus:border-atlas-primary focus:ring-1 focus:ring-atlas-primary outline-none resize-none placeholder-slate-600"
                spellCheck={false}
              />
            </Card>
          </div>

          {/* Right: Controls + Results */}
          <div className="space-y-4">
            {/* Push Controls */}
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-bold font-display text-atlas-ink">Push Settings</h3>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 font-medium">Dry Run Mode</span>
                <button
                  onClick={() => setDryRun(!dryRun)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    dryRun ? 'bg-atlas-teal' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      !dryRun ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                {dryRun
                  ? 'Dry run: validates config and shows diff without applying changes.'
                  : 'Live push: config will be applied to selected switches immediately.'}
              </p>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex gap-2 text-rose-700 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handlePush}
                disabled={loading || !configPayload.trim() || selectedSwitchIds.length === 0}
                className={`w-full py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-40 ${
                  dryRun
                    ? 'btn-secondary'
                    : 'btn-primary bg-atlas-coral hover:bg-atlas-coral/90'
                }`}
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : dryRun ? (
                  <FileText className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {loading ? 'Processing...' : dryRun ? 'Validate & Preview' : 'Push Configuration'}
              </button>
            </Card>

            {/* Results */}
            {result && (
              <Card className="p-5 space-y-3">
                <div className={`flex items-center gap-2 text-sm font-bold ${
                  result.status === 'DRY_RUN_COMPLETE' ? 'text-atlas-teal' :
                  result.status === 'PUSH_QUEUED' ? 'text-atlas-primary' :
                  result.status === 'APPROVAL_REQUIRED' ? 'text-atlas-coral' :
                  'text-slate-700'
                }`}>
                  {result.status === 'APPROVAL_REQUIRED' ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : (
                    <Check className="w-5 h-5" />
                  )}
                  {result.status.replace(/_/g, ' ')}
                </div>

                {result.status === 'APPROVAL_REQUIRED' && (
                  <p className="text-xs text-slate-500">
                    High blast radius change requires Platform Admin approval via the Pending Approvals queue.
                  </p>
                )}

                {result.diffs && result.diffs.length > 0 && (
                  <div className="space-y-2">
                    {result.diffs.map(d => (
                      <div key={d.switch_id} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-700">{d.hostname}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            d.validation_status === 'valid' ? 'bg-emerald-50 text-emerald-600' :
                            d.validation_status === 'driver_not_implemented' ? 'bg-amber-50 text-amber-600' :
                            'bg-rose-50 text-rose-600'
                          }`}>
                            {d.validation_status?.replace(/_/g, ' ') || 'unknown'}
                          </span>
                        </div>
                        {d.diff && (
                          <pre className="text-[10px] font-mono text-slate-600 whitespace-pre-wrap max-h-32 overflow-y-auto mt-2 bg-white p-2 rounded border border-slate-100">
                            {d.diff}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {result.task_ids && result.task_ids.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Queued Tasks</p>
                    {result.task_ids.map((t: any) => (
                      <div key={t.switch_id} className="text-[10px] font-mono text-slate-500">
                        {t.switch_id}: task {t.task_id}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      ) : (
        /* History Tab */
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold font-display text-atlas-ink">Config Push History</h3>
            <button onClick={fetchHistory} className="text-xs text-atlas-primary hover:underline flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>

          {historyLoading ? (
            <div className="text-slate-400 text-xs py-10 text-center">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-slate-400 text-xs py-10 text-center">No config push history found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Time</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Tenant</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Summary</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Blast</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 text-slate-500 font-mono">
                        {h.created_at ? new Date(h.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-semibold">{h.tenant}</td>
                      <td className="py-2.5 px-3 text-slate-600">{h.summary}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          h.blast_radius > 5 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {h.blast_radius}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          h.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                          h.status === 'rejected' ? 'bg-rose-50 text-rose-600' :
                          h.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {h.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default ConfigPushPage;

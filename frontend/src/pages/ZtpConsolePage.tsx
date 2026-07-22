import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import {
  Server,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  RotateCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2
} from 'lucide-react';

interface ZtpRecord {
  discovery_id: string;
  mac_address: string;
  serial_number: string;
  hardware_vendor: string;
  os_version: string;
  current_dhcp_ip: string;
  first_seen: string;
  onboarding_status: 'pending' | 'provisioned' | 'failed';
  error_message?: string;
}

interface ZtpDetail {
  discovery_id: string;
  serial_number: string;
  mac_address: string;
  hardware_vendor: string;
  os_version: string;
  current_dhcp_ip: string;
  first_seen: string;
  onboarding_status: string;
  error_message?: string;
  switch?: {
    switch_id: string;
    hostname: string;
    management_ip: string;
    lifecycle_status: string;
  } | null;
  latest_snapshot?: {
    snapshot_id: string;
    config_hash: string;
    is_baseline: boolean;
    taken_by: string;
    taken_at: string;
  } | null;
}

export const ZtpConsolePage: React.FC = () => {
  const { token, user, selectedTenant } = useAuth();
  const [records, setRecords] = useState<ZtpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Detail drawer
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ZtpDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Remove confirmation
  const [removeTarget, setRemoveTarget] = useState<ZtpRecord | null>(null);
  const [removing, setRemoving] = useState(false);

  const isPlatformAdmin = user?.role === 'Platform Admin' || user?.role === 'platform_admin';

  const fetchRecords = useCallback(async () => {
    try {
      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;
      const response = await fetch('/api/v5/discovery/pool', { headers });
      if (!response.ok) throw new Error('Failed to fetch ZTP pool');
      setRecords(await response.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, selectedTenant]);

  useEffect(() => {
    fetchRecords();
    const interval = setInterval(fetchRecords, 5000);
    return () => clearInterval(interval);
  }, [fetchRecords]);

  const fetchDetail = async (discoveryId: string) => {
    if (expandedId === discoveryId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(discoveryId);
    setDetailLoading(true);
    try {
      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;
      const res = await fetch(`/api/v5/discovery/pool/${discoveryId}/status`, { headers });
      if (res.ok) setDetail(await res.json());
    } catch {}
    setDetailLoading(false);
  };

  const handleRetry = async (record: ZtpRecord) => {
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;
      await fetch(`/api/v5/discovery/pool/${record.discovery_id}/retry`, {
        method: 'POST',
        headers
      });
      fetchRecords();
    } catch {}
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;
      await fetch(`/api/v5/discovery/pool/${removeTarget.discovery_id}`, {
        method: 'DELETE',
        headers
      });
      setRecords(prev => prev.filter(r => r.discovery_id !== removeTarget.discovery_id));
      if (expandedId === removeTarget.discovery_id) {
        setExpandedId(null);
        setDetail(null);
      }
    } catch {}
    setRemoving(false);
    setRemoveTarget(null);
  };

  const getElapsed = (firstSeen: string) => {
    const diff = Date.now() - new Date(firstSeen).getTime();
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (mins > 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">ZTP Console</h1>
          <p className="text-xs text-slate-400 mt-1">Zero-Touch Provisioning Discovery and Baseline Onboarding</p>
        </div>
        <button
          onClick={fetchRecords}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="p-2 bg-amber-50 rounded-lg">
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <div className="text-2xl font-bold font-display text-slate-800">
              {records.filter(r => r.onboarding_status === 'pending').length}
            </div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Provisioning</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="p-2 bg-emerald-50 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl font-bold font-display text-slate-800">
              {records.filter(r => r.onboarding_status === 'provisioned').length}
            </div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Provisioned</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="p-2 bg-rose-50 rounded-lg">
            <XCircle className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <div className="text-2xl font-bold font-display text-slate-800">
              {records.filter(r => r.onboarding_status === 'failed').length}
            </div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Failed</div>
          </div>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        {error && (
          <div className="p-4 mb-4 bg-rose-50 border border-rose-200 rounded-lg flex gap-3 text-rose-700 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-8"></th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Device Serial</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">MAC Address</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vendor & OS</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">DHCP IP</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Elapsed</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-sm">
                    No devices in the discovery pool.
                  </td>
                </tr>
              )}
              {records.map((r) => (
                <React.Fragment key={r.discovery_id}>
                  <tr className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => fetchDetail(r.discovery_id)}>
                    <td className="py-3 px-4">
                      {expandedId === r.discovery_id ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {r.onboarding_status === 'pending' && (
                          <>
                            <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                            <span className="text-sm font-medium text-amber-600">Provisioning</span>
                          </>
                        )}
                        {r.onboarding_status === 'provisioned' && (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span className="text-sm font-medium text-emerald-600">Provisioned</span>
                          </>
                        )}
                        {r.onboarding_status === 'failed' && (
                          <>
                            <XCircle className="w-4 h-4 text-rose-500" />
                            <span className="text-sm font-medium text-rose-600">Failed</span>
                          </>
                        )}
                      </div>
                      {r.error_message && (
                        <div className="text-[10px] text-rose-500 mt-1 max-w-[220px] truncate" title={r.error_message}>
                          {r.error_message}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-mono text-slate-800 font-semibold">{r.serial_number}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm font-mono text-slate-500">{r.mac_address}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-slate-700 font-medium">{r.hardware_vendor}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">{r.os_version}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm font-mono text-slate-600">{r.current_dhcp_ip}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-mono ${
                        r.onboarding_status === 'pending' ? 'text-amber-600 animate-pulse' :
                        r.onboarding_status === 'failed' ? 'text-rose-500' : 'text-slate-500'
                      }`}>
                        {r.onboarding_status === 'pending' ? getElapsed(r.first_seen) :
                         r.onboarding_status === 'provisioned' ? new Date(r.first_seen).toLocaleDateString() : '-'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        {r.onboarding_status === 'failed' && (
                          <button
                            onClick={() => handleRetry(r)}
                            className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors"
                            title="Retry provisioning"
                          >
                            <RotateCw className="w-4 h-4" />
                          </button>
                        )}
                        {isPlatformAdmin && (
                          <button
                            onClick={() => setRemoveTarget(r)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 transition-colors"
                            title="Remove from pool"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Detail Row */}
                  {expandedId === r.discovery_id && (
                    <tr>
                      <td colSpan={8} className="px-4 py-3 bg-slate-50/80 border-b border-slate-100">
                        {detailLoading ? (
                          <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Loading details...
                          </div>
                        ) : detail ? (
                          <div className="grid grid-cols-3 gap-4 text-xs">
                            <div className="space-y-1.5">
                              <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Switch Info</div>
                              {detail.switch ? (
                                <>
                                  <div><span className="text-slate-400">Hostname:</span> <span className="font-semibold text-slate-700">{detail.switch.hostname}</span></div>
                                  <div><span className="text-slate-400">IP:</span> <span className="font-mono text-slate-700">{detail.switch.management_ip}</span></div>
                                  <div><span className="text-slate-400">Lifecycle:</span> <span className="font-semibold text-slate-700">{detail.switch.lifecycle_status}</span></div>
                                </>
                              ) : (
                                <div className="text-slate-400 italic">No switch record yet</div>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Provisioning</div>
                              <div><span className="text-slate-400">Status:</span> <span className="font-semibold text-slate-700">{detail.onboarding_status}</span></div>
                              <div><span className="text-slate-400">First Seen:</span> <span className="text-slate-700">{detail.first_seen ? new Date(detail.first_seen).toLocaleString() : '-'}</span></div>
                              {detail.error_message && (
                                <div className="bg-rose-50 border border-rose-100 rounded p-2 text-rose-600 font-mono text-[10px]">
                                  {detail.error_message}
                                </div>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Latest Snapshot</div>
                              {detail.latest_snapshot ? (
                                <>
                                  <div><span className="text-slate-400">Hash:</span> <span className="font-mono text-[10px] text-slate-600">{detail.latest_snapshot.config_hash?.substring(0, 16)}...</span></div>
                                  <div><span className="text-slate-400">Baseline:</span> <span className="font-semibold text-slate-700">{detail.latest_snapshot.is_baseline ? 'Yes' : 'No'}</span></div>
                                  <div><span className="text-slate-400">Taken by:</span> <span className="text-slate-700">{detail.latest_snapshot.taken_by}</span></div>
                                  <div><span className="text-slate-400">At:</span> <span className="text-slate-700">{detail.latest_snapshot.taken_at ? new Date(detail.latest_snapshot.taken_at).toLocaleString() : '-'}</span></div>
                                </>
                              ) : (
                                <div className="text-slate-400 italic">No snapshots yet</div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Remove Confirmation Modal */}
      {removeTarget && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => !removing && setRemoveTarget(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-xl shadow-2xl z-50 p-6 border text-center space-y-4">
            <h3 className="text-base font-bold font-display text-rose-700">Remove from Discovery Pool</h3>
            <p className="text-xs text-slate-600">
              Remove <strong className="text-slate-800">{removeTarget.serial_number}</strong> from the ZTP pool? This action cannot be undone.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setRemoveTarget(null)}
                disabled={removing}
                className="btn bg-slate-50 border text-slate-600 px-4 py-2 hover:bg-slate-100 w-1/2 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="btn bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 w-1/2 text-xs flex items-center justify-center gap-1"
              >
                {removing && <Loader2 className="w-3 h-3 animate-spin" />}
                Remove
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ZtpConsolePage;

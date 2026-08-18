import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import {
  fetchDiscoveryPool, fetchFabricsQuiet, fetchDiscoveryStatus,
  retryDiscovery, assignDiscoveryFabric, removeDiscovery
} from '../lib/api';
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
  Loader2,
  HelpCircle
} from 'lucide-react';

interface ZtpRecord {
  discovery_id: string;
  mac_address: string;
  serial_number: string;
  hardware_vendor: string;
  os_version: string;
  current_dhcp_ip: string;
  first_seen: string;
  onboarding_status: 'pending' | 'provisioned' | 'failed' | 'unassigned';
  error_message?: string;
  fabric_id?: string | null;
  switch_hostname?: string | null;
  switch_role?: string | null;
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
  ztp_logs?: string;
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
  const { user, selectedTenant } = useAuth();
  const [records, setRecords] = useState<ZtpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fabrics verification
  const [fabrics, setFabrics] = useState<any[]>([]);
  const [fabricsLoading, setFabricsLoading] = useState(true);

  // Detail drawer
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ZtpDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Assign to Fabric modal
  const [assignTarget, setAssignTarget] = useState<ZtpRecord | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [selectedFabricId, setSelectedFabricId] = useState('');
  const [assignRole, setAssignRole] = useState('leaf');
  const [assignHostname, setAssignHostname] = useState('');
  const [assignError, setAssignError] = useState('');

  // Remove confirmation
  const [removeTarget, setRemoveTarget] = useState<ZtpRecord | null>(null);
  const [removing, setRemoving] = useState(false);

  const isPlatformAdmin = user?.role === 'Platform Admin' || user?.role === 'platform_admin';

  const fetchRecords = useCallback(async () => {
    try {
      setRecords(await fetchDiscoveryPool(selectedTenant));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedTenant]);

  const loadFabrics = useCallback(async () => {
    try {
      const data = await fetchFabricsQuiet();
      if (data) {
        setFabrics(data);
      }
    } catch (e) {
      console.error('Failed to load fabrics', e);
    } finally {
      setFabricsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
    loadFabrics();
    const interval = setInterval(fetchRecords, 5000);
    return () => clearInterval(interval);
  }, [fetchRecords, loadFabrics]);

  const fetchDetail = async (discoveryId: string) => {
    if (expandedId === discoveryId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(discoveryId);
    setDetailLoading(true);
    try {
      const data = await fetchDiscoveryStatus(discoveryId, selectedTenant);
      if (data) setDetail(data);
    } catch {}
    setDetailLoading(false);
  };

  const handleRetry = async (record: ZtpRecord) => {
    if (record.onboarding_status === 'pending') return;
    try {
      await retryDiscovery(record.discovery_id, selectedTenant);
      fetchRecords();
    } catch {}
  };

  const handleStartAssign = (record: ZtpRecord) => {
    setAssignTarget(record);
    setSelectedFabricId(fabrics[0]?.fabric_id || '');
    setAssignRole(record.switch_role || 'leaf');
    setAssignHostname(record.switch_hostname || record.serial_number);
    setAssignError('');
  };

  const handleAssignFabric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTarget || !selectedFabricId) return;
    setAssigning(true);
    setAssignError('');
    try {
      await assignDiscoveryFabric(assignTarget.discovery_id, {
        fabric_id: selectedFabricId,
        role: assignRole,
        hostname: assignHostname
      });
      setAssignTarget(null);
      fetchRecords();
    } catch (err: any) {
      setAssignError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget || removeTarget.onboarding_status === 'pending') return;
    setRemoving(true);
    try {
      await removeDiscovery(removeTarget.discovery_id, selectedTenant);
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

      {/* Warning Banner: No Fabrics Configured */}
      {fabrics.length === 0 && !fabricsLoading && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-amber-800 text-xs shadow-sm font-sans">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <span className="font-bold">No Fabrics Configured!</span> Before discovered switches can be provisioned, you must create a Fabric overlay in Tenant settings.
            </div>
          </div>
          <Link to="/tenants" className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm">
            Go to Fabrics
          </Link>
        </div>
      )}

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
                        {r.onboarding_status === 'unassigned' && (
                          <>
                            <HelpCircle className="w-4 h-4 text-slate-400" />
                            <span className="text-sm font-medium text-slate-500">Unassigned</span>
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
                        {(!r.fabric_id || r.onboarding_status === 'unassigned') && r.onboarding_status !== 'pending' && r.onboarding_status !== 'provisioned' && (
                          <button
                            onClick={() => handleStartAssign(r)}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold px-2.5 py-1.5 rounded-lg border border-indigo-100 transition-colors text-xs mr-2 shadow-sm"
                            title="Assign to Fabric"
                          >
                            Assign Fabric
                          </button>
                        )}
                        {r.onboarding_status === 'failed' && (
                          <button
                            onClick={() => handleRetry(r)}
                            className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors disabled:opacity-40"
                            title="Retry provisioning"
                          >
                            <RotateCw className="w-4 h-4" />
                          </button>
                        )}
                        {isPlatformAdmin && (
                          <button
                            onClick={() => setRemoveTarget(r)}
                            disabled={r.onboarding_status === 'pending'}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 transition-colors disabled:opacity-40"
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
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-2 text-xs">
                            {/* Column 1: Switch details & Stepper */}
                            <div className="space-y-4">
                              <div className="space-y-2 p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
                                <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Switch Info</div>
                                {detail.switch ? (
                                  <div className="space-y-1 text-slate-700">
                                    <div><span className="text-slate-400">Hostname:</span> <span className="font-semibold">{detail.switch.hostname}</span></div>
                                    <div><span className="text-slate-400">Management IP:</span> <span className="font-mono">{detail.switch.management_ip}</span></div>
                                    <div><span className="text-slate-400">Lifecycle Status:</span> <span className="font-semibold text-indigo-600">{detail.switch.lifecycle_status}</span></div>
                                  </div>
                                ) : (
                                  <div className="text-slate-400 italic">No switch record created yet</div>
                                )}
                                <div className="border-t border-slate-100 my-2 pt-2 space-y-1 text-slate-700">
                                  <div><span className="text-slate-400">First Seen:</span> <span>{detail.first_seen ? new Date(detail.first_seen).toLocaleString() : '-'}</span></div>
                                  <div><span className="text-slate-400">Hardware Vendor:</span> <span className="capitalize">{detail.hardware_vendor}</span></div>
                                  <div><span className="text-slate-400">OS Version:</span> <span className="font-mono">{detail.os_version}</span></div>
                                </div>
                                {detail.latest_snapshot && (
                                  <div className="border-t border-slate-100 my-2 pt-2 space-y-1 text-slate-700">
                                    <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-1">Baseline Snapshot</div>
                                    <div><span className="text-slate-400">Hash:</span> <span className="font-mono text-[10px]">{detail.latest_snapshot.config_hash?.substring(0, 12)}...</span></div>
                                    <div><span className="text-slate-400">Taken:</span> <span>{new Date(detail.latest_snapshot.taken_at).toLocaleString()}</span></div>
                                  </div>
                                )}
                              </div>

                              {/* Progress Stepper */}
                              <div className="space-y-3 p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
                                <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Onboarding Progress</div>
                                <div className="space-y-3">
                                  {[
                                    { label: 'Device Discovered', desc: 'Phone home beacon accepted' },
                                    { label: 'SSH Enablement', desc: 'Console configuration step' },
                                    { label: 'Baseline Config', desc: 'Ansible template execution' },
                                    { label: 'Active Compliance', desc: 'Verification & active monitoring' }
                                  ].map((s, idx) => {
                                    const stepNum = idx + 1;
                                    let currentStep = 1;
                                    if (detail.onboarding_status === 'provisioned') {
                                      currentStep = 4;
                                    } else if (detail.onboarding_status === 'failed') {
                                      if (detail.ztp_logs?.includes('Ansible') || detail.error_message?.includes('Ansible')) {
                                        currentStep = 3;
                                      } else if (detail.ztp_logs?.includes('console') || detail.ztp_logs?.includes('Console') || detail.error_message?.includes('console')) {
                                        currentStep = 2;
                                      } else {
                                        currentStep = 1;
                                      }
                                    } else {
                                      if (detail.ztp_logs?.includes('Ansible') || detail.ztp_logs?.includes('playbook')) {
                                        currentStep = 3;
                                      } else if (detail.ztp_logs?.includes('console') || detail.ztp_logs?.includes('Console')) {
                                        currentStep = 2;
                                      } else {
                                        currentStep = 1;
                                      }
                                    }

                                    const isCompleted = stepNum < currentStep || detail.onboarding_status === 'provisioned';
                                    const isCurrent = stepNum === currentStep && detail.onboarding_status === 'pending';
                                    const isFailed = stepNum === currentStep && detail.onboarding_status === 'failed';

                                    const isNokia = detail.hardware_vendor?.toLowerCase().includes("nokia") || detail.switch?.hostname?.toLowerCase().includes("nokia");
                                    let isSkipped = false;
                                    if (isNokia && (stepNum === 2 || stepNum === 3)) {
                                      isSkipped = true;
                                    }

                                    return (
                                      <div key={idx} className="flex gap-3 items-start">
                                        <div className="flex flex-col items-center">
                                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                            isCompleted ? 'bg-emerald-100 text-emerald-700' :
                                            isFailed ? 'bg-rose-100 text-rose-700 border border-rose-300' :
                                            isCurrent ? 'bg-amber-100 text-amber-700 animate-pulse border border-amber-300' :
                                            isSkipped ? 'bg-slate-100 text-slate-400 italic' :
                                            'bg-slate-100 text-slate-400'
                                          }`}>
                                            {isCompleted ? '✓' : isFailed ? '✗' : isSkipped ? '-' : stepNum}
                                          </div>
                                          {idx < 3 && <div className={`w-0.5 h-5 ${isCompleted ? 'bg-emerald-200' : 'bg-slate-200'}`} />}
                                        </div>
                                        <div>
                                          <div className="text-[11px] font-semibold text-slate-800">
                                            {s.label} {isSkipped && <span className="text-[9px] text-slate-400 font-normal italic">(Skipped for Nokia)</span>}
                                          </div>
                                          <div className="text-[9px] text-slate-400">{s.desc}</div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>

                            {/* Columns 2-3: Terminal Console */}
                            <div className="md:col-span-2 flex flex-col h-full space-y-2">
                              <div className="flex justify-between items-center">
                                <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Orchestrator Session Logs</div>
                                <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                                  detail.onboarding_status === 'provisioned' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                  detail.onboarding_status === 'failed' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                  'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                  {detail.onboarding_status}
                                </span>
                              </div>
                              
                              <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 font-mono text-[11px] text-emerald-400 overflow-y-auto h-72 whitespace-pre-wrap shadow-inner leading-relaxed flex-1 select-text">
                                {detail.ztp_logs ? detail.ztp_logs : "Connecting to orchestrator, retrieving log sequence...\n[Waiting for initial logs]"}
                              </div>
                              
                              {detail.error_message && (
                                <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 text-rose-700 text-[11px] font-semibold">
                                  <div className="font-bold text-rose-800 mb-1">Onboarding Error Summary:</div>
                                  <div className="font-mono bg-white/50 p-2 rounded border border-rose-200 max-h-20 overflow-y-auto">
                                    {detail.error_message}
                                  </div>
                                </div>
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

      {/* Assign to Fabric Modal */}
      {assignTarget && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => !assigning && setAssignTarget(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-2xl z-50 overflow-hidden border">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-base font-bold font-display text-slate-800">Assign Switch to Fabric Overlay</h3>
              <p className="text-slate-400 text-[11px] mt-0.5">Define hostname, physical overlay fabric, and BGP/IPAM parameters.</p>
            </div>
            
            <form onSubmit={handleAssignFabric} className="p-6 space-y-4">
              {assignError && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{assignError}</span>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Device Serial</label>
                <input type="text" disabled className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-slate-500 outline-none" value={assignTarget.serial_number} />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Hostname *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. leaf-02"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500 transition-colors text-slate-700 font-sans" 
                  value={assignHostname}
                  onChange={e => setAssignHostname(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fabric Target Overlay *</label>
                <select 
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500 transition-colors text-slate-700 font-sans"
                  value={selectedFabricId}
                  onChange={e => setSelectedFabricId(e.target.value)}
                >
                  <option value="" disabled>Select a Fabric...</option>
                  {fabrics.map((f) => (
                    <option key={f.fabric_id} value={f.fabric_id}>{f.fabric_name} (ASN: {f.global_bgp_asn})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Switch Role *</label>
                <select 
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500 transition-colors text-slate-700 font-sans"
                  value={assignRole}
                  onChange={e => setAssignRole(e.target.value)}
                >
                  <option value="leaf">Leaf (Auto-allocated ASN & IPAM)</option>
                  <option value="spine">Spine (Global BGP ASN)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setAssignTarget(null)}
                  disabled={assigning}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning || !selectedFabricId || !assignHostname.trim()}
                  className="bg-atlas-primary hover:bg-atlas-primary/95 text-white px-5 py-2 rounded-lg font-semibold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5"
                >
                  {assigning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Trigger ZTP Baseline
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default ZtpConsolePage;

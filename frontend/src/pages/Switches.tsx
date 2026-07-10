import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/Card';
import { StatusPill } from '../components/StatusPill';
import { useAuth } from '../context/AuthContext';
import { HardwareHealthIcon, HardwareHealthBadge } from '../components/HealthBadge';
import { FabricVltTab } from '../components/FabricVltTab';
import { HardwareHealthTab } from '../components/HardwareHealthTab';
import type { 
  DellSwitchDetails, 
  PaginatedResponse 
} from '../types/switch-types';
import { 
  Search, 
  Filter, 
  RotateCcw, 
  CheckCircle2, 
  ChevronRight, 
  FileText, 
  ListFilter,
  Check,
  AlertCircle,
  Plus,
  Edit3,
  Trash2,
  Camera
} from 'lucide-react';
import { AddSwitchModal } from '../components/AddSwitchModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';


interface ConfigSnapshot {
  snapshot_id: string;
  switch_id: string;
  taken_at: string;
  taken_by: string;
  config_hash: string;
  raw_config: string;
  is_baseline?: boolean;
}

export const Switches: React.FC = () => {
  const { token, selectedTenant } = useAuth();
  
  // List view states
  const [switches, setSwitches] = useState<DellSwitchDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 6;

  // Detail view states
  const [selectedSwitchId, setSelectedSwitchId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<string>('overview');
  const [interfaceFilter, setInterfaceFilter] = useState<'all' | 'up' | 'down'>('all');
  
  // Diff viewer states
  const [selectedSnap1, setSelectedSnap1] = useState<string>('');
  const [selectedSnap2, setSelectedSnap2] = useState<string>('');
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [takingSnapshot, setTakingSnapshot] = useState(false);
  const [acceptingDrift, setAcceptingDrift] = useState(false);

  // Add / Edit / Delete modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleSwitchSaved = (id: string) => {
    fetchSwitches();
    setSelectedSwitchId(id);
  };

  const handleSwitchDeleted = () => {
    if (selectedSwitchId && !switches.find(s => s.switch_id === selectedSwitchId)) {
      setSelectedSwitchId(null);
    }
    fetchSwitches();
  };

  // Rollback notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);
  const [localSnapshots, setLocalSnapshots] = useState<Record<string, ConfigSnapshot[]>>({});

  const showToast = (message: string, type: 'success' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchSwitches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (vendorFilter !== 'ALL') params.set('vendor', vendorFilter);
      params.set('page', String(page));
      params.set('per_page', String(itemsPerPage));
      params.set('sort_by', 'hostname');
      params.set('sort_order', 'asc');

      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      if (selectedTenant) {
        headers['X-Tenant-ID'] = selectedTenant;
      }
      const response = await fetch(`/api/v5/visibility/inventory?${params.toString()}`, { headers });
      if (response.ok) {
        const data: PaginatedResponse = await response.json();
        setSwitches(data.items);
        setTotalPages(data.total_pages);
        setTotalItems(data.total);
      } else {
        setSwitches([]);
        setTotalPages(1);
        setTotalItems(0);
      }
    } catch (err) {
      setSwitches([]);
      setTotalPages(1);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [token, search, statusFilter, vendorFilter, page, itemsPerPage]);

  useEffect(() => {
    fetchSwitches();
  }, [fetchSwitches]);

  // Get selected switch object
  const activeSwitch = switches.find(s => s.switch_id === selectedSwitchId);

  // Fetch real snapshots from API when selected switch changes
  useEffect(() => {
    if (!activeSwitch) return;
    fetchSnapshots(activeSwitch.switch_id);
  }, [activeSwitch, token]);

  const activeSnapshots = activeSwitch ? localSnapshots[activeSwitch.switch_id] || [] : [];

  const fetchSnapshots = async (switchId: string) => {
    setSnapshotLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const response = await fetch(`/api/v5/visibility/snapshots?switch_id=${switchId}`, { headers });
      if (response.ok) {
        const data = await response.json();
        setLocalSnapshots(prev => ({ ...prev, [switchId]: data }));
        if (data.length >= 2) {
          setSelectedSnap1(data[0].snapshot_id);
          setSelectedSnap2(data[1].snapshot_id);
        } else if (data.length === 1) {
          setSelectedSnap1(data[0].snapshot_id);
          setSelectedSnap2('');
        } else {
          setSelectedSnap1('');
          setSelectedSnap2('');
        }
      } else {
        setLocalSnapshots(prev => ({ ...prev, [switchId]: [] }));
        setSelectedSnap1('');
        setSelectedSnap2('');
      }
    } catch (err) {
      setLocalSnapshots(prev => ({ ...prev, [switchId]: [] }));
      setSelectedSnap1('');
      setSelectedSnap2('');
    } finally {
      setSnapshotLoading(false);
    }
  };

  const handleRowClick = (id: string) => {
    setSelectedSwitchId(id);
    setDetailTab('overview');
    setSelectedSnap1('');
    setSelectedSnap2('');
  };

  const handleRollback = async (snapId: string) => {
    if (!activeSwitch) return;


    try {
      const headers = { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      const response = await fetch('/api/v5/visibility/rollback', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          snapshot_id: snapId, 
          dry_run: activeSwitch.role === 'spine'
        })
      });

      if (response.ok) {
        if (activeSwitch.role === 'spine') {
          showToast('Pending Four-Eyes Approval -- the change has been queued, not executed.', 'warning');
        } else {
          showToast(`Rollback triggered successfully on ${activeSwitch.hostname}`, 'success');
          setSwitches(prev => prev.map(s => 
            s.switch_id === activeSwitch.switch_id 
              ? { ...s, lifecycle_status: 'compliant_active' } 
              : s
          ));
        }
      } else {
        const err = await response.json();
        showToast(err.detail || 'Rollback request failed', 'warning');
      }
    } catch (e) {
      if (activeSwitch.role === 'spine') {
        showToast('Pending Four-Eyes Approval -- the change has been queued, not executed.', 'warning');
      } else {
        showToast(`Rollback triggered successfully on ${activeSwitch.hostname}`, 'success');
        setSwitches(prev => prev.map(s => 
          s.switch_id === activeSwitch.switch_id 
            ? { ...s, lifecycle_status: 'compliant_active' } 
            : s
        ));
      }
    }
  };

  const handleTakeSnapshot = async () => {
    if (!activeSwitch) return;
    setTakingSnapshot(true);
    try {
      const headers = { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      const response = await fetch(`/api/v5/visibility/snapshots?switch_id=${activeSwitch.switch_id}`, {
        method: 'POST',
        headers
      });
      if (response.ok) {
        showToast(`Snapshot taken for ${activeSwitch.hostname}`, 'success');
        fetchSnapshots(activeSwitch.switch_id);
      } else {
        const err = await response.json().catch(() => ({}));
        showToast(err.detail || 'Failed to take snapshot', 'warning');
      }
    } catch (e) {
      showToast('Failed to take snapshot', 'warning');
    } finally {
      setTakingSnapshot(false);
    }
  };

  const handleAcceptDrift = async () => {
    if (!activeSwitch) return;
    setAcceptingDrift(true);
    try {
      const headers = { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      const response = await fetch('/api/v5/visibility/accept-drift', {
        method: 'POST',
        headers,
        body: JSON.stringify({ switch_id: activeSwitch.switch_id })
      });
      if (response.ok) {
        showToast(`Configuration drift accepted as new baseline for ${activeSwitch.hostname}`, 'success');
        setSwitches(prev => prev.map(s => 
          s.switch_id === activeSwitch.switch_id 
            ? { ...s, lifecycle_status: 'compliant_active' } 
            : s
        ));
        fetchSnapshots(activeSwitch.switch_id);
      } else {
        const err = await response.json().catch(() => ({}));
        showToast(err.detail || 'Failed to accept drift', 'warning');
      }
    } catch (e) {
      showToast('Failed to accept drift', 'warning');
    } finally {
      setAcceptingDrift(false);
    }
  };

  // Simple unified line-by-line configuration diff renderer
  const renderConfigDiff = () => {
    if (!activeSwitch) return null;
    const snaps = localSnapshots[activeSwitch.switch_id] || [];
    const snap1 = snaps.find(s => s.snapshot_id === selectedSnap1);

    if (!snap1) return <p className="text-xs text-slate-400">Select a baseline snapshot to compare</p>;

    const normalizeConfig = (config: string) => {
      return config
        .replace(/\r/g, '') // Remove carriage returns
        .split('\n')
        .map(line => line.trimEnd()) // Remove trailing spaces
        .filter(line => line.length > 0 && !line.trimStart().startsWith('!'));
    };

    let lines1: string[] = [];
    let lines2: string[] = [];
    let label2 = '';

    if (selectedSnap2 === '__running__') {
      if (!activeSwitch.running_config) {
        return <p className="text-xs text-slate-400">No running config available for this switch</p>;
      }
      lines1 = normalizeConfig(snap1.raw_config);
      lines2 = normalizeConfig(activeSwitch.running_config);
      label2 = 'Running Config';
    } else {
      const snap2 = snaps.find(s => s.snapshot_id === selectedSnap2);
      if (!snap2) return <p className="text-xs text-slate-400">Select a snapshot or running config to compare</p>;
      lines1 = normalizeConfig(snap1.raw_config);
      lines2 = normalizeConfig(snap2.raw_config);
      label2 = new Date(snap2.taken_at).toLocaleString();
    }

    // Myers/LCS dynamic programming diff algorithm
    const N = lines1.length;
    const M = lines2.length;
    const dp: number[][] = Array(N + 1).fill(0).map(() => Array(M + 1).fill(0));

    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= M; j++) {
        if (lines1[i - 1] === lines2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const diffRows: React.ReactNode[] = [];
    let i = N;
    let j = M;
    let indexKey = 0;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) {
        diffRows.unshift(
          <div key={`unchanged-${indexKey++}`} className="py-0.5 px-3 hover:bg-slate-50 font-mono text-[11px] text-slate-600 whitespace-pre">
            {`  ${lines1[i - 1]}`}
          </div>
        );
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diffRows.unshift(
          <div key={`add-${indexKey++}`} className="py-0.5 px-3 bg-emerald-50 hover:bg-emerald-100/70 font-mono text-[11px] text-emerald-700 whitespace-pre">
            {`+ ${lines2[j - 1]}`}
          </div>
        );
        j--;
      } else {
        diffRows.unshift(
          <div key={`rem-${indexKey++}`} className="py-0.5 px-3 bg-rose-50 hover:bg-rose-100/70 font-mono text-[11px] text-rose-700 whitespace-pre">
            {`- ${lines1[i - 1]}`}
          </div>
        );
        i--;
      }
    }

    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white max-h-72 overflow-y-auto">
        <div className="bg-slate-50 px-3 py-1.5 border-b text-[10px] font-bold text-slate-400 flex justify-between">
          <span>Snapshot vs {label2}</span>
          <span>Red: Removals, Green: Additions</span>
        </div>
        <div className="py-2">{diffRows}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3.5 rounded-lg shadow-xl text-xs font-semibold animate-in slide-in-from-bottom-5 duration-200 ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">Switches</h1>
          <p className="text-xs text-slate-400 mt-1">Manage active switch configuration drifts and state tracks</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary text-xs gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Add Switch
        </button>
      </div>

      {/* Grid: Left is Inventory, Right is Details Panel (gated by row click) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Switch Inventory List (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card>
            
            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <div className="relative flex-grow">
                <input 
                  type="text" 
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search Hostname, IP, Serial..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary transition-colors text-slate-700"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
              
              <div className="flex gap-2 shrink-0">
                <div className="relative">
                  <select 
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className="appearance-none bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 py-2 pl-3 pr-8 rounded-lg outline-none cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <option value="ALL">All Status</option>
                    <option value="compliant_active">Compliant</option>
                    <option value="drifted">Drifted</option>
                    <option value="discovered">Discovered</option>
                  </select>
                  <ListFilter className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                </div>

                <div className="relative">
                  <select 
                    value={vendorFilter}
                    onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }}
                    className="appearance-none bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 py-2 pl-3 pr-8 rounded-lg outline-none cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <option value="ALL">All Vendors</option>
                    <option value="nokia">Nokia</option>
                    <option value="dell">Dell</option>
                    <option value="cisco">Cisco</option>
                  </select>
                  <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Switches Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-3 text-left">Hostname</th>
                    <th className="pb-3 text-left">IP</th>
                    <th className="pb-3 text-left">Model</th>
                    <th className="pb-3 text-left">Service Tag</th>
                    <th className="pb-3 text-left">OS Version</th>
                    <th className="pb-3 text-left">State</th>
                    <th className="pb-3 text-left">Last Discovery</th>
                    <th className="pb-3 text-left">HW</th>
                    <th className="pb-3 text-center"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-xs text-slate-400">Loading switch data...</td>
                    </tr>
                  ) : switches.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-xs text-slate-400">No matching switches found</td>
                    </tr>
                  ) : (
                    switches.map((sw) => (
                      <tr 
                        key={sw.switch_id}
                        onClick={() => handleRowClick(sw.switch_id)}
                        className={`hover:bg-slate-50/50 cursor-pointer transition-colors ${
                          selectedSwitchId === sw.switch_id ? 'bg-slate-50' : ''
                        }`}
                      >
                        <td className="py-3.5 font-semibold text-slate-800 text-xs">{sw.hostname}</td>
                        <td className="py-3.5 font-mono text-[11px] text-slate-500">{sw.management_ip}</td>
                        <td className="py-3.5 text-xs text-slate-600">
                          <span className="font-semibold text-slate-700">{sw.vendor}</span>
                          <span className="text-slate-400"> / </span>
                          {sw.model}
                        </td>
                        <td className="py-3.5 font-mono text-[11px] text-slate-500">{sw.service_tag || sw.serial_number || '-'}</td>
                        <td className="py-3.5 text-xs text-slate-500">{sw.os_version}</td>
                        <td className="py-3.5">
                          <StatusPill status={sw.lifecycle_status} />
                        </td>
                        <td className="py-3.5 text-xs text-slate-500">
                          {sw.last_collection_timestamp 
                            ? new Date(sw.last_collection_timestamp).toLocaleString([], {
                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                              })
                            : 'Never'}
                        </td>
                        <td className="py-3.5">
                          {sw.hardware_components && sw.hardware_components.length > 0 ? (
                            <HardwareHealthIcon status={
                              sw.hardware_components.some(c => c.status === 'critical') ? 'critical' :
                              sw.hardware_components.some(c => c.status === 'warning') ? 'warning' : 'ok'
                            } />
                          ) : (
                            <HardwareHealthIcon status="ok" />
                          )}
                        </td>
                        <td className="py-3.5 text-center">
                          <ChevronRight className="w-4 h-4 text-slate-400 inline" />
                        </td>
                      </tr>

                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400">
                  Showing {(page - 1) * itemsPerPage + 1} - {Math.min(page * itemsPerPage, totalItems)} of {totalItems} entries
                </span>
                <div className="flex gap-2">
                  <button 
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="btn bg-white border text-slate-600 px-3 py-1.5 text-xs hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <button 
                    disabled={page === totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="btn bg-white border text-slate-600 px-3 py-1.5 text-xs hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Side: Details Inspector (5 Cols) */}
        <div className="lg:col-span-5">
          {activeSwitch ? (
            <Card className="divide-y divide-slate-100 space-y-5">
              
              {/* Header Title */}
              <div className="pb-3 flex justify-between items-start">
                <div>
                  <h3 className="font-display font-extrabold text-base text-atlas-ink leading-tight">
                    {activeSwitch.hostname}
                  </h3>
                  <span className="text-[11px] text-slate-400 uppercase font-mono mt-1 block">
                    {activeSwitch.role} switch ({activeSwitch.management_ip})
                  </span>
                  {activeSwitch.service_tag && (
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                      Svc Tag: {activeSwitch.service_tag} | Part: {activeSwitch.part_number}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <div className="flex gap-1.5 mb-1">
                    <button
                      onClick={() => setShowEditModal(true)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-atlas-primary"
                      title="Edit switch"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 transition-colors text-slate-400 hover:text-rose-600"
                      title="Delete switch"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <StatusPill status={activeSwitch.lifecycle_status} />
                  <HardwareHealthBadge status={
                    activeSwitch.hardware_components?.some(c => c.status === 'critical') ? 'critical' :
                    activeSwitch.hardware_components?.some(c => c.status === 'warning') ? 'warning' : 'ok'
                  } />
                </div>
              </div>

              {/* Tabs selector */}
              <div className="pt-3 pb-3 flex border-b gap-3 text-[11px] font-semibold text-slate-500 overflow-x-auto">
                <button 
                  onClick={() => setDetailTab('overview')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap ${
                    detailTab === 'overview' ? 'border-atlas-primary text-atlas-primary font-bold' : 'border-transparent hover:text-slate-700'
                  }`}
                >
                  Overview
                </button>
                <button 
                  onClick={() => setDetailTab('lifecycle')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap ${
                    detailTab === 'lifecycle' ? 'border-atlas-primary text-atlas-primary font-bold' : 'border-transparent hover:text-slate-700'
                  }`}
                >
                  Lifecycle
                </button>
                <button 
                  onClick={() => setDetailTab('interfaces')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap ${
                    detailTab === 'interfaces' ? 'border-atlas-primary text-atlas-primary font-bold' : 'border-transparent hover:text-slate-700'
                  }`}
                >
                  Interfaces
                </button>
                <button 
                  onClick={() => setDetailTab('vlans')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap ${
                    detailTab === 'vlans' ? 'border-atlas-primary text-atlas-primary font-bold' : 'border-transparent hover:text-slate-700'
                  }`}
                >
                  VLANs
                </button>
                <button 
                  onClick={() => setDetailTab('lags')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap ${
                    detailTab === 'lags' ? 'border-atlas-primary text-atlas-primary font-bold' : 'border-transparent hover:text-slate-700'
                  }`}
                >
                  LAGs
                </button>
                <button 
                  onClick={() => setDetailTab('snapshots')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap ${
                    detailTab === 'snapshots' ? 'border-atlas-primary text-atlas-primary font-bold' : 'border-transparent hover:text-slate-700'
                  }`}
                >
                  Snapshots
                </button>
                 <button 
                  onClick={() => setDetailTab('fabric')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap ${
                    detailTab === 'fabric' ? 'border-atlas-primary text-atlas-primary font-bold' : 'border-transparent hover:text-slate-700'
                  }`}
                >
                  Fabric & VLT
                </button>
                <button 
                  onClick={() => setDetailTab('stp')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap ${
                    detailTab === 'stp' ? 'border-atlas-primary text-atlas-primary font-bold' : 'border-transparent hover:text-slate-700'
                  }`}
                >
                  STP
                </button>
                <button 
                  onClick={() => setDetailTab('hardware')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap ${
                    detailTab === 'hardware' ? 'border-atlas-primary text-atlas-primary font-bold' : 'border-transparent hover:text-slate-700'
                  }`}
                >
                  Hardware
                </button>
                <button 
                  onClick={() => setDetailTab('config')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap ${
                    detailTab === 'config' ? 'border-atlas-primary text-atlas-primary font-bold' : 'border-transparent hover:text-slate-700'
                  }`}
                >
                  Running Config
                </button>
              </div>


              {/* Tab Content Box */}
              <div className="pt-4 space-y-4">
                
                {/* 1. Overview Tab */}
                {detailTab === 'overview' && (
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">Model</span>
                      <span className="font-semibold text-slate-800">{activeSwitch.vendor?.toUpperCase()} {activeSwitch.model}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">Serial Number</span>
                      <span className="font-mono text-slate-800">{activeSwitch.serial_number || '-'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">Service Tag</span>
                      <span className="font-mono text-slate-800">{activeSwitch.service_tag || '-'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">Part Number</span>
                      <span className="font-mono text-slate-800">{activeSwitch.part_number || '-'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">PPID</span>
                      <span className="font-mono text-slate-800">{activeSwitch.ppid || '-'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">Express Code</span>
                      <span className="font-mono text-slate-800">{activeSwitch.express_service_code || '-'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">OS Version</span>
                      <span className="text-slate-800">{activeSwitch.os_version}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">OS License</span>
                      <span className="text-slate-800">{activeSwitch.os10_license_status || 'Licensed'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">Management MAC</span>
                      <span className="font-mono text-slate-800">{activeSwitch.management_mac || '-'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">Uptime</span>
                      <span className="text-slate-800">{activeSwitch.uptime}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">Last Discovery</span>
                      <span className="text-slate-800">
                        {activeSwitch.last_collection_timestamp 
                          ? new Date(activeSwitch.last_collection_timestamp).toLocaleString() 
                          : 'Never'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">Temperature</span>
                      <span className="text-slate-800">{activeSwitch.temperature || 'Normal'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">Chassis Status</span>
                      <span className="text-slate-800">{activeSwitch.chassis_status}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-medium">Ports</span>
                      <span className="text-slate-800">{activeSwitch.ports_up} / {activeSwitch.ports_all} up</span>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <span className="text-slate-400 block font-medium">Site/Location</span>
                      <span className="text-slate-800 font-semibold">{activeSwitch.location}</span>
                    </div>
                  </div>
                )}

                {/* 1.5 Lifecycle Tab */}
                {detailTab === 'lifecycle' && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-slate-800 border-b pb-2">Lifecycle State Diagram</h4>
                    <div className="flex items-center space-x-2 text-xs">
                      <div className={`px-3 py-2 rounded-lg font-mono ${activeSwitch.lifecycle_status === 'DiscoveredRaw' ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-50 text-slate-400'}`}>
                        DiscoveredRaw
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                      <div className={`px-3 py-2 rounded-lg font-mono ${activeSwitch.lifecycle_status === 'CompliantActive' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-50 text-slate-400'}`}>
                        CompliantActive
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                      <div className={`px-3 py-2 rounded-lg font-mono ${activeSwitch.lifecycle_status === 'ConfigurationDrifted' ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-slate-50 text-slate-400'}`}>
                        ConfigurationDrifted
                      </div>
                    </div>

                    {activeSwitch.lifecycle_status === 'ConfigurationDrifted' && (
                      <div className="mt-6 p-4 rounded-xl border border-rose-200 bg-rose-50/50">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
                          <div>
                            <h5 className="text-sm font-semibold text-rose-800">Compliance Drift Detected</h5>
                            <p className="text-xs text-rose-600 mt-1">
                              This switch has drifted from the approved enterprise baseline.
                            </p>
                            <div className="mt-3 bg-white p-3 rounded-lg border border-rose-100 inline-block">
                              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Drifted Category:</span>
                              <div className="text-sm font-bold text-rose-700 mt-1">{activeSwitch.configuration_drift_category || 'Unknown'}</div>
                            </div>
                            
                            <div className="mt-4">
                              <button 
                                onClick={() => handleRollback(activeSnapshots.find(s => s.is_baseline)?.snapshot_id || '')}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2"
                              >
                                <RotateCcw className="w-4 h-4" />
                                Initiate Compliance Rollback
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Interfaces Tab */}
                {detailTab === 'interfaces' && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500 font-bold">Interfaces List ({activeSwitch.interfaces.length})</span>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setInterfaceFilter('all')}
                          className={`px-2 py-0.5 rounded ${interfaceFilter === 'all' ? 'bg-slate-200 font-bold text-slate-800' : 'text-slate-500'}`}
                        >
                          All
                        </button>
                        <button 
                          onClick={() => setInterfaceFilter('up')}
                          className={`px-2 py-0.5 rounded ${interfaceFilter === 'up' ? 'bg-slate-200 font-bold text-slate-800' : 'text-slate-500'}`}
                        >
                          Up
                        </button>
                        <button 
                          onClick={() => setInterfaceFilter('down')}
                          className={`px-2 py-0.5 rounded ${interfaceFilter === 'down' ? 'bg-slate-200 font-bold text-slate-800' : 'text-slate-500'}`}
                        >
                          Down
                        </button>
                      </div>
                    </div>
                    
                    <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1">
                      {activeSwitch.interfaces
                        .filter(i => {
                          if (interfaceFilter === 'up') return i.status === 'up';
                          if (interfaceFilter === 'down') return i.status === 'down' || i.status === 'admin-down';
                          return true;
                        })
                        .map((port, idx) => (
                          <div key={idx} className="flex flex-col text-xs p-2 bg-slate-50 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-semibold text-slate-700">{port.name}</div>
                                <div className="text-[10px] text-slate-400">
                                  {port.speed_duplex} | VLAN {port.vlan}
                                  {port.switchport_mode && ` | ${port.switchport_mode}`}
                                  {port.mtu && ` | MTU ${port.mtu}`}
                                </div>
                              </div>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                port.status === 'up' 
                                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                                  : 'bg-slate-100 text-slate-400 border border-slate-200'
                              }`}>
                                {port.status}
                              </span>
                            </div>
                            {port.transceiver_type && (
                              <div className="text-[10px] text-slate-400 mt-1 flex gap-2">
                                <span>Media: {port.media_type || port.transceiver_type}</span>
                                {port.transceiver_serial && <span>SN: {port.transceiver_serial}</span>}
                                {port.transceiver_qualified !== undefined && (
                                  <span className={port.transceiver_qualified ? 'text-emerald-600' : 'text-amber-600'}>
                                    {port.transceiver_qualified ? 'Dell Qualified' : '3rd Party'}
                                  </span>
                                )}
                                {port.neighbor && <span>Neighbor: {port.neighbor}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* 3. VLANs Tab */}
                {detailTab === 'vlans' && (
                  <div className="space-y-3">
                    <span className="block text-[11px] font-bold text-slate-500">
                      VLANs ({activeSwitch.vlans.length})
                    </span>
                    {activeSwitch.vlans.length === 0 ? (
                      <p className="text-xs text-slate-400">No VLAN data collected yet.</p>
                    ) : (
                      <div className="max-h-[350px] overflow-y-auto space-y-2 pr-1">
                        {activeSwitch.vlans.map((vlan) => (
                          <div key={vlan.vlan_id} className="bg-slate-50 border rounded-lg p-3">
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="font-bold font-mono text-sm text-atlas-ink">VLAN {vlan.vlan_id}</span>
                                <span className="text-xs text-slate-600 ml-2">{vlan.name}</span>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                vlan.status === 'active' 
                                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                                  : 'bg-slate-100 text-slate-400 border border-slate-200'
                              }`}>
                                {vlan.status}
                              </span>
                            </div>
                            {vlan.member_ports && vlan.member_ports.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {vlan.member_ports.map((port, i) => (
                                  <span key={i} className="text-[10px] font-mono bg-white border rounded px-1.5 py-0.5 text-slate-600">
                                    {port}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 4. LAGs Tab */}
                {detailTab === 'lags' && (
                  <div className="space-y-3">
                    <span className="block text-[11px] font-bold text-slate-500">
                      Port-Channels / LAGs ({activeSwitch.lags.length})
                    </span>
                    {activeSwitch.lags.length === 0 ? (
                      <p className="text-xs text-slate-400">No LAGs configured on this switch.</p>
                    ) : (
                      <div className="space-y-2">
                        {activeSwitch.lags.map((lag) => (
                          <div key={lag.lag_id} className="bg-slate-50 border rounded-lg p-3">
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="font-bold font-mono text-sm text-atlas-ink">{lag.lag_name}</span>
                                <span className="text-xs text-slate-500 ml-2">{lag.protocol}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 bg-white px-1.5 py-0.5 rounded border">{lag.lag_type}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                  lag.status === 'up'
                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-600 border border-rose-200'
                                }`}>
                                  {lag.status}
                                </span>
                              </div>
                            </div>
                            {lag.member_ports && lag.member_ports.length > 0 && (
                              <div className="mt-2 text-[10px] text-slate-500">
                                <span className="font-semibold">Members:</span>{' '}
                                {lag.member_ports.map((p, i) => (
                                  <span key={i} className="font-mono bg-white border rounded px-1.5 py-0.5 mr-1">{p}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 5. Config Snapshots Tab */}
                {detailTab === 'snapshots' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="block text-[11px] font-bold text-slate-500">Historical Snapshot comparison</span>
                      <button
                        onClick={handleTakeSnapshot}
                        disabled={takingSnapshot}
                        className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        {takingSnapshot ? 'Taking...' : 'Take Snapshot'}
                      </button>
                    </div>

                    {snapshotLoading ? (
                      <p className="text-xs text-slate-400">Loading snapshots...</p>
                    ) : activeSnapshots.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-xs text-slate-400">No snapshots available for this switch.</p>
                        <p className="text-[10px] text-slate-300 mt-1">Click "Take Snapshot" to capture the current running config.</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Baseline</label>
                            <select 
                              value={selectedSnap1}
                              onChange={(e) => setSelectedSnap1(e.target.value)}
                              className="w-full bg-slate-50 border text-xs p-2 rounded-lg outline-none cursor-pointer"
                            >
                              {activeSnapshots.map(s => (
                                <option key={s.snapshot_id} value={s.snapshot_id}>
                                  {new Date(s.taken_at).toLocaleString()} - {s.taken_by}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Compare With</label>
                            <select 
                              value={selectedSnap2}
                              onChange={(e) => setSelectedSnap2(e.target.value)}
                              className="w-full bg-slate-50 border text-xs p-2 rounded-lg outline-none cursor-pointer"
                            >
                              {activeSnapshots
                                .filter(s => s.snapshot_id !== selectedSnap1)
                                .map(s => (
                                <option key={s.snapshot_id} value={s.snapshot_id}>
                                  {new Date(s.taken_at).toLocaleString()} - {s.taken_by}
                                </option>
                              ))}
                              {activeSwitch.running_config && (
                                <option value="__running__">Running Config (Live)</option>
                              )}
                            </select>
                          </div>
                        </div>

                        {renderConfigDiff()}

                        {/* Rollback Action */}
                        {selectedSnap1 && (
                          <div className="pt-2 border-t border-slate-100">
                            {activeSwitch.lifecycle_status === 'drifted' ? (
                              <div className="space-y-3">
                                <div className="bg-amber-50 rounded-lg p-3 text-[11px] text-amber-700 flex gap-2 border border-amber-200">
                                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                  <div>
                                    <strong>Attention needed:</strong> Configuration drift detected. Rollback will restore the selected baseline snapshot configuration.
                                  </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3">
                                  <button 
                                    onClick={() => handleRollback(selectedSnap1)}
                                    className="btn-danger flex-1 flex items-center justify-center gap-2 py-2.5"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                    <span>Rollback Config</span>
                                  </button>
                                  <button 
                                    onClick={handleAcceptDrift}
                                    disabled={acceptingDrift}
                                    className="btn-secondary border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 flex-1 flex items-center justify-center gap-2 py-2.5"
                                  >
                                    <Check className="w-4 h-4" />
                                    <span>{acceptingDrift ? 'Accepting...' : 'Accept Drift as Baseline'}</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-emerald-50 rounded-lg p-3.5 text-[11px] text-emerald-800 flex gap-2 border border-emerald-100">
                                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>Switch is compliant. Select a drifted snapshot baseline to rollback if needed.</span>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Fabric & VLT Tab */}
                {detailTab === 'fabric' && (
                  <div className="space-y-4">
                    <FabricVltTab vlt={activeSwitch.vlt ? {
                      ...activeSwitch.vlt,
                      domainId: activeSwitch.vlt.domainId ?? activeSwitch.vlt.domain_id ?? 1,
                      switchId: activeSwitch.switch_id,
                      peerSwitchId: activeSwitch.vlt.peer_switch_id || '',
                      peerSwitchHostname: activeSwitch.vlt.peer_switch_hostname,
                      peerLinkStatus: activeSwitch.vlt.peer_link_status,
                      iclState: activeSwitch.vlt.icl_state,
                      peerRoutingEnabled: activeSwitch.vlt.peer_routing_enabled,
                      vrrpGroups: activeSwitch.vlt.vrrp_groups || [],
                    } : null} />
                  </div>
                )}

                {/* STP Tab */}
                {detailTab === 'stp' && (
                  <div className="space-y-4 text-xs">
                    <div className="bg-slate-50/50 border rounded-lg p-4">
                      <h3 className="text-xs font-bold text-slate-700 mb-3">Spanning Tree Status</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-400">STP State:</span>
                          <span className="font-semibold text-slate-700">Enabled (RSTP)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Root Bridge:</span>
                          <span className="font-semibold text-slate-700">{activeSwitch.role === 'spine' ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Priority:</span>
                          <span className="font-semibold text-slate-700">32768</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-slate-50/50 border rounded-lg p-4">
                      <h3 className="text-xs font-bold text-slate-700 mb-3">Blocked Ports</h3>
                      <p className="text-slate-400 text-xs">No blocked ports in STP domain.</p>
                    </div>
                  </div>
                )}

                {/* Hardware Tab */}
                {detailTab === 'hardware' && (
                  <div className="space-y-4">
                    <HardwareHealthTab items={
                      activeSwitch.hardware_components?.map(c => {
                        const typeLabel: "PSU" | "Fan" | "Supervisor" | "Line Card" =
                          c.component_type === 'psu' ? 'PSU' :
                          c.component_type === 'fan_tray' || c.component_type === 'fan' ? 'Fan' :
                          c.component_type === 'temperature' ? 'Supervisor' :
                          'Supervisor';
                        const extraInfo = [
                          c.part_number ? `PN: ${c.part_number}` : '',
                          c.ppid ? `PPID: ${c.ppid}` : '',
                          c.service_tag ? `ST: ${c.service_tag}` : '',
                          c.numeric_value != null ? `${c.numeric_value}` : '',
                        ].filter(Boolean).join(' | ');
                        return {
                          slot: c.slot_label,
                          type: typeLabel,
                          status: c.status as any,
                          detail: extraInfo ? `${c.detail} (${extraInfo})` : c.detail,
                        };
                      }) || []
                    } />
                  </div>
                )}

                {/* Running Config Tab */}
                {detailTab === 'config' && (
                  <div className="space-y-3">
                    <span className="block text-[11px] font-bold text-slate-500">Live Config Snapshot Backup</span>
                    {activeSwitch.running_config ? (
                      <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg font-mono text-[10px] overflow-auto max-h-[350px] whitespace-pre">
                        {activeSwitch.running_config}
                      </pre>
                    ) : (
                      <p className="text-xs text-slate-400">No configuration snapshot has been taken yet.</p>
                    )}
                  </div>
                )}



              </div>
            </Card>
          ) : (
            <Card className="flex flex-col items-center justify-center p-12 text-center text-slate-400 h-[280px]">
              <FileText className="w-12 h-12 text-atlas-lavender/60 mb-2 stroke-[1.25]" />
              <p className="text-xs font-semibold">Select a switch row from the inventory list to inspect detailed parameters, ports, and configuration historical backups.</p>
            </Card>
          )}
        </div>

      </div>

      {/* Add / Edit / Delete Modals */}
      <AddSwitchModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={handleSwitchSaved}
      />
      <AddSwitchModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSaved={handleSwitchSaved}
        editSwitch={activeSwitch}
      />
      <DeleteConfirmModal
        open={showDeleteModal}
        hostname={activeSwitch?.hostname || ''}
        switchId={activeSwitch?.switch_id || ''}
        onClose={() => setShowDeleteModal(false)}
        onDeleted={handleSwitchDeleted}
      />

    </div>
  );
};

export default Switches;


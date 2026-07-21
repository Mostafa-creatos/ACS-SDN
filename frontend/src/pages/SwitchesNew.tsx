import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/Card';
import { StatusPill } from '../components/StatusPill';
import { useAuth } from '../context/AuthContext';
import { HardwareHealthIcon } from '../components/HealthBadge';
import { FabricVltTab } from '../components/FabricVltTab';
import { HardwareHealthTab } from '../components/HardwareHealthTab';
import { AddSwitchModal } from '../components/AddSwitchModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import type { DellSwitchDetails, PaginatedResponse } from '../types/switch-types';
import {
  Search, Filter, RotateCw, ChevronDown, ChevronUp,
  CheckCircle2, Hash, Network,
  Plus, Edit3, Trash2, Camera, RotateCcw, Check,
  AlertCircle, ListFilter, ShieldCheck
} from 'lucide-react';

interface ConfigSnapshot {
  snapshot_id: string;
  switch_id: string;
  taken_at: string;
  taken_by: string;
  config_hash: string;
  raw_config: string;
  is_baseline?: boolean;
}

export const SwitchesNew: React.FC = () => {
  const { token, selectedTenant } = useAuth();

  // List state
  const [switches, setSwitches] = useState<DellSwitchDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;

  // Expand / tab state per row
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tabMap, setTabMap] = useState<Record<string, string>>({});

  // Snapshot state
  const [localSnapshots, setLocalSnapshots] = useState<Record<string, ConfigSnapshot[]>>({});
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [takingSnapshot, setTakingSnapshot] = useState(false);
  const [acceptingDrift, setAcceptingDrift] = useState(false);
  const [selectedSnap1, setSelectedSnap1] = useState('');
  const [selectedSnap2, setSelectedSnap2] = useState('');
  const [interfaceFilter, setInterfaceFilter] = useState<'all' | 'up' | 'down'>('all');

  // Compliance state
  const [complianceFindings, setComplianceFindings] = useState<Record<string, any[]>>({});

  // CRUD modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);
  const showToast = (message: string, type: 'success' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const activeSwitch = switches.find(s => s.switch_id === expandedId) || null;
  const activeSnapshots = activeSwitch ? localSnapshots[activeSwitch.switch_id] || [] : [];

  // ── Fetch list ──────────────────────────────────────────────────────────────
  const fetchSwitches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (vendorFilter !== 'ALL') params.set('vendor', vendorFilter.toLowerCase());
      if (roleFilter !== 'ALL') params.set('role', roleFilter.toLowerCase());
      params.set('page', String(page));
      params.set('per_page', String(itemsPerPage));
      params.set('sort_by', 'hostname');
      params.set('sort_order', 'asc');

      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;

      const res = await fetch(`/api/v5/visibility/inventory?${params}`, { headers });
      if (res.ok) {
        const data: PaginatedResponse = await res.json();
        setSwitches(data.items);
        setTotalPages(data.total_pages);
        setTotalItems(data.total);
      } else {
        setSwitches([]); setTotalPages(1); setTotalItems(0);
      }
    } catch {
      showToast('Failed to load inventory', 'warning');
      setSwitches([]); setTotalPages(1); setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [token, search, statusFilter, vendorFilter, roleFilter, page, selectedTenant]);

  useEffect(() => { fetchSwitches(); }, [fetchSwitches]);

  // ── Fetch snapshots ──────────────────────────────────────────────────────────
  const fetchSnapshots = useCallback(async (switchId: string) => {
    setSnapshotLoading(true);
    try {
      const res = await fetch(`/api/v5/visibility/snapshots?switch_id=${switchId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data: ConfigSnapshot[] = await res.json();
        setLocalSnapshots(prev => ({ ...prev, [switchId]: data }));
        if (data.length >= 2) { setSelectedSnap1(data[0].snapshot_id); setSelectedSnap2(data[1].snapshot_id); }
        else if (data.length === 1) { setSelectedSnap1(data[0].snapshot_id); setSelectedSnap2(''); }
        else { setSelectedSnap1(''); setSelectedSnap2(''); }
      } else {
        setLocalSnapshots(prev => ({ ...prev, [switchId]: [] }));
      }
    } catch {
      showToast('Failed to load snapshots', 'warning');
      setLocalSnapshots(prev => ({ ...prev, [switchId]: [] }));
    } finally {
      setSnapshotLoading(false);
    }
  }, [token]);

  // ── Fetch compliance findings for a switch ──────────────────────────────────
  const fetchCompliance = useCallback(async (switchId: string) => {
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;
      const res = await fetch('/api/v5/visibility/compliance/latest', { headers });
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.findings || []).filter((f: any) => f.switch_id === switchId);
        setComplianceFindings(prev => ({ ...prev, [switchId]: filtered }));
      } else {
        setComplianceFindings(prev => ({ ...prev, [switchId]: [] }));
      }
    } catch {
      showToast('Failed to load compliance data', 'warning');
      setComplianceFindings(prev => ({ ...prev, [switchId]: [] }));
    }
  }, [token, selectedTenant]);

  // ── Expand row ───────────────────────────────────────────────────────────────
  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!tabMap[id]) setTabMap(prev => ({ ...prev, [id]: 'overview' }));
      fetchSnapshots(id);
      fetchCompliance(id);
    }
  };

  const setTab = (id: string, tab: string) => setTabMap(prev => ({ ...prev, [id]: tab }));

  // ── CRUD callbacks ───────────────────────────────────────────────────────────
  const handleSwitchSaved = (id: string) => { fetchSwitches(); setExpandedId(id); };
  const handleSwitchDeleted = () => { setExpandedId(null); fetchSwitches(); };

  // ── Snapshot actions ─────────────────────────────────────────────────────────
  const handleTakeSnapshot = async () => {
    if (!activeSwitch) return;
    setTakingSnapshot(true);
    try {
      const res = await fetch(`/api/v5/visibility/snapshots?switch_id=${activeSwitch.switch_id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) { showToast(`Snapshot taken for ${activeSwitch.hostname}`, 'success'); fetchSnapshots(activeSwitch.switch_id); }
      else { const e = await res.json().catch(() => ({})); showToast(e.detail || 'Failed to take snapshot', 'warning'); }
    } catch { showToast('Failed to take snapshot', 'warning'); }
    finally { setTakingSnapshot(false); }
  };

  const handleRollback = async (snapId: string) => {
    if (!activeSwitch || !snapId) return;
    try {
      const res = await fetch('/api/v5/visibility/rollback', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot_id: snapId, dry_run: activeSwitch.role === 'spine' })
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (activeSwitch.role === 'spine' || body.status === 'APPROVAL_REQUIRED') {
          showToast(body.message || 'Pending Four-Eyes Approval — queued, not executed.', 'warning');
        } else {
          showToast(`Rollback triggered on ${activeSwitch.hostname}`, 'success');
          fetchSwitches();
        }
      } else {
        const e = await res.json().catch(() => ({}));
        showToast(e.detail || 'Rollback failed', 'warning');
      }
    } catch {
      showToast('Network error — rollback request could not be sent.', 'warning');
    }
  };

  const handleAcceptDrift = async () => {
    if (!activeSwitch) return;
    setAcceptingDrift(true);
    try {
      const res = await fetch('/api/v5/visibility/accept-drift', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ switch_id: activeSwitch.switch_id })
      });
      if (res.ok) { showToast(`Drift accepted as new baseline for ${activeSwitch.hostname}`, 'success'); fetchSwitches(); fetchSnapshots(activeSwitch.switch_id); }
      else { const e = await res.json().catch(() => ({})); showToast(e.detail || 'Failed to accept drift', 'warning'); }
    } catch { showToast('Failed to accept drift', 'warning'); }
    finally { setAcceptingDrift(false); }
  };

  // ── Config Diff renderer (LCS) ───────────────────────────────────────────────
  const renderConfigDiff = (sw: DellSwitchDetails) => {
    const snaps = localSnapshots[sw.switch_id] || [];
    const snap1 = snaps.find(s => s.snapshot_id === selectedSnap1);
    if (!snap1) return <p className="text-xs text-slate-400">Select a baseline snapshot to compare.</p>;

    const normalize = (cfg: string) =>
      cfg.replace(/\r/g, '').split('\n').map(l => l.trimEnd()).filter(l => l.length > 0 && !l.trimStart().startsWith('!'));

    let lines1: string[] = [];
    let lines2: string[] = [];
    let label2 = '';

    if (selectedSnap2 === '__running__') {
      if (!sw.running_config) return <p className="text-xs text-slate-400">No running config available.</p>;
      lines1 = normalize(snap1.raw_config); lines2 = normalize(sw.running_config); label2 = 'Running Config (Live)';
    } else {
      const snap2 = snaps.find(s => s.snapshot_id === selectedSnap2);
      if (!snap2) return <p className="text-xs text-slate-400">Select a snapshot or running config to compare.</p>;
      lines1 = normalize(snap1.raw_config); lines2 = normalize(snap2.raw_config);
      label2 = new Date(snap2.taken_at).toLocaleString();
    }

    const N = lines1.length; const M = lines2.length;
    const dp: number[][] = Array(N + 1).fill(0).map(() => Array(M + 1).fill(0));
    for (let i = 1; i <= N; i++) for (let j = 1; j <= M; j++)
      dp[i][j] = lines1[i-1] === lines2[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);

    const rows: React.ReactNode[] = [];
    let i = N; let j = M; let k = 0;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && lines1[i-1] === lines2[j-1]) {
        rows.unshift(<div key={`u${k++}`} className="py-0.5 px-3 hover:bg-slate-50 font-mono text-[11px] text-slate-600 whitespace-pre">{`  ${lines1[i-1]}`}</div>); i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
        rows.unshift(<div key={`a${k++}`} className="py-0.5 px-3 bg-emerald-50 font-mono text-[11px] text-emerald-700 whitespace-pre">{`+ ${lines2[j-1]}`}</div>); j--;
      } else {
        rows.unshift(<div key={`r${k++}`} className="py-0.5 px-3 bg-rose-50 font-mono text-[11px] text-rose-700 whitespace-pre">{`- ${lines1[i-1]}`}</div>); i--;
      }
    }

    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white max-h-72 overflow-y-auto">
        <div className="bg-slate-50 px-3 py-1.5 border-b text-[10px] font-bold text-slate-400 flex justify-between">
          <span>Snapshot vs {label2}</span>
          <span>Red: Removals · Green: Additions</span>
        </div>
        <div className="py-2">{rows}</div>
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 font-sans">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3.5 rounded-lg shadow-xl text-xs font-semibold ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">
            Network Switches
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Asset management, config snapshots, compliance drift &amp; live port telemetry.
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-1.5 shrink-0">
          <Plus className="w-3.5 h-3.5" /> Add Switch
        </button>
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search hostname, IP, serial..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-atlas-primary transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <ListFilter className="h-4 w-4 text-atlas-primary flex-shrink-0" />
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-atlas-primary">
            <option value="ALL">All Status</option>
            <option value="compliant_active">Compliant</option>
            <option value="drifted">Drifted</option>
            <option value="discovered">Discovered</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-atlas-primary flex-shrink-0" />
          <select value={vendorFilter} onChange={e => { setVendorFilter(e.target.value); setPage(1); }}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-atlas-primary">
            <option value="ALL">All Vendors</option>
            <option value="nokia">Nokia</option>
            <option value="dell">Dell</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-atlas-primary flex-shrink-0" />
          <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-atlas-primary">
            <option value="ALL">All Roles</option>
            <option value="spine">Spine</option>
            <option value="leaf">Leaf</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-wider bg-slate-50/80">
                <th className="px-6 py-3">Switch Info</th>
                <th className="px-6 py-3">IP Address</th>
                <th className="px-6 py-3">Vendor &amp; Model</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Compliance</th>
                <th className="px-6 py-3">Last Discovery</th>
                <th className="px-6 py-3">HW</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                  <div className="flex justify-center items-center gap-3">
                    <RotateCw className="h-5 w-5 animate-spin text-atlas-primary" />
                    <span className="text-sm">Loading switch inventory...</span>
                  </div>
                </td></tr>
              ) : switches.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400 text-sm">No switches matched the filters.</td></tr>
              ) : (
                switches.map((sw) => {
                  const isExpanded = expandedId === sw.switch_id;
                  const activeTab = tabMap[sw.switch_id] || 'overview';
                  const hwStatus = sw.hardware_components?.some(c => c.status === 'critical') ? 'critical'
                    : sw.hardware_components?.some(c => c.status === 'warning') ? 'warning' : 'ok';

                  const TABS = ['overview', 'interfaces', 'vlans', 'lags', 'snapshots', 'fabric', 'hardware', 'config', 'compliance'];

                  return (
                    <React.Fragment key={sw.switch_id}>
                      <tr className={`hover:bg-slate-50/60 transition-colors ${isExpanded ? 'bg-indigo-50/30' : ''}`}>
                        {/* Switch info */}
                        <td className="px-6 py-4">
                          <div className="font-bold text-sm text-atlas-ink">{sw.hostname}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">S/N: {sw.serial_number || sw.service_tag || 'N/A'}</div>
                        </td>
                        {/* IP */}
                        <td className="px-6 py-4 font-mono text-xs text-slate-600 font-semibold">{sw.management_ip}</td>
                        {/* Vendor */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                              sw.vendor?.toLowerCase() === 'nokia' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
                            }`}>{sw.vendor?.toLowerCase() === 'nokia' ? 'Nokia' : 'Dell'}</span>
                            <span className="text-slate-600 text-xs font-medium">{sw.model || 'Unknown'}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">OS: {sw.os_version || 'N/A'}</div>
                        </td>
                        {/* Role */}
                        <td className="px-6 py-4">
                          <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${
                            sw.role?.toLowerCase() === 'spine' ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>{sw.role?.toUpperCase() || 'LEAF'}</span>
                        </td>
                        {/* Compliance */}
                        <td className="px-6 py-4"><StatusPill status={sw.lifecycle_status} /></td>
                        {/* Last discovery */}
                        <td className="px-6 py-4 text-[10px] text-slate-500">
                          {sw.last_collection_timestamp
                            ? new Date(sw.last_collection_timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : 'Never'}
                        </td>
                        {/* HW health */}
                        <td className="px-6 py-4"><HardwareHealthIcon status={hwStatus} /></td>
                        {/* Actions */}
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => toggleExpand(sw.switch_id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-atlas-primary/40 rounded-lg text-xs font-semibold transition-all"
                          >
                            <span>Details</span>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      </tr>

                      {/* ── Expandable detail ───────────────────────────── */}
                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={8} className="px-6 py-5 border-b border-slate-100">

                            {/* Sub-header with edit/delete */}
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <div className="font-bold text-atlas-ink text-sm">{sw.hostname}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{sw.role?.toUpperCase()} · {sw.management_ip}</div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => { setExpandedId(sw.switch_id); setShowEditModal(true); }}
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-atlas-primary transition-colors" title="Edit">
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => { setExpandedId(sw.switch_id); setShowDeleteModal(true); }}
                                  className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors" title="Delete">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Tab bar */}
                            <div className="flex border-b border-slate-200 mb-4 gap-1 overflow-x-auto">
                              {TABS.map(tab => (
                                <button key={tab} onClick={() => setTab(sw.switch_id, tab)}
                                  className={`pb-2.5 px-2 font-semibold text-xs tracking-wide transition-colors relative whitespace-nowrap ${
                                    activeTab === tab ? 'text-atlas-primary' : 'text-slate-400 hover:text-slate-600'
                                  }`}>
                                  {tab === 'overview' && 'Overview'}
                                  {tab === 'interfaces' && `Interfaces (${sw.interfaces?.length || 0})`}
                                  {tab === 'vlans' && `VLANs (${sw.vlans?.length || 0})`}
                                  {tab === 'lags' && `LAGs (${sw.lags?.length || 0})`}
                                  {tab === 'snapshots' && 'Snapshots'}
                                  {tab === 'fabric' && 'Fabric / VLT'}
                                  {tab === 'hardware' && `Hardware (${sw.hardware_components?.length || 0})`}
                                  {tab === 'config' && 'Running Config'}
                                  {tab === 'compliance' && `Compliance${complianceFindings[sw.switch_id]?.length ? ` (${complianceFindings[sw.switch_id].length})` : ''}`}
                                  {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-atlas-primary rounded-full" />}
                                </button>
                              ))}
                            </div>

                            {/* ── Overview ── */}
                            {activeTab === 'overview' && (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                {[
                                  ['Model', `${sw.vendor?.toUpperCase() || ''} ${sw.model || '-'}`],
                                  ['Serial Number', sw.serial_number || '-'],
                                  ['Service Tag', sw.service_tag || '-'],
                                  ['Part Number', sw.part_number || '-'],
                                  ['OS Version', sw.os_version || '-'],
                                  ['OS License', sw.os10_license_status || 'Licensed'],
                                  ['Mgmt MAC', sw.management_mac || '-'],
                                  ['Uptime', sw.uptime || '-'],
                                  ['Ports', `${sw.ports_up ?? '-'} / ${sw.ports_all ?? '-'} up`],
                                  ['Temperature', sw.temperature || 'Normal'],
                                  ['Chassis', sw.chassis_status || 'Ready'],
                                  ['Status', sw.status || 'Unknown'],
                                  ['Last Discovery', sw.last_collection_timestamp ? new Date(sw.last_collection_timestamp).toLocaleString() : 'Never'],
                                ].map(([label, val]) => (
                                  <div key={label} className="space-y-0.5">
                                    <span className="text-slate-400 font-medium block">{label}</span>
                                    <span className="font-semibold text-slate-700 font-mono">{val}</span>
                                  </div>
                                ))}
                                {sw.location && (
                                  <div className="col-span-2 space-y-0.5">
                                    <span className="text-slate-400 font-medium block">Location</span>
                                    <span className="font-semibold text-slate-700">{sw.location}</span>
                                  </div>
                                )}
                                {/* Compliance alert if drifted */}
                                {sw.lifecycle_status === 'drifted' && (
                                  <div className="col-span-2 md:col-span-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex gap-3 items-start">
                                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="text-xs font-bold text-rose-800">Configuration Drift Detected</div>
                                      <div className="text-[10px] text-rose-600 mt-0.5">Category: {sw.configuration_drift_category || 'Unknown'}</div>
                                      <button onClick={() => handleRollback(activeSnapshots.find(s => s.is_baseline)?.snapshot_id || '')}
                                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg transition-colors">
                                        <RotateCcw className="w-3 h-3" /> Rollback to Baseline
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* ── Interfaces ── */}
                            {activeTab === 'interfaces' && (
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-[11px] font-bold text-slate-500">Interfaces ({sw.interfaces?.length || 0})</span>
                                  <div className="flex gap-1.5">
                                    {(['all', 'up', 'down'] as const).map(f => (
                                      <button key={f} onClick={() => setInterfaceFilter(f)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${interfaceFilter === f ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>
                                        {f.charAt(0).toUpperCase() + f.slice(1)}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white max-h-80 overflow-y-auto shadow-sm">
                                  <table className="w-full text-left text-xs">
                                    <thead>
                                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                                        <th className="px-4 py-3">Port</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">VLAN / Mode</th>
                                        <th className="px-4 py-3">Speed / MTU</th>
                                        <th className="px-4 py-3">Neighbor</th>
                                        <th className="px-4 py-3 text-right">Errors In/Out</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                      {(sw.interfaces || [])
                                        .filter(i => interfaceFilter === 'all' || (interfaceFilter === 'up' ? i.status === 'up' : i.status !== 'up'))
                                        .map((inf, idx) => {
                                          const up = inf.status?.toLowerCase() === 'up';
                                          return (
                                            <tr key={idx} className="hover:bg-slate-50/50">
                                              <td className="px-4 py-2.5 font-mono font-semibold text-atlas-ink text-[11px]">{inf.name}</td>
                                              <td className="px-4 py-2.5">
                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-[10px] ${up ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                                                  <span className={`h-1.5 w-1.5 rounded-full ${up ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                                  {inf.status?.toUpperCase()}
                                                </span>
                                              </td>
                                              <td className="px-4 py-2.5">
                                                <div className="font-semibold text-slate-700 text-[11px]">{inf.switchport_mode?.toUpperCase() || 'ACCESS'}</div>
                                                <div className="text-[10px] text-slate-400">VLAN: {inf.vlan || 'none'}</div>
                                              </td>
                                              <td className="px-4 py-2.5 font-mono text-slate-500 text-[11px]">
                                                <div>{inf.speed_duplex || 'N/A'}</div>
                                                <div className="text-[10px] text-slate-400">MTU: {inf.mtu || 1500}</div>
                                              </td>
                                              <td className="px-4 py-2.5 text-slate-500 text-[11px]">{inf.neighbor || <span className="text-slate-300 italic">None</span>}</td>
                                              <td className="px-4 py-2.5 text-right font-mono text-slate-500 text-[11px]">{inf.errors_in ?? 0} / {inf.errors_out ?? 0}</td>
                                            </tr>
                                          );
                                        })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* ── VLANs ── */}
                            {activeTab === 'vlans' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {sw.vlans && sw.vlans.length > 0 ? sw.vlans.map(vl => (
                                  <div key={vl.vlan_id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-start gap-3 shadow-sm">
                                    <div className="h-9 w-9 rounded-lg bg-atlas-primary/10 border border-atlas-primary/20 flex items-center justify-center text-atlas-primary flex-shrink-0"><Hash className="h-4 w-4" /></div>
                                    <div className="overflow-hidden">
                                      <div className="text-atlas-ink font-bold text-sm">VLAN {vl.vlan_id}</div>
                                      <div className="text-xs text-slate-500 truncate">{vl.name}</div>
                                      {vl.member_ports && vl.member_ports.length > 0 && (
                                        <div className="text-[10px] text-slate-400 mt-1 truncate">Ports: {vl.member_ports.join(', ')}</div>
                                      )}
                                    </div>
                                  </div>
                                )) : <div className="col-span-full py-6 text-center text-slate-400 text-sm">No VLANs on this switch.</div>}
                              </div>
                            )}

                            {/* ── LAGs ── */}
                            {activeTab === 'lags' && (
                              <div className="space-y-2">
                                {sw.lags && sw.lags.length > 0 ? sw.lags.map(lag => (
                                  <div key={lag.lag_id} className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                                    <div className="flex justify-between items-center">
                                      <div>
                                        <span className="font-bold font-mono text-sm text-atlas-ink">{lag.lag_name}</span>
                                        <span className="text-xs text-slate-500 ml-2">{lag.protocol}</span>
                                      </div>
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${lag.status === 'up' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>{lag.status}</span>
                                    </div>
                                    {lag.member_ports && lag.member_ports.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {lag.member_ports.map((p, i) => <span key={i} className="text-[10px] font-mono bg-slate-50 border rounded px-1.5 py-0.5 text-slate-600">{p}</span>)}
                                      </div>
                                    )}
                                  </div>
                                )) : <div className="py-6 text-center text-slate-400 text-sm">No LAGs configured.</div>}
                              </div>
                            )}

                            {/* ── Snapshots / Diff ── */}
                            {activeTab === 'snapshots' && (
                              <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                  <span className="text-[11px] font-bold text-slate-500">Config Snapshots &amp; Diff</span>
                                  <button onClick={handleTakeSnapshot} disabled={takingSnapshot} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
                                    <Camera className="w-3.5 h-3.5" />{takingSnapshot ? 'Taking...' : 'Take Snapshot'}
                                  </button>
                                </div>
                                {snapshotLoading ? (
                                  <p className="text-xs text-slate-400">Loading snapshots...</p>
                                ) : activeSnapshots.length === 0 ? (
                                  <div className="text-center py-8 text-slate-400 text-xs">No snapshots yet. Click "Take Snapshot" to start.</div>
                                ) : (
                                  <>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Baseline</label>
                                        <select value={selectedSnap1} onChange={e => setSelectedSnap1(e.target.value)} className="w-full bg-slate-50 border text-xs p-2 rounded-lg outline-none">
                                          {activeSnapshots.map(s => <option key={s.snapshot_id} value={s.snapshot_id}>{new Date(s.taken_at).toLocaleString()} · {s.taken_by}</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Compare With</label>
                                        <select value={selectedSnap2} onChange={e => setSelectedSnap2(e.target.value)} className="w-full bg-slate-50 border text-xs p-2 rounded-lg outline-none">
                                          {activeSnapshots.filter(s => s.snapshot_id !== selectedSnap1).map(s => <option key={s.snapshot_id} value={s.snapshot_id}>{new Date(s.taken_at).toLocaleString()} · {s.taken_by}</option>)}
                                          {sw.running_config && <option value="__running__">Running Config (Live)</option>}
                                        </select>
                                      </div>
                                    </div>
                                    {renderConfigDiff(sw)}
                                    {selectedSnap1 && sw.lifecycle_status === 'drifted' && (
                                      <div className="pt-3 border-t border-slate-100 flex gap-3">
                                        <button onClick={() => handleRollback(selectedSnap1)} className="btn-danger flex-1 flex items-center justify-center gap-2 py-2.5 text-xs">
                                          <RotateCcw className="w-3.5 h-3.5" /> Rollback Config
                                        </button>
                                        <button onClick={handleAcceptDrift} disabled={acceptingDrift} className="btn-secondary border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 flex-1 flex items-center justify-center gap-2 py-2.5 text-xs">
                                          <Check className="w-3.5 h-3.5" />{acceptingDrift ? 'Accepting...' : 'Accept as Baseline'}
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}

                            {/* ── Fabric / VLT ── */}
                            {activeTab === 'fabric' && (
                              <FabricVltTab vlt={sw.vlt ? {
                                ...sw.vlt,
                                domainId: sw.vlt.domainId ?? sw.vlt.domain_id ?? 1,
                                switchId: sw.switch_id,
                                peerSwitchId: sw.vlt.peer_switch_id || '',
                                peerSwitchHostname: sw.vlt.peer_switch_hostname,
                                peerLinkStatus: sw.vlt.peer_link_status,
                                iclState: sw.vlt.icl_state,
                                peerRoutingEnabled: sw.vlt.peer_routing_enabled,
                                vrrpGroups: sw.vlt.vrrp_groups || [],
                              } : null} />
                            )}

                            {/* ── Hardware ── */}
                            {activeTab === 'hardware' && (
                              <HardwareHealthTab items={
                                sw.hardware_components?.map(c => ({
                                  slot: c.slot_label,
                                  type: (c.component_type === 'psu' ? 'PSU' : c.component_type?.includes('fan') ? 'Fan' : 'Supervisor') as "PSU" | "Fan" | "Supervisor" | "Line Card",
                                  status: c.status as any,
                                  detail: [c.detail, c.part_number ? `PN: ${c.part_number}` : '', c.service_tag ? `ST: ${c.service_tag}` : ''].filter(Boolean).join(' | '),
                                })) || []
                              } />
                            )}

                            {/* ── Running Config ── */}
                            {activeTab === 'config' && (
                              <div className="space-y-2">
                                <span className="block text-[11px] font-bold text-slate-500">Live Running Configuration</span>
                                {sw.running_config ? (
                                  <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[10px] overflow-auto max-h-80 whitespace-pre">{sw.running_config}</pre>
                                ) : (
                                  <p className="text-xs text-slate-400">No configuration snapshot taken yet.</p>
                                )}
                              </div>
                            )}

                            {/* ── Compliance ── */}
                            {activeTab === 'compliance' && (
                              <div className="space-y-3">
                                {(() => {
                                  const findings = complianceFindings[sw.switch_id] || [];
                                  if (findings.length === 0) {
                                    return (
                                      <div className="text-center py-8">
                                        <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                                        <p className="text-sm text-slate-500 font-medium">No compliance findings for this switch.</p>
                                        <p className="text-xs text-slate-400 mt-1">Run a compliance audit to check for configuration drift.</p>
                                      </div>
                                    );
                                  }
                                  const criticals = findings.filter((f: any) => f.severity === 'critical').length;
                                  const warnings = findings.filter((f: any) => f.severity === 'warning').length;
                                  const others = findings.length - criticals - warnings;
                                  return (
                                    <>
                                      <div className="flex items-center gap-3 text-[10px] font-bold">
                                        <span className="text-slate-500">{findings.length} finding{findings.length !== 1 ? 's' : ''}</span>
                                        {criticals > 0 && <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700">{criticals} Critical</span>}
                                        {warnings > 0 && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">{warnings} Warning</span>}
                                        {others > 0 && <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">{others} Low</span>}
                                      </div>
                                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white max-h-72 overflow-y-auto shadow-sm">
                                        <table className="w-full text-left text-xs">
                                          <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                                              <th className="px-4 py-3">Rule</th>
                                              <th className="px-4 py-3">Severity</th>
                                              <th className="px-4 py-3">Detail</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-50">
                                            {findings.map((f: any) => (
                                              <tr key={f.finding_id} className="hover:bg-slate-50/50">
                                                <td className="px-4 py-2.5 font-semibold text-atlas-ink text-[11px]">{f.rule_name}</td>
                                                <td className="px-4 py-2.5">
                                                  <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                                    f.severity === 'critical' ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                                    : f.severity === 'warning' ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                                  }`}>{f.severity}</span>
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-500 text-[11px]">{f.detail}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            )}

                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <div className="text-xs text-slate-400">
              Page <span className="font-bold text-slate-600">{page}</span> of <span className="font-bold text-slate-600">{totalPages}</span> &nbsp;&middot;&nbsp; {totalItems} total switches
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors">Previous</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors">Next</button>
            </div>
          </div>
        )}
      </Card>

      {/* CRUD Modals */}
      <AddSwitchModal open={showAddModal} onClose={() => setShowAddModal(false)} onSaved={handleSwitchSaved} />
      <AddSwitchModal open={showEditModal} onClose={() => setShowEditModal(false)} onSaved={handleSwitchSaved} editSwitch={activeSwitch ?? undefined} />
      <DeleteConfirmModal open={showDeleteModal} hostname={activeSwitch?.hostname || ''} switchId={activeSwitch?.switch_id || ''} onClose={() => setShowDeleteModal(false)} onDeleted={handleSwitchDeleted} />
    </div>
  );
};

export default SwitchesNew;

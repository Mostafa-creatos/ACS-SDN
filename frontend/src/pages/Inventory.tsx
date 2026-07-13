import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { 
  Search, 
  Filter, 
  RotateCw, 
  ChevronDown, 
  ChevronUp, 
  Cpu, 
  Network, 
  CheckCircle2, 
  XCircle,
  Hash,
  Activity,
  Server,
  FileText
} from 'lucide-react';

interface InterfaceDetail {
  name: string;
  status: string;
  speed_duplex?: string;
  vlan?: string;
  description?: string;
  ip_address?: string | null;
  mac_address?: string | null;
  neighbor?: string | null;
  switchport_mode?: string;
  mtu?: number;
  errors_in?: number;
  errors_out?: number;
}

interface VlanDetail {
  vlan_id: number;
  name: string;
  status?: string;
  tagged_ports?: string[];
  untagged_ports?: string[];
}

interface HardwareComponent {
  name: string;
  type: string;
  status: string;
  serial_number?: string;
  part_number?: string;
  description?: string;
}

interface SwitchInventory {
  switch_id: string;
  hostname: string;
  management_ip: string;
  vendor: string;
  role: string;
  model?: string;
  os_version?: string;
  status: string;
  uptime?: string;
  serial_number?: string;
  part_number?: string;
  chassis_status?: string;
  temperature?: string;
  interfaces: InterfaceDetail[];
  vlans: VlanDetail[];
  hardware_components: HardwareComponent[];
}

interface PaginatedResponse {
  items: SwitchInventory[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export const Inventory: React.FC = () => {
  const { token, selectedTenant } = useAuth();
  
  const [switches, setSwitches] = useState<SwitchInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [expandedSwitchId, setExpandedSwitchId] = useState<string | null>(null);
  const [activeTabMap, setActiveTabMap] = useState<Record<string, 'interfaces' | 'vlans' | 'hardware'>>({});
  
  const itemsPerPage = 10;

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (vendorFilter !== 'ALL') params.set('vendor', vendorFilter.toLowerCase());
      if (roleFilter !== 'ALL') params.set('role', roleFilter.toLowerCase());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      params.set('page', String(page));
      params.set('per_page', String(itemsPerPage));

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
      console.error('Failed to fetch inventory:', err);
      setSwitches([]);
      setTotalPages(1);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [token, search, vendorFilter, roleFilter, statusFilter, page, selectedTenant]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const toggleExpand = (switchId: string) => {
    if (expandedSwitchId === switchId) {
      setExpandedSwitchId(null);
    } else {
      setExpandedSwitchId(switchId);
      if (!activeTabMap[switchId]) {
        setActiveTabMap(prev => ({ ...prev, [switchId]: 'interfaces' }));
      }
    }
  };

  const setSwitchTab = (switchId: string, tab: 'interfaces' | 'vlans' | 'hardware') => {
    setActiveTabMap(prev => ({ ...prev, [switchId]: tab }));
  };

  return (
    <div className="space-y-6 font-sans">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">
            Network Switch Inventory
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time physical asset tracking, port provisioning status, and hardware vitals.
          </p>
        </div>
        <button
          onClick={fetchInventory}
          disabled={loading}
          className="btn-primary flex items-center gap-2"
        >
          <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search hostname, IP, model..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-atlas-primary transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-atlas-primary flex-shrink-0" />
          <select
            value={vendorFilter}
            onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-atlas-primary"
          >
            <option value="ALL">All Vendors</option>
            <option value="NOKIA">Nokia</option>
            <option value="DELL_OS10">Dell OS10</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-atlas-primary flex-shrink-0" />
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-atlas-primary"
          >
            <option value="ALL">All Roles</option>
            <option value="SPINE">Spine</option>
            <option value="LEAF">Leaf</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-atlas-primary flex-shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-atlas-primary"
          >
            <option value="ALL">All Statuses</option>
            <option value="Up">Up / Online</option>
            <option value="Down">Down / Offline</option>
          </select>
        </div>
      </div>

      {/* Main table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-wider bg-slate-50/80">
                <th className="px-6 py-3">Switch Info</th>
                <th className="px-6 py-3">IP Address</th>
                <th className="px-6 py-3">Vendor &amp; Model</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">State</th>
                <th className="px-6 py-3">Vitals</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex justify-center items-center gap-3">
                      <RotateCw className="h-5 w-5 animate-spin text-atlas-primary" />
                      <span className="text-sm">Loading physical asset inventory...</span>
                    </div>
                  </td>
                </tr>
              ) : switches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-sm">
                    No switches matched the selected filters.
                  </td>
                </tr>
              ) : (
                switches.map((sw) => {
                  const isExpanded = expandedSwitchId === sw.switch_id;
                  const activeTab = activeTabMap[sw.switch_id] || 'interfaces';
                  const isUp = sw.status.toLowerCase() === 'up';

                  return (
                    <React.Fragment key={sw.switch_id}>
                      <tr className={`hover:bg-slate-50/60 transition-colors ${isExpanded ? 'bg-indigo-50/30' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="font-bold text-sm text-atlas-ink">{sw.hostname}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">S/N: {sw.serial_number || 'N/A'}</div>
                        </td>

                        <td className="px-6 py-4 font-mono text-xs text-slate-600 font-semibold">
                          {sw.management_ip}
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                              sw.vendor.toLowerCase() === 'nokia'
                                ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                : 'bg-rose-50 text-rose-600 border border-rose-100'
                            }`}>
                              {sw.vendor.toLowerCase() === 'nokia' ? 'Nokia' : 'Dell'}
                            </span>
                            <span className="text-slate-600 text-xs font-medium">{sw.model || 'Unknown'}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">OS: {sw.os_version || 'N/A'}</div>
                        </td>

                        <td className="px-6 py-4">
                          <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${
                            sw.role.toLowerCase() === 'spine'
                              ? 'bg-purple-50 text-purple-700 border border-purple-100'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>
                            {sw.role.toUpperCase()}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            {isUp ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-rose-500 shrink-0" />}
                            <span className={`text-xs font-bold ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>{sw.status}</span>
                          </div>
                          {sw.uptime && <div className="text-[10px] text-slate-400 font-mono mt-0.5">Up: {sw.uptime}</div>}
                        </td>

                        <td className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                            <span className="text-slate-400 font-medium">Temp:</span>
                            <span className={`font-semibold ${sw.temperature === 'Normal' ? 'text-slate-600' : 'text-amber-600'}`}>{sw.temperature || 'N/A'}</span>
                            <span className="text-slate-400 font-medium">Chassis:</span>
                            <span className="text-slate-600 font-semibold">{sw.chassis_status || 'Ready'}</span>
                          </div>
                        </td>

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

                      {/* Expandable detail row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={7} className="px-6 py-5 border-b border-slate-100">
                            {/* Tab navigation */}
                            <div className="flex border-b border-slate-200 mb-4 gap-6">
                              {(['interfaces', 'vlans', 'hardware'] as const).map((tab) => (
                                <button
                                  key={tab}
                                  onClick={() => setSwitchTab(sw.switch_id, tab)}
                                  className={`pb-2.5 font-semibold text-xs tracking-wide transition-colors relative ${
                                    activeTab === tab ? 'text-atlas-primary' : 'text-slate-400 hover:text-slate-600'
                                  }`}
                                >
                                  {tab === 'interfaces' && `Interfaces (${sw.interfaces?.length || 0})`}
                                  {tab === 'vlans' && `VLANs (${sw.vlans?.length || 0})`}
                                  {tab === 'hardware' && `Hardware (${sw.hardware_components?.length || 0})`}
                                  {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-atlas-primary rounded-full" />}
                                </button>
                              ))}
                            </div>

                            {/* Interfaces Tab */}
                            {activeTab === 'interfaces' && (
                              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white max-h-80 overflow-y-auto shadow-sm">
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                                      <th className="px-4 py-3">Port</th>
                                      <th className="px-4 py-3">Status</th>
                                      <th className="px-4 py-3">VLAN / Mode</th>
                                      <th className="px-4 py-3">Speed / MTU</th>
                                      <th className="px-4 py-3">Neighbor (LLDP)</th>
                                      <th className="px-4 py-3 text-right">Errors (In/Out)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {(sw.interfaces || []).map((inf) => {
                                      const isPortUp = inf.status.toLowerCase() === 'up';
                                      return (
                                        <tr key={inf.name} className="hover:bg-slate-50/50">
                                          <td className="px-4 py-2.5 font-mono font-semibold text-atlas-ink text-[11px]">{inf.name}</td>
                                          <td className="px-4 py-2.5">
                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                              isPortUp ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'
                                            }`}>
                                              <span className={`h-1.5 w-1.5 rounded-full ${isPortUp ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                              {inf.status.toUpperCase()}
                                            </span>
                                          </td>
                                          <td className="px-4 py-2.5">
                                            <div className="font-semibold text-slate-700 text-[11px]">{inf.switchport_mode ? inf.switchport_mode.toUpperCase() : 'ACCESS'}</div>
                                            <div className="text-[10px] text-slate-400">VLAN: {inf.vlan || 'none'}</div>
                                          </td>
                                          <td className="px-4 py-2.5 font-mono text-slate-500 text-[11px]">
                                            <div>{inf.speed_duplex || 'N/A'}</div>
                                            <div className="text-[10px] text-slate-400">MTU: {inf.mtu || 1500}</div>
                                          </td>
                                          <td className="px-4 py-2.5 text-slate-500 text-[11px]">
                                            {inf.neighbor || <span className="text-slate-300 italic">None</span>}
                                          </td>
                                          <td className="px-4 py-2.5 text-right font-mono text-slate-500 text-[11px]">
                                            {inf.errors_in ?? 0} / {inf.errors_out ?? 0}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* VLANs Tab */}
                            {activeTab === 'vlans' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {sw.vlans && sw.vlans.length > 0 ? (
                                  sw.vlans.map((vl) => (
                                    <div key={vl.vlan_id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-start gap-3 shadow-sm">
                                      <div className="h-9 w-9 rounded-lg bg-atlas-primary/10 border border-atlas-primary/20 flex items-center justify-center text-atlas-primary flex-shrink-0">
                                        <Hash className="h-4 w-4" />
                                      </div>
                                      <div className="overflow-hidden">
                                        <div className="text-atlas-ink font-bold text-sm">VLAN {vl.vlan_id}</div>
                                        <div className="text-xs text-slate-500 truncate">Name: {vl.name}</div>
                                        {vl.tagged_ports && vl.tagged_ports.length > 0 && (
                                          <div className="text-[10px] text-slate-400 mt-1 truncate">Tagged: {vl.tagged_ports.join(', ')}</div>
                                        )}
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="col-span-full py-6 text-center text-slate-400 text-sm">No VLANs mapped on this switch.</div>
                                )}
                              </div>
                            )}

                            {/* Hardware Tab */}
                            {activeTab === 'hardware' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {sw.hardware_components && sw.hardware_components.length > 0 ? (
                                  sw.hardware_components.map((hw, idx) => (
                                    <div key={`${hw.name}-${idx}`} className="p-4 bg-white border border-slate-200 rounded-xl flex items-start gap-3.5 shadow-sm">
                                      <div className="h-10 w-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                                        {hw.type.toLowerCase().includes('cpu') ? (
                                          <Cpu className="h-5 w-5 text-atlas-primary" />
                                        ) : hw.type.toLowerCase().includes('power') ? (
                                          <Server className="h-5 w-5 text-emerald-600" />
                                        ) : (
                                          <FileText className="h-5 w-5 text-atlas-violet" />
                                        )}
                                      </div>
                                      <div>
                                        <div className="text-atlas-ink font-bold text-sm">{hw.name}</div>
                                        <div className="text-xs text-slate-400 mt-0.5">{hw.description || hw.type}</div>
                                        <div className="grid grid-cols-2 gap-x-4 mt-2 text-[10px] font-mono text-slate-400">
                                          <span>Status: <span className={hw.status === 'OK' || hw.status === 'Normal' ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>{hw.status}</span></span>
                                          {hw.serial_number && <span>S/N: {hw.serial_number}</span>}
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="col-span-full py-6 text-center text-slate-400 text-sm">No hardware subcomponents discovered.</div>
                                )}
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
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

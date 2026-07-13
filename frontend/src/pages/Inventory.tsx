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
    <div className="space-y-6">
      {/* Header section with glassmorphic style */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
            Network Switch Inventory
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time physical asset tracking, port provisioning status, and hardware vitals.
          </p>
        </div>
        <button
          onClick={fetchInventory}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 active:bg-indigo-600/70 text-indigo-200 border border-indigo-500/30 rounded-xl transition-all duration-200 disabled:opacity-50"
        >
          <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      {/* Filter and search bar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 p-4 bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-xl">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search hostname, IP, model..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 transition-colors"
          />
        </div>

        {/* Vendor filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-indigo-400 flex-shrink-0" />
          <select
            value={vendorFilter}
            onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500/80"
          >
            <option value="ALL">All Vendors</option>
            <option value="NOKIA">Nokia</option>
            <option value="DELL_OS10">Dell OS10</option>
          </select>
        </div>

        {/* Role filter */}
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-indigo-400 flex-shrink-0" />
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500/80"
          >
            <option value="ALL">All Roles</option>
            <option value="SPINE">Spine</option>
            <option value="LEAF">Leaf</option>
          </select>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-400 flex-shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500/80"
          >
            <option value="ALL">All Statuses</option>
            <option value="Up">Up / Online</option>
            <option value="Down">Down / Offline</option>
          </select>
        </div>
      </div>

      {/* Main inventory table */}
      <Card className="overflow-hidden border border-slate-800/80 bg-slate-900/20 backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <th className="px-6 py-4">Switch Info</th>
                <th className="px-6 py-4">IP Address</th>
                <th className="px-6 py-4">Vendor & Model</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">State</th>
                <th className="px-6 py-4">Vitals</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center items-center gap-3">
                      <RotateCw className="h-5 w-5 animate-spin text-indigo-500" />
                      <span>Loading physical asset inventory...</span>
                    </div>
                  </td>
                </tr>
              ) : switches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
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
                      <tr className={`hover:bg-slate-800/30 transition-colors ${isExpanded ? 'bg-slate-800/20' : ''}`}>
                        {/* Switch Name & Serial */}
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-100">{sw.hostname}</div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            S/N: {sw.serial_number || 'N/A'}
                          </div>
                        </td>

                        {/* Management IP */}
                        <td className="px-6 py-4 font-mono text-sm text-slate-300">
                          {sw.management_ip}
                        </td>

                        {/* Vendor & Model */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${
                              sw.vendor.toLowerCase() === 'nokia' 
                                ? 'bg-blue-900/30 text-blue-300 border border-blue-500/20' 
                                : 'bg-red-900/30 text-red-300 border border-red-500/20'
                            }`}>
                              {sw.vendor.toLowerCase() === 'nokia' ? 'Nokia' : 'Dell'}
                            </span>
                            <span className="text-slate-300 text-sm">{sw.model || 'Unknown Model'}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1">OS: {sw.os_version || 'N/A'}</div>
                        </td>

                        {/* Role */}
                        <td className="px-6 py-4">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                            sw.role.toLowerCase() === 'spine'
                              ? 'bg-purple-900/40 text-purple-300 border border-purple-800/30'
                              : 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/30'
                          }`}>
                            {sw.role.toUpperCase()}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {isUp ? (
                              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                            ) : (
                              <XCircle className="h-4.5 w-4.5 text-rose-400" />
                            )}
                            <span className={`text-sm font-medium ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {sw.status}
                            </span>
                          </div>
                          {sw.uptime && (
                            <div className="text-xs text-slate-500 font-mono mt-0.5">Up: {sw.uptime}</div>
                          )}
                        </td>

                        {/* Vitals */}
                        <td className="px-6 py-4 text-sm text-slate-300">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <span className="text-slate-500">Temp:</span>
                            <span className={`font-medium ${sw.temperature === 'Normal' ? 'text-slate-300' : 'text-amber-400'}`}>
                              {sw.temperature || 'N/A'}
                            </span>
                            <span className="text-slate-500">Chassis:</span>
                            <span className="text-slate-300 font-medium">{sw.chassis_status || 'Ready'}</span>
                          </div>
                        </td>

                        {/* Actions / Expand Toggle */}
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => toggleExpand(sw.switch_id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
                          >
                            <span>Details</span>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable row detail container */}
                      {isExpanded && (
                        <tr className="bg-slate-950/60">
                          <td colSpan={7} className="px-6 py-6 border-b border-slate-800">
                            {/* Tab toggles inside switch detail */}
                            <div className="flex border-b border-slate-800 mb-4 gap-6">
                              <button
                                onClick={() => setSwitchTab(sw.switch_id, 'interfaces')}
                                className={`pb-3 font-semibold text-sm transition-colors relative ${
                                  activeTab === 'interfaces' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                Interfaces ({sw.interfaces?.length || 0})
                                {activeTab === 'interfaces' && (
                                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
                                )}
                              </button>
                              <button
                                onClick={() => setSwitchTab(sw.switch_id, 'vlans')}
                                className={`pb-3 font-semibold text-sm transition-colors relative ${
                                  activeTab === 'vlans' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                VLANs ({sw.vlans?.length || 0})
                                {activeTab === 'vlans' && (
                                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
                                )}
                              </button>
                              <button
                                onClick={() => setSwitchTab(sw.switch_id, 'hardware')}
                                className={`pb-3 font-semibold text-sm transition-colors relative ${
                                  activeTab === 'hardware' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                Hardware Components ({sw.hardware_components?.length || 0})
                                {activeTab === 'hardware' && (
                                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
                                )}
                              </button>
                            </div>

                            {/* TAB CONTENT: Interfaces */}
                            {activeTab === 'interfaces' && (
                              <div className="overflow-x-auto rounded-lg border border-slate-800/80 bg-slate-950/80 max-h-96 overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold uppercase">
                                      <th className="px-4 py-3">Port</th>
                                      <th className="px-4 py-3">Status</th>
                                      <th className="px-4 py-3">VLAN / Mode</th>
                                      <th className="px-4 py-3">Speed / MTU</th>
                                      <th className="px-4 py-3">Neighbor (LLDP)</th>
                                      <th className="px-4 py-3 text-right">Errors (In/Out)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/40 text-slate-300">
                                    {(sw.interfaces || []).map((inf) => {
                                      const isPortUp = inf.status.toLowerCase() === 'up';
                                      return (
                                        <tr key={inf.name} className="hover:bg-slate-900/30">
                                          <td className="px-4 py-2.5 font-mono font-medium text-slate-200">
                                            {inf.name}
                                          </td>
                                          <td className="px-4 py-2.5">
                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium text-[10px] ${
                                              isPortUp ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/20' : 'bg-slate-900 text-slate-500'
                                            }`}>
                                              <span className={`h-1.5 w-1.5 rounded-full ${isPortUp ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                              {inf.status.toUpperCase()}
                                            </span>
                                          </td>
                                          <td className="px-4 py-2.5">
                                            <div className="font-medium text-slate-300">
                                              {inf.switchport_mode ? inf.switchport_mode.toUpperCase() : 'ACCESS'}
                                            </div>
                                            <div className="text-[10px] text-slate-500">
                                              VLAN: {inf.vlan || 'none'}
                                            </div>
                                          </td>
                                          <td className="px-4 py-2.5 font-mono text-slate-400">
                                            <div>{inf.speed_duplex || 'N/A'}</div>
                                            <div className="text-[10px] text-slate-500">MTU: {inf.mtu || 1500}</div>
                                          </td>
                                          <td className="px-4 py-2.5 font-medium text-slate-400">
                                            {inf.neighbor || (
                                              <span className="text-slate-600 italic">None detected</span>
                                            )}
                                          </td>
                                          <td className="px-4 py-2.5 text-right font-mono text-slate-400">
                                            {inf.errors_in ?? 0} / {inf.errors_out ?? 0}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* TAB CONTENT: VLANs */}
                            {activeTab === 'vlans' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {sw.vlans && sw.vlans.length > 0 ? (
                                  sw.vlans.map((vl) => (
                                    <div key={vl.vlan_id} className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-start gap-3">
                                      <div className="h-9 w-9 rounded-lg bg-indigo-950/50 border border-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
                                        <Hash className="h-4.5 w-4.5" />
                                      </div>
                                      <div className="overflow-hidden">
                                        <div className="text-slate-200 font-semibold text-sm">
                                          VLAN {vl.vlan_id}
                                        </div>
                                        <div className="text-xs text-slate-400 truncate">
                                          Name: {vl.name}
                                        </div>
                                        {vl.tagged_ports && vl.tagged_ports.length > 0 && (
                                          <div className="text-[10px] text-slate-500 mt-1 truncate">
                                            Tagged: {vl.tagged_ports.join(', ')}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="col-span-full py-6 text-center text-slate-500 text-sm">
                                    No active VLAN databases mapped to this switch.
                                  </div>
                                )}
                              </div>
                            )}

                            {/* TAB CONTENT: Hardware Components */}
                            {activeTab === 'hardware' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {sw.hardware_components && sw.hardware_components.length > 0 ? (
                                  sw.hardware_components.map((hw, idx) => (
                                    <div key={`${hw.name}-${idx}`} className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex items-start gap-3.5">
                                      <div className="h-10 w-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400 flex-shrink-0">
                                        {hw.type.toLowerCase().includes('cpu') ? (
                                          <Cpu className="h-5 w-5 text-indigo-400" />
                                        ) : hw.type.toLowerCase().includes('power') ? (
                                          <Server className="h-5 w-5 text-emerald-400" />
                                        ) : (
                                          <FileText className="h-5 w-5 text-purple-400" />
                                        )}
                                      </div>
                                      <div>
                                        <div className="text-slate-100 font-semibold text-sm">{hw.name}</div>
                                        <div className="text-xs text-slate-400 mt-0.5">{hw.description || hw.type}</div>
                                        <div className="grid grid-cols-2 gap-x-4 mt-2 text-[10px] font-mono text-slate-500">
                                          <span>Status: <span className={hw.status === 'OK' || hw.status === 'Normal' ? 'text-emerald-400' : 'text-rose-400'}>{hw.status}</span></span>
                                          {hw.serial_number && <span>S/N: {hw.serial_number}</span>}
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="col-span-full py-6 text-center text-slate-500 text-sm">
                                    No detailed hardware subcomponents discovered.
                                  </div>
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

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/20">
            <div className="text-xs text-slate-400">
              Showing page <span className="font-semibold text-slate-300">{page}</span> of <span className="font-semibold text-slate-300">{totalPages}</span> ({totalItems} total switches)
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium disabled:opacity-40"
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

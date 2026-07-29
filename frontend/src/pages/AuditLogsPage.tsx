import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import {
  ShieldAlert,
  RefreshCw,
  User as UserIcon,
  Search,
  Download,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Layers,
  Terminal,
  Globe,
  Activity,
  CheckCircle,
  AlertCircle
} from 'lucide-react';


interface AuditLogEntry {
  log_id: string;
  audit_id: string;
  user_email: string;
  tenant_name: string;
  action: string;
  resource: string;
  status: string;
  detail: string;
  created_at: string;
  ip_address?: string;
  user_agent?: string;
  request_method?: string;
  request_url?: string;
  payload?: any;
}

export const AuditLogsPage: React.FC = () => {
  const { token, user, selectedTenant } = useAuth();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [actionFilter, setActionFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateRange, setDateRange] = useState('ALL'); // ALL, TODAY, 24H, 7D, 30D
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 50;

  // Selected Log Drawer
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const isPlatformAdmin = user?.role === 'Platform Admin' || user?.role === 'platform_admin';

  useEffect(() => {
    if (!isPlatformAdmin) return;
    fetchLogs();
  }, [token, selectedTenant, isPlatformAdmin, page, actionFilter, statusFilter, dateRange]);

  const getStartDate = () => {
    if (dateRange === 'ALL') return '';
    const now = new Date();
    if (dateRange === 'TODAY') {
      return new Date(now.setHours(0, 0, 0, 0)).toISOString();
    }
    if (dateRange === '24H') {
      return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    }
    if (dateRange === '7D') {
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (dateRange === '30D') {
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    }
    return '';
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;
      
      const start = getStartDate();
      let url = `/api/v5/admin/audit-logs?page=${page}&limit=${pageSize}`;
      if (actionFilter !== 'ALL') url += `&action=${encodeURIComponent(actionFilter)}`;
      if (statusFilter !== 'ALL') url += `&status=${encodeURIComponent(statusFilter)}`;
      if (start) url += `&start_date=${encodeURIComponent(start)}`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      if (selectedTenant) url += `&tenant_id=${encodeURIComponent(selectedTenant)}`;

      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotalCount(data.total_count || 0);
        setTotalPages(data.pages || 1);
      }
    } catch (e) {
      console.error("Failed to load audit logs", e);
    }
    setLoading(false);
  };

  // Perform text search locally on submit or when enter is pressed
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const exportToCSV = () => {
    if (logs.length === 0) return;
    const headers = ["Timestamp", "User", "Tenant", "Action", "Resource", "Status", "IP Address", "User Agent", "Method", "Request URL", "Detail"];
    const rows = logs.map(l => [
      l.created_at ? new Date(l.created_at).toLocaleString() : '',
      l.user_email || 'system',
      l.tenant_name || '',
      l.action,
      l.resource || '',
      l.status,
      l.ip_address || '',
      l.user_agent || '',
      l.request_method || '',
      l.request_url || '',
      l.detail || ''
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sdn_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isPlatformAdmin) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-2 min-h-[50vh]">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4 stroke-[1.25]" />
        <h3 className="text-xl font-bold font-display text-atlas-ink mb-1">Access Denied</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Audit logs are only accessible to Platform Administrators.
        </p>
      </Card>
    );
  }

  // Visual severity categorization for logging actions
  const getActionBadgeColor = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('write') || act.includes('delete') || act.includes('grant') || act.includes('revoke')) {
      return 'bg-amber-50 text-amber-700 border border-amber-100';
    }
    if (act.includes('submit_live') || act.includes('rollback') || act.includes('push')) {
      return 'bg-rose-50 text-rose-700 border border-rose-100';
    }
    return 'bg-slate-50 text-slate-600 border border-slate-100';
  };

  return (
    <div className="space-y-6 font-sans relative">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">Security Audit Logs</h1>
          <p className="text-xs text-slate-400 mt-1">Tamper-evident audit trail of operator configurations and platform events</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportToCSV} disabled={logs.length === 0} className="btn-secondary flex items-center gap-1.5 py-1.5 px-3 text-xs disabled:opacity-50">
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Export CSV
          </button>
          <button onClick={fetchLogs} className="btn-primary flex items-center gap-1.5 py-1.5 px-3 text-xs font-semibold">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <Card className="p-4 bg-white/70 backdrop-blur-md border border-slate-200/50 shadow-sm rounded-xl">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
          
          {/* Action Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-lg">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(1); }}
              className="bg-transparent border-none text-xs font-semibold text-slate-600 outline-none cursor-pointer pr-1"
            >
              <option value="ALL">All Actions</option>
              <option value="users:write">users:write</option>
              <option value="users:grant_cross_tenant">users:grant_cross_tenant</option>
              <option value="policy:submit_live">policy:submit_live</option>
              <option value="switch_config:push">switch_config:push</option>
              <option value="rollback:run">rollback:run</option>
              <option value="compliance:run">compliance:run</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-lg">
            <CheckCircle className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="bg-transparent border-none text-xs font-semibold text-slate-600 outline-none cursor-pointer pr-1"
            >
              <option value="ALL">All Statuses</option>
              <option value="success">Success</option>
              <option value="denied">Denied</option>
              <option value="error">Error</option>
            </select>
          </div>

          {/* Timeframe Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-lg">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={dateRange}
              onChange={e => { setDateRange(e.target.value); setPage(1); }}
              className="bg-transparent border-none text-xs font-semibold text-slate-600 outline-none cursor-pointer pr-1"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="24H">Last 24 Hours</option>
              <option value="7D">Last 7 Days</option>
              <option value="30D">Last 30 Days</option>
            </select>
          </div>

          {/* Search query input */}
          <div className="flex-1 min-w-[200px] flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-lg">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search user, action or details..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent border-none text-xs text-slate-700 outline-none w-full"
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(''); setPage(1); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          
          <button type="submit" className="btn-secondary py-1 px-3 text-xs font-semibold bg-slate-100 hover:bg-slate-200 border border-slate-300/40 text-slate-700">
            Search
          </button>
          
          <span className="text-[10px] text-slate-400 font-semibold px-1">
            {totalCount} events found
          </span>
        </form>
      </Card>

      {/* Main Table Card */}
      <Card className="p-0 overflow-hidden shadow-md border border-slate-200/60 rounded-xl bg-white">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
            Loading security logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-xs">
            <AlertCircle className="w-8 h-8 text-slate-300 mb-2 stroke-[1.25]" />
            No audit log entries found matching filters.
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100/80 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="text-left py-3 px-4">Timestamp</th>
                    <th className="text-left py-3 px-4">User</th>
                    <th className="text-left py-3 px-4">Tenant</th>
                    <th className="text-left py-3 px-4">Action</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-left py-3 px-4">Source IP</th>
                    <th className="text-left py-3 px-4">Detail</th>
                    <th className="text-center py-3 px-4 w-[60px]">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map(log => (
                    <tr key={log.log_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 text-slate-500 font-mono whitespace-nowrap">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200/50">
                            <UserIcon className="w-2.5 h-2.5 text-slate-500" />
                          </div>
                          <span className="text-slate-700 font-semibold">{log.user_email || 'system'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">{log.tenant_name || 'System'}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono uppercase ${getActionBadgeColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                          log.status === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                          log.status === 'denied' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                          'bg-amber-50 text-amber-700 border border-amber-100'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono">{log.ip_address || '-'}</td>
                      <td className="py-3 px-4 text-slate-500 max-w-[220px] truncate" title={log.detail}>
                        {log.detail || '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1 rounded hover:bg-slate-100 text-indigo-600 hover:text-indigo-800 transition-colors"
                          title="View metadata payload"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 bg-slate-50/50 border-t border-slate-100">
                <span className="text-xs text-slate-400">
                  Showing page <b>{page}</b> of <b>{totalPages}</b> (Total {totalCount} logs)
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Slide-out Inspector Drawer */}
      {selectedLog && (
        <>
          {/* Backdrop Overlay */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 transition-opacity"
            onClick={() => setSelectedLog(null)}
          />

          {/* Drawer Element */}
          <div className="fixed inset-y-0 right-0 z-50 w-[520px] bg-white shadow-2xl border-l border-slate-200 flex flex-col transform transition-transform duration-300 animate-slide-in">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-base text-slate-800">Audit Incident Inspector</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">UUID: {selectedLog.audit_id}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700">
              
              {/* Event Overview Section */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Incident Time</div>
                  <div className="font-semibold text-slate-700 font-mono">
                    {selectedLog.created_at ? new Date(selectedLog.created_at).toLocaleString() : '-'}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Status Result</div>
                  <span className={`inline-block font-extrabold px-2 py-0.5 rounded text-[10px] uppercase ${
                    selectedLog.status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {selectedLog.status}
                  </span>
                </div>
              </div>

              {/* Core Metadata Fields */}
              <div className="space-y-3 bg-slate-50/50 rounded-xl p-4 border border-slate-200/50">
                <h4 className="font-bold text-slate-700 uppercase text-[10px] tracking-wider mb-2">Request Context</h4>
                
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-slate-400 flex items-center gap-1.5"><UserIcon className="w-3.5 h-3.5" /> Actor User</span>
                  <span className="font-bold text-slate-700">{selectedLog.user_email || 'system'}</span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-slate-400 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Target Tenant</span>
                  <span className="font-semibold text-slate-700">{selectedLog.tenant_name || 'System'}</span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-slate-400 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> IP Address</span>
                  <span className="font-mono text-slate-700">{selectedLog.ip_address || 'Internal/Mock'}</span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-slate-400 flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> Action Event</span>
                  <span className="font-mono bg-slate-200/80 px-2 py-0.5 rounded text-[10px] text-slate-600 font-bold">{selectedLog.action}</span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-slate-400 flex items-center gap-1.5">HTTP Method</span>
                  <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase text-[10px]">
                    {selectedLog.request_method || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Endpoint target */}
              {selectedLog.request_url && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Request Path URI</div>
                  <div className="p-2.5 bg-slate-800 rounded-lg text-slate-200 font-mono break-all border border-slate-700">
                    {selectedLog.request_url}
                  </div>
                </div>
              )}

              {/* User Agent */}
              {selectedLog.user_agent && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">User Agent Header</div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 font-mono leading-relaxed">
                    {selectedLog.user_agent}
                  </div>
                </div>
              )}

              {/* Log Event Details Text */}
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase font-bold text-slate-400">Incident Details</div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 font-medium leading-relaxed">
                  {selectedLog.detail || 'No additional event details provided.'}
                </div>
              </div>

              {/* Payload payload JSON inspection */}
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase font-bold text-slate-400">Serialized Event Payload (JSON)</div>
                {selectedLog.payload ? (
                  <pre className="p-3 bg-slate-900 rounded-lg text-emerald-400 font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800 max-h-[220px]">
                    {JSON.stringify(selectedLog.payload, null, 2)}
                  </pre>
                ) : (
                  <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-slate-400 text-center italic">
                    No structured metadata payload recorded for this event.
                  </div>
                )}
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AuditLogsPage;

import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import {
  ShieldAlert,
  RefreshCw,
  ChevronDown,
  Filter,
  User as UserIcon
} from 'lucide-react';

interface AuditLogEntry {
  log_id: string;
  user_email: string;
  tenant_name: string;
  action: string;
  resource: string;
  status: string;
  detail: string;
  created_at: string;
}

export const AuditLogsPage: React.FC = () => {
  const { token, user, selectedTenant } = useAuth();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const isPlatformAdmin = user?.role === 'Platform Admin' || user?.role === 'platform_admin';

  useEffect(() => {
    if (!isPlatformAdmin) return;
    fetchLogs();
  }, [token, selectedTenant, isPlatformAdmin]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      if (selectedTenant) headers['X-Tenant-ID'] = selectedTenant;
      const res = await fetch(`/api/v5/admin/audit-logs?limit=200`, { headers });
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch {}
    setLoading(false);
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

  const filteredLogs = logs.filter(l => {
    const matchesAction = actionFilter === 'ALL' || l.action.toLowerCase().includes(actionFilter.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || l.status === statusFilter;
    return matchesAction && matchesStatus;
  });

  const totalPages = Math.ceil(filteredLogs.length / pageSize);
  const paginatedLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize);

  const uniqueActions = [...new Set(logs.map(l => l.action))].sort();

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">Audit Logs</h1>
          <p className="text-xs text-slate-400 mt-1">Security audit trail of all user actions across the platform</p>
        </div>
        <button onClick={fetchLogs} className="btn-secondary flex items-center gap-1.5">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <Filter className="w-4 h-4 text-slate-400" />
          <div className="relative">
            <select
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(1); }}
              className="appearance-none bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 py-1.5 pl-3 pr-8 rounded-lg outline-none cursor-pointer"
            >
              <option value="ALL">All Actions</option>
              {uniqueActions.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="appearance-none bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 py-1.5 pl-3 pr-8 rounded-lg outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="success">Success</option>
              <option value="denied">Denied</option>
              <option value="error">Error</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
          <span className="text-[10px] text-slate-400 font-medium">
            {filteredLogs.length} entries
          </span>
        </div>
      </Card>

      {/* Logs Table */}
      <Card className="p-5">
        {loading ? (
          <div className="text-slate-400 text-xs py-10 text-center">Loading audit logs...</div>
        ) : paginatedLogs.length === 0 ? (
          <div className="text-slate-400 text-xs py-10 text-center">No audit log entries found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Timestamp</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">User</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Tenant</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Action</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Resource</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-400 uppercase tracking-wider">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map(log => (
                    <tr key={log.log_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 text-slate-500 font-mono whitespace-nowrap">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="w-3 h-3 text-slate-400" />
                          <span className="text-slate-700 font-semibold">{log.user_email || 'system'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{log.tenant_name || '-'}</td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono">{log.resource || '-'}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          log.status === 'success' ? 'bg-emerald-50 text-emerald-600' :
                          log.status === 'denied' ? 'bg-rose-50 text-rose-600' :
                          'bg-amber-50 text-amber-600'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-[200px] truncate" title={log.detail}>
                        {log.detail || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                <span className="text-[10px] text-slate-400">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-secondary py-1 px-3 text-[10px] disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="btn-secondary py-1 px-3 text-[10px] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default AuditLogsPage;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { fetchComplianceRules, updateComplianceRule, fetchComplianceLatest, fetchComplianceHistory, runComplianceAudit, fetchComplianceRunDetail, remediateComplianceFinding } from '../lib/api';
import {
  ShieldCheck,
  ShieldAlert,
  Play,
  Check,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  User,
  Loader2,
  XCircle,
  RotateCcw,
  History,
  Server,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Finding {
  finding_id: string;
  switch_id: string;
  switch_hostname: string;
  switch_vendor: string;
  switch_ip: string | null;
  rule_name: string;
  severity: string;
  detail: string | null;
  expected: string | null;
  remediation_status: 'open' | 'pending' | 'success' | 'failed';
  remediation_task_id: string | null;
  remediation_triggered_by: string | null;
  remediation_triggered_at: string | null;
  resolved_at: string | null;
  remediation_error: string | null;
}

interface Pagination {
  page: number;
  page_size: number;
  total_pages: number;
  total_items: number;
}

interface ComplianceData {
  run_id: string;
  started_at: string;
  completed_at: string | null;
  triggered_by: string | null;
  status: string;
  summary: {
    compliance_score_pct?: number;
    switches_audited?: number;
    total_checks?: number;
    passed_checks?: number;
    failed_checks?: number;
    open?: number;
    pending?: number;
    resolved?: number;
    failed?: number;
  };
  findings: Finding[];
  pagination?: Pagination;
}

interface HistoryRun {
  run_id: string;
  started_at: string;
  completed_at: string | null;
  triggered_by: string;
  status: string;
  compliance_score_pct: number;
  total_findings: number;
  passed_checks: number;
  failed_checks: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const severityColor = (s: string) => {
  switch (s) {
    case 'critical': return 'bg-red-50 text-red-600 border-red-200';
    case 'warning':  return 'bg-amber-50 text-amber-600 border-amber-200';
    default:         return 'bg-slate-50 text-slate-500 border-slate-200';
  }
};

const remStatusBadge = (status: Finding['remediation_status'], taskId: string | null, error?: string | null) => {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
          <Loader2 className="w-3 h-3 animate-spin" />
          Remediating{taskId ? ` · ${taskId.slice(0,8)}…` : ''}
        </span>
      );
    case 'success':
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
          <CheckCircle className="w-3 h-3" />
          Fixed
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200" title={error || ''}>
          <XCircle className="w-3 h-3" />
          Failed
        </span>
      );
    default:
      return null;
  }
};

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const SwitchGroup: React.FC<{
  hostname: string;
  vendor: string;
  ip: string | null;
  findings: Finding[];
  onRemediate: (id: string) => void;
  remediating: Set<string>;
}> = ({ hostname, vendor, ip, findings, onRemediate, remediating }) => {
  const [open, setOpen] = useState(false);

  const openCount   = findings.filter(f => f.remediation_status === 'open').length;
  const pendingCount = findings.filter(f => f.remediation_status === 'pending').length;
  const fixedCount  = findings.filter(f => f.remediation_status === 'success').length;

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden transition-all">
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          <Server className="w-4 h-4 text-slate-500" />
          <div>
            <span className="font-bold text-slate-800 text-sm">{hostname}</span>
            <span className="ml-2 text-[10px] text-slate-400 font-mono">{vendor}</span>
            {ip && <span className="ml-2 text-[10px] text-slate-400 font-mono">{ip}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {openCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
              {openCount} open
            </span>
          )}
          {pendingCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
              {pendingCount} remediating
            </span>
          )}
          {fixedCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
              {fixedCount} fixed
            </span>
          )}
        </div>
      </button>

      {/* Findings list */}
      {open && (
        <div className="divide-y divide-slate-50">
          {findings.map(f => (
            <div key={f.finding_id} className={`px-5 py-3.5 flex items-start justify-between gap-4 transition-colors ${
              f.remediation_status === 'success' ? 'bg-emerald-50/30 opacity-70' : 'bg-white hover:bg-slate-50/60'
            }`}>
              <div className="space-y-1.5 flex-grow min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${severityColor(f.severity)}`}>
                    {f.severity}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 truncate">{f.rule_name}</span>
                </div>

                <div className="flex gap-4 font-mono text-[10px] text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                  <div className="min-w-0">
                    <span className="text-slate-400 font-sans uppercase tracking-wider text-[9px] font-bold block mb-0.5">Expected</span>
                    <code className="truncate block">{f.expected || 'N/A'}</code>
                  </div>
                  {f.detail && (
                    <div className="min-w-0">
                      <span className="text-slate-400 font-sans uppercase tracking-wider text-[9px] font-bold block mb-0.5">Actual</span>
                      <code className="text-rose-600 truncate block">{f.detail}</code>
                    </div>
                  )}
                </div>

                {/* Remediation meta */}
                {f.remediation_triggered_by && (
                  <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    <User className="w-2.5 h-2.5" />
                    {f.remediation_triggered_by} · {fmtDate(f.remediation_triggered_at)}
                    {f.resolved_at && <> · Fixed: {fmtDate(f.resolved_at)}</>}
                  </p>
                )}
              </div>

              <div className="shrink-0 pt-0.5">
                {f.remediation_status === 'open' && (
                  <button
                    onClick={() => onRemediate(f.finding_id)}
                    disabled={remediating.has(f.finding_id)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-600 bg-white hover:bg-emerald-50 transition-colors disabled:opacity-50"
                  >
                    {remediating.has(f.finding_id)
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Queuing…</>
                      : <><Check className="w-3 h-3" /> Remediate</>
                    }
                  </button>
                )}
                {f.remediation_status !== 'open' && remStatusBadge(f.remediation_status, f.remediation_task_id, f.remediation_error)}
                {f.remediation_status === 'failed' && f.remediation_error && (
                  <p className="text-[9px] text-red-400 ml-0.5 mt-0.5 max-w-xs truncate" title={f.remediation_error}>{f.remediation_error}</p>
                )}
                {f.remediation_status === 'failed' && (
                  <button
                    onClick={() => onRemediate(f.finding_id)}
                    className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                  >
                    <RotateCcw className="w-2.5 h-2.5" /> Retry
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const Compliance: React.FC = () => {
  const { selectedTenant } = useAuth();

  const [data, setData]           = useState<ComplianceData | null>(null);
  const [error, setError]         = useState('');
  const [trendData, setTrendData] = useState<{ name: string; score: number }[]>([]);
  const [history, setHistory]     = useState<HistoryRun[]>([]);

  const [activeTab, setActiveTab]         = useState<'findings' | 'rules' | 'history'>('findings');
  const [rules, setRules]                 = useState<any[]>([]);
  const [rulesLoading, setRulesLoading]   = useState(false);

  // Filters & pagination
  const [page, setPage]             = useState(1);
  const [severityFilter, setSeverityFilter] = useState('');
  const [switchFilter, setSwitchFilter]     = useState('');
  const [statusFilter, setStatusFilter]     = useState('');

  // Remediation state
  const [remediating, setRemediating] = useState<Set<string>>(new Set());

  // Audit modal
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditProgress, setAuditProgress]       = useState(0);
  const [auditMessage, setAuditMessage]         = useState('');
  const [auditCompleted, setAuditCompleted]     = useState(false);

  // Historic report modal state
  const [selectedRunId, setSelectedRunId]       = useState<string | null>(null);
  const [runDetails, setRunDetails]             = useState<any | null>(null);
  const [runDetailsLoading, setRunDetailsLoading] = useState(false);

  // Auto-refresh ref
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load compliance data (paginated) ──────────────────────────────────────
  const loadData = useCallback(async (p = 1) => {
    try {
      const params = new URLSearchParams({ page: String(p), page_size: '25' });
      if (severityFilter) params.set('severity', severityFilter);
      if (switchFilter)   params.set('switch_id', switchFilter);
      if (statusFilter)   params.set('status', statusFilter);

      const json = await fetchComplianceLatest(params, selectedTenant);
      if (!json) { setError('API unavailable'); return; }
      setData(json);
      setError('');
    } catch {
      setError('Failed to load compliance data');
    }
  }, [selectedTenant, severityFilter, switchFilter, statusFilter]);

  // ── Load trend history ────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    try {
      const runs: HistoryRun[] = await fetchComplianceHistory(selectedTenant);
      if (runs) {
        setHistory(runs);
        setTrendData(runs.slice().reverse().map(r => ({
          name: new Date(r.started_at).toLocaleDateString('en-GB', { month: '2-digit', day: '2-digit' }),
          score: r.compliance_score_pct || 0
        })));
      }
    } catch { /* ignore */ }
  }, [selectedTenant]);

  // ── Load rules ────────────────────────────────────────────────────────────
  const loadRules = useCallback(async (quiet = false) => {
    if (!quiet) setRulesLoading(true);
    try { setRules(await fetchComplianceRules() || []); }
    catch { /* ignore */ }
    finally { if (!quiet) setRulesLoading(false); }
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadData(1);
    loadHistory();
    loadRules();
  }, [selectedTenant]);

  // ── Re-load when filters/page change ─────────────────────────────────────
  useEffect(() => { loadData(page); }, [page, severityFilter, switchFilter, statusFilter]);

  // ── Auto-refresh when pending remediations exist ──────────────────────────
  useEffect(() => {
    const hasPending = (data?.findings || []).some(f => f.remediation_status === 'pending');
    if (hasPending) {
      refreshTimer.current = setInterval(() => loadData(page), 15000);
    } else {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    }
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [data, page, loadData]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRunAudit = async () => {
    setIsAuditModalOpen(true);
    setAuditProgress(10);
    setAuditCompleted(false);
    setAuditMessage('Initializing golden config scanner…');

    const interval = setInterval(() => setAuditProgress(p => p >= 85 ? p : p + 5), 400);
    try {
      setAuditMessage('Scanning running configs across fabric switches…');
      const res = await runComplianceAudit(selectedTenant);
      clearInterval(interval);
      if (res.ok) {
        setAuditProgress(100);
        setAuditCompleted(true);
        setAuditMessage('Golden configuration audit completed!');
        await loadData(1);
        await loadHistory();
        setPage(1);
      } else {
        throw new Error(res.errorText || '');
      }
    } catch (e: any) {
      clearInterval(interval);
      setAuditProgress(100);
      setAuditCompleted(true);
      setAuditMessage(`Audit failed: ${e.message || 'Server error'}`);
    }
  };

  const handleViewReport = async (runId: string) => {
    setSelectedRunId(runId);
    setRunDetailsLoading(true);
    setRunDetails(null);
    try {
      const json = await fetchComplianceRunDetail(runId, selectedTenant);
      if (json) {
        setRunDetails(json);
      } else {
        alert("Failed to load compliance report details");
      }
    } catch {
      alert("Error loading compliance report details");
    } finally {
      setRunDetailsLoading(false);
    }
  };

  const handleDownloadReport = (details: any) => {
    if (!details) return;
    const blob = new Blob([JSON.stringify(details, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `compliance_report_${details.run_id}_${details.started_at.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRemediate = async (findingId: string) => {
    setRemediating(prev => new Set(prev).add(findingId));
    try {
      const res = await remediateComplianceFinding(findingId, selectedTenant);
      if (res.ok) {
        // Optimistic update: mark as pending immediately
        setData(prev => prev ? {
          ...prev,
          findings: prev.findings.map(f =>
            f.finding_id === findingId ? { ...f, remediation_status: 'pending' } : f
          )
        } : prev);
      } else {
        alert(`Remediation failed: ${res.errorText || ''}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setRemediating(prev => { const s = new Set(prev); s.delete(findingId); return s; });
    }
  };

  const handleToggleRule = async (ruleId: string, current: boolean) => {
    setRules(prev => prev.map(r => r.rule_id === ruleId ? { ...r, is_active: !current } : r));
    try { await updateComplianceRule(ruleId, { is_active: !current }); loadRules(true); }
    catch { setRules(prev => prev.map(r => r.rule_id === ruleId ? { ...r, is_active: current } : r)); }
  };

  const handleSeverityChange = async (ruleId: string, val: string) => {
    const orig = rules.find(r => r.rule_id === ruleId)?.severity || 'info';
    setRules(prev => prev.map(r => r.rule_id === ruleId ? { ...r, severity: val } : r));
    try { await updateComplianceRule(ruleId, { severity: val }); loadRules(true); }
    catch { setRules(prev => prev.map(r => r.rule_id === ruleId ? { ...r, severity: orig } : r)); }
  };

  // ── Group findings by switch ──────────────────────────────────────────────
  const groupedBySwtich = (data?.findings || []).reduce((acc, f) => {
    const key = f.switch_id;
    if (!acc[key]) acc[key] = { hostname: f.switch_hostname, vendor: f.switch_vendor, ip: f.switch_ip, findings: [] };
    acc[key].findings.push(f);
    return acc;
  }, {} as Record<string, { hostname: string; vendor: string; ip: string | null; findings: Finding[] }>);

  // ── Score gauge ───────────────────────────────────────────────────────────
  const score = data?.summary?.compliance_score_pct ?? 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const isHealthy = score >= 80;
  const gaugeColor = isHealthy ? '#42CCB2' : '#E26C48';

  // Unique switches for filter dropdown
  const uniqueSwitches = data ? Object.values(groupedBySwtich || {}).map(g => ({ id: Object.keys(groupedBySwtich || {}).find(k => (groupedBySwtich || {})[k] === g) || '', hostname: g.hostname })) : [];

  const pagination = data?.pagination;

  return (
    <div className="space-y-6 font-sans">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">Compliance Overview</h1>
          {data?.triggered_by && (
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Last run: {fmtDate(data.started_at)}
              <User className="w-3 h-3 ml-1" />
              by <span className="font-semibold text-slate-500">{data.triggered_by}</span>
            </p>
          )}
          {!data?.triggered_by && (
            <p className="text-xs text-slate-400 mt-1">Golden Configuration Auditing and Remediation</p>
          )}
        </div>
        <button onClick={handleRunAudit} className="btn-primary flex items-center gap-1.5">
          <Play className="w-4 h-4" />
          <span>Run Compliance Audit</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex gap-3 text-rose-700 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* ── Stats Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

        {/* Score Gauge */}
        <Card className="lg:col-span-4 flex flex-col items-center justify-center p-6 text-center">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Fabric Score Gauge</span>
          <div className="relative flex items-center justify-center mb-2">
            <svg viewBox="0 0 100 100" className="w-36 h-36">
              <circle cx="50" cy="50" r={radius} stroke="#EBEBF5" strokeWidth="7" fill="none" opacity="0.3" />
              <circle cx="50" cy="50" r={radius} stroke={gaugeColor} strokeWidth="7" fill="none"
                strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 ease-out" transform="rotate(-90 50 50)" />
            </svg>
            <div className="absolute inset-0 flex flex-col justify-center items-center">
              <span className="text-3xl font-bold font-display leading-none" style={{ color: gaugeColor }}>{score}%</span>
              <span className="text-[10px] text-slate-400 mt-1 uppercase font-semibold">Compliance</span>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${isHealthy ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            {isHealthy ? 'System Compliant' : 'Drift Alert Active'}
          </span>
        </Card>

        {/* Summary Stats */}
        <div className="lg:col-span-4 grid grid-rows-4 gap-3">
          <Card className="flex items-center justify-between py-3 px-5">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Open Violations</span>
              <span className="text-xl font-bold font-display text-rose-600">{data?.summary?.open ?? 0}</span>
            </div>
            <ShieldAlert className="w-7 h-7 text-rose-400" />
          </Card>
          <Card className="flex items-center justify-between py-3 px-5">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Remediating</span>
              <span className="text-xl font-bold font-display text-blue-600">{data?.summary?.pending ?? 0}</span>
            </div>
            <Loader2 className="w-7 h-7 text-blue-400" />
          </Card>
          <Card className="flex items-center justify-between py-3 px-5">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fixed This Run</span>
              <span className="text-xl font-bold font-display text-emerald-600">{data?.summary?.resolved ?? 0}</span>
            </div>
            <ShieldCheck className="w-7 h-7 text-emerald-400" />
          </Card>
          <Card className="flex items-center justify-between py-3 px-5">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Failed Remediations</span>
              <span className="text-xl font-bold font-display text-slate-700">{data?.summary?.failed ?? 0}</span>
            </div>
            <XCircle className="w-7 h-7 text-slate-400" />
          </Card>
        </div>

        {/* Trend Chart */}
        <Card className="lg:col-span-4 flex flex-col">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Compliance Score History</span>
          <div className="flex-grow">
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="name" fontSize={9} stroke="#6B6B85" />
                <YAxis domain={[0, 100]} fontSize={9} stroke="#6B6B85" />
                <Tooltip />
                <Area type="monotone" dataKey="score" stroke={gaugeColor} fill={gaugeColor} fillOpacity={0.06} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ── Tab Bar ────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200">
        {(['findings', 'rules', 'history'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 pb-3 text-xs uppercase tracking-wider font-extrabold border-b-2 transition-all duration-200 ${
              activeTab === tab ? 'border-atlas-primary text-atlas-primary' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}>
            {tab === 'findings' && `Open Findings (${data?.summary?.open ?? 0})`}
            {tab === 'rules' && `Audit Policies (${rules.length})`}
            {tab === 'history' && <span className="flex items-center gap-1"><History className="w-3.5 h-3.5" />Run History</span>}
          </button>
        ))}
      </div>

      {/* ── Findings Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'findings' && (
        <Card>
          {/* Filters bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4 mb-4">
            <h3 className="text-base font-bold font-display text-atlas-ink">
              Golden Configuration Findings
              {pagination && <span className="ml-2 text-xs font-normal text-slate-400">({pagination.total_items} total)</span>}
            </h3>
            <div className="flex gap-2 flex-wrap">
              {/* Switch filter */}
              <div className="relative">
                <select value={switchFilter} onChange={e => { setSwitchFilter(e.target.value); setPage(1); }}
                  className="appearance-none bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 py-1.5 pl-3 pr-7 rounded-lg outline-none cursor-pointer">
                  <option value="">All Switches</option>
                  {uniqueSwitches.map(s => <option key={s.id} value={s.id}>{s.hostname}</option>)}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
              </div>
              {/* Severity filter */}
              <div className="relative">
                <select value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setPage(1); }}
                  className="appearance-none bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 py-1.5 pl-3 pr-7 rounded-lg outline-none cursor-pointer">
                  <option value="">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
              </div>
              {/* Status filter */}
              <div className="relative">
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                  className="appearance-none bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 py-1.5 pl-3 pr-7 rounded-lg outline-none cursor-pointer">
                  <option value="">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="pending">Remediating</option>
                  <option value="success">Fixed</option>
                  <option value="failed">Failed</option>
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Per-switch accordion groups */}
          <div className="space-y-3">
            {data?.status === 'NO_RUNS_EVALUATED' ? (
              <div className="text-center py-12 space-y-3">
                <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-500">No compliance scan has been run yet</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Run your first Golden Configuration compliance audit to discover configuration drifts on your switches.
                </p>
                <button onClick={handleRunAudit} className="btn-primary py-2 px-4 text-xs font-bold mt-2 mx-auto flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" /> Run First Audit
                </button>
              </div>
            ) : !groupedBySwtich || Object.keys(groupedBySwtich).length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No findings match the selected filters.</p>
            ) : (
              Object.entries(groupedBySwtich).map(([switchId, group]) => (
                <SwitchGroup
                  key={switchId}
                  hostname={group.hostname}
                  vendor={group.vendor}
                  ip={group.ip}
                  findings={group.findings}
                  onRemediate={handleRemediate}
                  remediating={remediating}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                Page {pagination.page} of {pagination.total_pages} · {pagination.total_items} findings
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                  const startPage = Math.max(1, pagination.page - 2);
                  const p = startPage + i;
                  if (p > pagination.total_pages) return null;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-8 h-8 text-xs font-bold rounded-lg border transition-colors ${
                        p === pagination.page
                          ? 'bg-atlas-primary text-white border-atlas-primary'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}>
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(pagination.total_pages, p + 1))}
                  disabled={pagination.page >= pagination.total_pages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Policies Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'rules' && (
        <Card>
          <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
            <div>
              <h3 className="text-base font-bold font-display text-atlas-ink">Active Audit Policies</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Toggle rules to exclude them from compliance scans</p>
            </div>
          </div>
          {rulesLoading ? (
            <div className="text-center py-8 text-xs text-slate-400">Loading active policies…</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">No policies configured in DB.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Rule Name</th>
                    <th className="py-3 px-4">Template Pattern</th>
                    <th className="py-3 px-4">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rules.map(rule => (
                    <tr key={rule.rule_id} className={`hover:bg-slate-50/50 transition-colors ${!rule.is_active ? 'opacity-50' : ''}`}>
                      <td className="py-4 px-4">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={rule.is_active}
                            onChange={() => handleToggleRule(rule.rule_id, rule.is_active)} />
                          <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-emerald-500" />
                        </label>
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-500 uppercase tracking-wider text-[9px]">{rule.category}</td>
                      <td className="py-4 px-4 font-bold text-slate-800">{rule.name}</td>
                      <td className="py-4 px-4 font-mono text-slate-600 text-[10px]">{rule.template_pattern}</td>
                      <td className="py-4 px-4">
                        <select value={rule.severity} onChange={e => handleSeverityChange(rule.rule_id, e.target.value)}
                          className="bg-white border border-slate-200 rounded px-2 py-1 text-[10px] font-bold text-slate-600 outline-none cursor-pointer">
                          <option value="info">Info</option>
                          <option value="warning">Warning</option>
                          <option value="critical">Critical</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── History Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <Card>
          <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
            <div>
              <h3 className="text-base font-bold font-display text-atlas-ink">Compliance Run History</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Last 30 days (older runs auto-purged)</p>
            </div>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No run history available. Run your first audit above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Date &amp; Time</th>
                    <th className="py-3 px-4">Triggered By</th>
                    <th className="py-3 px-4">Score</th>
                    <th className="py-3 px-4">Passed</th>
                    <th className="py-3 px-4">Failed</th>
                    <th className="py-3 px-4">Total Findings</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {history.map((run, idx) => (
                    <tr key={run.run_id} className={`hover:bg-slate-50/50 transition-colors ${idx === 0 ? 'font-semibold' : ''}`}>
                      <td className="py-3 px-4 font-mono text-[10px] text-slate-600">{fmtDate(run.started_at)}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <User className="w-3 h-3 text-slate-400" /> {run.triggered_by}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`font-bold text-sm ${run.compliance_score_pct >= 80 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {run.compliance_score_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-emerald-600 font-bold">{run.passed_checks}</td>
                      <td className="py-3 px-4 text-rose-600 font-bold">{run.failed_checks}</td>
                      <td className="py-3 px-4 text-slate-600">{run.total_findings}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                          run.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'
                        }`}>{run.status}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleViewReport(run.run_id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-atlas-primary hover:underline"
                        >
                          View Report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── Audit Progress Modal ────────────────────────────────────────────── */}
      {isAuditModalOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-xl shadow-2xl z-50 p-6 border text-center space-y-4">
            <h3 className="text-base font-bold font-display text-atlas-ink">Fabric Configuration Scan</h3>
            <div className="flex justify-center py-2">
              <RefreshCw className={`w-10 h-10 text-atlas-primary ${!auditCompleted ? 'animate-spin' : ''}`} />
            </div>
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-slate-700">{auditMessage}</div>
              {!auditCompleted && <div className="text-[10px] text-slate-400">Running compliance scan across fabric switches…</div>}
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className="bg-atlas-primary h-full transition-all duration-300" style={{ width: `${auditProgress}%` }} />
            </div>
            {auditCompleted && (
              <button onClick={() => setIsAuditModalOpen(false)} className="btn-primary w-full py-2 font-bold">
                Close &amp; View Findings
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Historical Report Detail Modal ───────────────────────────────────── */}
      {selectedRunId && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedRunId(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[85vh] bg-white rounded-2xl shadow-2xl z-50 flex flex-col border overflow-hidden animate-in fade-in duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-atlas-ink">Compliance Report Details</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Run ID: {selectedRunId}</p>
              </div>
              <div className="flex items-center gap-2">
                {runDetails && (
                  <button
                    onClick={() => handleDownloadReport(runDetails)}
                    className="btn-secondary py-1.5 px-3 font-bold text-xs flex items-center gap-1.5 border-slate-300 hover:bg-slate-100"
                  >
                    Download JSON
                  </button>
                )}
                <button
                  onClick={() => setSelectedRunId(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-grow p-6 overflow-y-auto space-y-5">
              {runDetailsLoading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                  <Loader2 className="w-10 h-10 animate-spin text-atlas-primary" />
                  <span className="text-xs font-semibold">Loading report details…</span>
                </div>
              )}

              {runDetails && (
                <>
                  {/* Summary Bar */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Score</span>
                      <span className={`text-base font-extrabold ${runDetails.summary?.compliance_score_pct >= 80 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {(runDetails.summary?.compliance_score_pct ?? 0).toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Date</span>
                      <span className="text-xs font-bold text-slate-700">{fmtDate(runDetails.started_at)}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Triggered By</span>
                      <span className="text-xs font-bold text-slate-700 flex items-center justify-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400 inline" /> {runDetails.triggered_by}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status Breakdown</span>
                      {(() => {
                        const counts = (runDetails.findings || []).reduce(
                          (acc: any, f: any) => {
                            const s = f.remediation_status || 'open';
                            acc[s] = (acc[s] || 0) + 1;
                            return acc;
                          },
                          {} as Record<string, number>
                        );
                        return (
                          <div className="flex items-center justify-center gap-2 mt-0.5 flex-wrap">
                            {(counts.open || 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                                {counts.open} Open
                              </span>
                            )}
                            {(counts.success || 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                                <CheckCircle className="w-2.5 h-2.5" /> {counts.success} Fixed
                              </span>
                            )}
                            {(counts.pending || 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" /> {counts.pending} Remediating
                              </span>
                            )}
                            {(counts.failed || 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                                <XCircle className="w-2.5 h-2.5" /> {counts.failed} Failed
                              </span>
                            )}
                            {Object.keys(counts).length === 0 && (
                              <span className="text-[9px] font-bold text-emerald-600">All Clear</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Findings list by switch */}
                  <div className="space-y-4 pt-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Audit Violations Map</h4>
                    {runDetails.findings?.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-8">Fully Compliant! No violations detected in this run.</p>
                    ) : (
                      // Group findings by switch inside details view
                      Object.entries(
                        (runDetails.findings || []).reduce((acc: any, f: any) => {
                          const key = f.switch_id;
                          if (!acc[key]) acc[key] = { hostname: f.switch_hostname, vendor: f.switch_vendor, findings: [] };
                          acc[key].findings.push(f);
                          return acc;
                        }, {})
                      ).map(([swId, group]: any) => (
                        <div key={swId} className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                            <span className="font-bold text-xs text-slate-800">{group.hostname} ({group.vendor})</span>
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                              {group.findings.length} findings
                            </span>
                          </div>
                          <div className="divide-y divide-slate-50">
                            {group.findings.map((f: any) => (
                              <div key={f.finding_id} className={`p-4 space-y-2 ${f.remediation_status === 'success' ? 'bg-emerald-50/30' : ''}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${severityColor(f.severity)}`}>
                                      {f.severity}
                                    </span>
                                    <span className="text-xs font-bold text-slate-700 truncate">{f.rule_name}</span>
                                  </div>
                                  <div className="shrink-0">
                                    {remStatusBadge(f.remediation_status, f.remediation_task_id, f.remediation_error) || (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                                        Open
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {f.remediation_status === 'failed' && f.remediation_error && (
                                  <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 text-[9px] text-red-600 font-mono leading-relaxed break-all">
                                    <span className="text-[8px] font-bold font-sans uppercase tracking-wider text-red-400 block mb-1">Failure Reason</span>
                                    {f.remediation_error}
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-4 font-mono text-[9px] text-slate-500 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                                  <div>
                                    <span className="text-slate-400 font-sans uppercase tracking-wider text-[8px] font-bold block mb-0.5">Expected</span>
                                    <code>{f.expected || 'N/A'}</code>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 font-sans uppercase tracking-wider text-[8px] font-bold block mb-0.5">Actual</span>
                                    <code className="text-rose-600">{f.detail || 'No detail available'}</code>
                                  </div>
                                </div>
                                {f.remediation_triggered_by && (
                                  <p className="text-[9px] text-slate-400 flex items-center gap-1">
                                    <User className="w-2.5 h-2.5" />
                                    {f.remediation_triggered_by} · {fmtDate(f.remediation_triggered_at)}
                                    {f.resolved_at && <> · Fixed: {fmtDate(f.resolved_at)}</>}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Compliance;

import React, { useState } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { 
  Download, 
  FileSpreadsheet, 
  ShieldAlert, 
  Network, 
  Cpu, 
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface ReportCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  reportType: 'inventory' | 'ipam' | 'compliance';
  filename: string;
  downloadHandler: (reportType: string, filename: string) => Promise<void>;
}

const ReportCard: React.FC<ReportCardProps> = ({ 
  title, 
  description, 
  icon, 
  reportType, 
  filename, 
  downloadHandler 
}) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadHandler(reportType, filename);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="p-6 border border-slate-800/80 bg-slate-900/20 backdrop-blur-xl hover:border-slate-700/80 transition-all duration-300">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-indigo-950/50 border border-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-slate-100">{title}</h3>
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">{description}</p>
          
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 mt-5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className={`h-4 w-4 ${downloading ? 'animate-bounce' : ''}`} />
            {downloading ? 'Compiling Report...' : 'Download CSV'}
          </button>
        </div>
      </div>
    </Card>
  );
};

export const ReportsPage: React.FC = () => {
  const { token, selectedTenant } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const triggerDownload = async (reportType: string, filename: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      if (selectedTenant) {
        headers['X-Tenant-ID'] = selectedTenant;
      }
      
      const response = await fetch(`/api/v5/visibility/reports/csv?report_type=${reportType}`, { headers });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setSuccessMsg(`Successfully downloaded ${filename}`);
      } else {
        const errDetail = await response.text();
        setErrorMsg(`Failed to generate report: ${errDetail || response.statusText}`);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Network error encountered while fetching CSV dataset.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="p-6 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
          Data Export & Reports
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Export system configuration state, telemetry parameters, and compliance details to structured CSV format.
        </p>
      </div>

      {/* Notification Toast */}
      {errorMsg && (
        <div className="flex items-center gap-3 p-4 bg-rose-950/60 border border-rose-500/20 text-rose-300 rounded-xl text-sm">
          <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-emerald-950/60 border border-emerald-500/20 text-emerald-300 rounded-xl text-sm">
          <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ReportCard
          title="Switch Inventory Report"
          description="Export all physical switches, serial numbers, IP configurations, lifecycle compliance metrics, and model names."
          icon={<Cpu className="h-6 w-6" />}
          reportType="inventory"
          filename={`switch-inventory-${new Date().toISOString().split('T')[0]}.csv`}
          downloadHandler={triggerDownload}
        />

        <ReportCard
          title="IPAM Subnets Report"
          description="Export details of all network subnets, fabric IDs, VRF instances, and system-wide CIDR address allocations."
          icon={<Network className="h-6 w-6" />}
          reportType="ipam"
          filename={`ipam-subnets-${new Date().toISOString().split('T')[0]}.csv`}
          downloadHandler={triggerDownload}
        />

        <ReportCard
          title="Compliance Findings Report"
          description="Export unresolved drift incidents, rule metrics, severity parameters, expected values, and remediation steps."
          icon={<ShieldAlert className="h-6 w-6" />}
          reportType="compliance"
          filename={`compliance-findings-${new Date().toISOString().split('T')[0]}.csv`}
          downloadHandler={triggerDownload}
        />
      </div>

      {/* Structured preview panel */}
      <Card className="p-6 border border-slate-800/80 bg-slate-900/10 backdrop-blur-xl">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-indigo-400" />
          Export Schema Details
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          All CSV tables are encoded in standard UTF-8 format and include standard headers for database migration.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-slate-400">
          <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/60">
            <div className="font-bold text-slate-300 mb-1">Switch Inventory Headers</div>
            <div>Switch ID, Hostname, Management IP, Vendor, Model, Role, Serial Number, OS Version, Status, Uptime</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/60">
            <div className="font-bold text-slate-300 mb-1">IPAM Subnets Headers</div>
            <div>Subnet ID, CIDR, Fabric ID, VRF ID, VLAN ID, Gateway, Scope, Status</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/60">
            <div className="font-bold text-slate-300 mb-1">Compliance Findings Headers</div>
            <div>Finding ID, Switch ID, Hostname, Rule Name, Vector, Severity, Expected, Actual, Status, Resolved At</div>
          </div>
        </div>
      </Card>
    </div>
  );
};

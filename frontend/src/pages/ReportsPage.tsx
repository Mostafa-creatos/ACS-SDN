import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { fetchReportCsv, fetchReportPreview } from '../lib/api';
import { 
  Download, 
  FileSpreadsheet, 
  ShieldAlert, 
  Network, 
  Cpu, 
  CheckCircle,
  AlertCircle,
  History,
  Fingerprint,
  Database,
  Eye,
  RefreshCw
} from 'lucide-react';

interface ReportCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  reportType: 'inventory' | 'ipam' | 'compliance' | 'stp' | 'ztp' | 'backups' | 'audit';
  filename: string;
  isSelected: boolean;
  onClick: () => void;
  downloadHandler: (reportType: string, filename: string) => Promise<void>;
}

const ReportCard: React.FC<ReportCardProps> = ({ 
  title, 
  description, 
  icon, 
  reportType, 
  filename, 
  isSelected,
  onClick,
  downloadHandler 
}) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(true);
    try {
      await downloadHandler(reportType, filename);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card 
      onClick={onClick}
      className={`p-6 border cursor-pointer hover:shadow-md transition-all duration-300 shadow-sm rounded-2xl ${
        isSelected ? 'border-atlas-primary bg-atlas-primary/5 shadow-md' : 'border-slate-100 bg-white'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 border transition-colors ${
          isSelected 
            ? 'bg-atlas-primary text-white border-atlas-primary' 
            : 'bg-slate-50 text-slate-600 border-slate-100'
        }`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-slate-800 font-display flex items-center gap-2">
            {title}
            {isSelected && <span className="h-2 w-2 rounded-full bg-atlas-primary animate-pulse" />}
          </h3>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{description}</p>
          
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 mt-5 px-4 py-2 bg-atlas-primary hover:bg-atlas-primary/95 active:bg-atlas-primary text-white rounded-xl font-semibold text-xs transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
  const { selectedTenant } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [activeType, setActiveType] = useState<'inventory' | 'ipam' | 'compliance' | 'stp' | 'ztp' | 'backups' | 'audit'>('inventory');
  const [previewData, setPreviewData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const loadPreview = useCallback(async (type: typeof activeType) => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const data = await fetchReportPreview(type, selectedTenant);
      if (data) {
        setPreviewData(data);
      } else {
        setPreviewError('Failed to fetch preview dataset from server.');
      }
    } catch (err) {
      console.error(err);
      setPreviewError('Error loading preview.');
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedTenant]);

  useEffect(() => {
    loadPreview(activeType);
  }, [activeType, loadPreview]);

  const triggerDownload = async (reportType: string, filename: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const { ok, blob, errorText } = await fetchReportCsv(reportType, selectedTenant);
      if (ok && blob) {
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
        setErrorMsg(`Failed to generate report: ${errorText}`);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Network error encountered while fetching CSV dataset.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="p-6 bg-white border border-slate-100 rounded-2xl shadow-sm">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 font-display">
          Data Export & Reports
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Export system configuration state, telemetry parameters, and compliance details to structured CSV format. Select a card to view a live preview below.
        </p>
      </div>

      {/* Notification Toast */}
      {errorMsg && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-sm shadow-sm animate-fade-in">
          <AlertCircle className="h-5 w-5 text-rose-500 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl text-sm shadow-sm animate-fade-in">
          <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0" />
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
          isSelected={activeType === 'inventory'}
          onClick={() => setActiveType('inventory')}
          downloadHandler={triggerDownload}
        />

        <ReportCard
          title="IPAM Subnets Report"
          description="Export details of all network subnets, fabric IDs, VRF instances, and system-wide CIDR address allocations."
          icon={<Network className="h-6 w-6" />}
          reportType="ipam"
          filename={`ipam-subnets-${new Date().toISOString().split('T')[0]}.csv`}
          isSelected={activeType === 'ipam'}
          onClick={() => setActiveType('ipam')}
          downloadHandler={triggerDownload}
        />

        <ReportCard
          title="Compliance Findings Report"
          description="Export unresolved drift incidents, rule metrics, severity parameters, expected values, and remediation steps."
          icon={<ShieldAlert className="h-6 w-6" />}
          reportType="compliance"
          filename={`compliance-findings-${new Date().toISOString().split('T')[0]}.csv`}
          isSelected={activeType === 'compliance'}
          onClick={() => setActiveType('compliance')}
          downloadHandler={triggerDownload}
        />

        <ReportCard
          title="Spanning Tree (STP) Report"
          description="Export STP states, priorities, bridge roles, designated roots, and interface forwarding profiles."
          icon={<Network className="h-6 w-6" />}
          reportType="stp"
          filename={`stp-topology-${new Date().toISOString().split('T')[0]}.csv`}
          isSelected={activeType === 'stp'}
          onClick={() => setActiveType('stp')}
          downloadHandler={triggerDownload}
        />

        <ReportCard
          title="ZTP Discovery Report"
          description="Export onboarding state, MAC addresses, hardware models, DHCP leases, and deployment errors for new fabrics."
          icon={<Database className="h-6 w-6" />}
          reportType="ztp"
          filename={`ztp-discovery-${new Date().toISOString().split('T')[0]}.csv`}
          isSelected={activeType === 'ztp'}
          onClick={() => setActiveType('ztp')}
          downloadHandler={triggerDownload}
        />

        <ReportCard
          title="Backups & Snapshots Report"
          description="Export manual and automatic switch configuration snapshot history, baseline flags, and config hashes."
          icon={<History className="h-6 w-6" />}
          reportType="backups"
          filename={`snapshots-history-${new Date().toISOString().split('T')[0]}.csv`}
          isSelected={activeType === 'backups'}
          onClick={() => setActiveType('backups')}
          downloadHandler={triggerDownload}
        />

        <ReportCard
          title="Platform Audit Logs"
          description="Export security logs, administrative API requests, resource changes, user IDs, and client IP allocations."
          icon={<Fingerprint className="h-6 w-6" />}
          reportType="audit"
          filename={`audit-logs-${new Date().toISOString().split('T')[0]}.csv`}
          isSelected={activeType === 'audit'}
          onClick={() => setActiveType('audit')}
          downloadHandler={triggerDownload}
        />
      </div>

      {/* Live Preview Panel */}
      <Card className="p-6 border border-slate-100 bg-white shadow-sm rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-atlas-primary" />
            <h3 className="text-lg font-bold text-slate-800 font-display">
              Live Preview: <span className="text-atlas-primary">{activeType.toUpperCase()}</span>
            </h3>
          </div>
          <button 
            onClick={() => loadPreview(activeType)}
            disabled={previewLoading}
            className="p-2 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-50"
            title="Refresh Preview"
          >
            <RefreshCw className={`h-4 w-4 ${previewLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {previewLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw className="h-8 w-8 animate-spin text-atlas-primary" />
            <span className="text-sm font-medium">Fetching real dataset sample...</span>
          </div>
        ) : previewError ? (
          <div className="py-8 text-center text-sm text-slate-400">
            {previewError}
          </div>
        ) : previewData && previewData.headers.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {previewData.headers.map((h, i) => (
                    <th key={i} className="p-3 font-semibold text-slate-600 font-sans tracking-wide truncate max-w-[200px]" title={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={previewData.headers.length} className="p-8 text-center text-slate-400 italic">
                      No records found in this dataset.
                    </td>
                  </tr>
                ) : (
                  previewData.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-slate-100 hover:bg-slate-50/50 last:border-0 font-mono text-[12px] text-slate-500">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="p-3 truncate max-w-[220px]" title={cell}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-slate-400">
            No preview available.
          </div>
        )}
      </Card>

      {/* Schema Details Panel */}
      <Card className="p-6 border border-slate-100 bg-slate-50/50 shadow-sm rounded-2xl">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2 font-display">
          <FileSpreadsheet className="h-4 w-4 text-atlas-primary" />
          Export Schema Details
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          All CSV tables are encoded in standard UTF-8 format and include standard headers for database migration.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-[11px] font-mono text-slate-500">
          <div className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
            <div className="font-bold text-slate-800 font-sans text-xs mb-1.5">Switch Inventory</div>
            <div className="leading-relaxed">Fabric, Hostname, Management IP, Vendor, Role, Model, Serial Number, Service Tag, Part Number, OS Version, OS License, Mgmt MAC, Uptime, Ports, Temperature, Chassis, Status, Last Discovery, Location</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
            <div className="font-bold text-slate-800 font-sans text-xs mb-1.5">IPAM Subnets</div>
            <div className="leading-relaxed">VRF Name, Layer 3 VNI, Route Distinguisher (RD), Route Target (RT), Fabric Target, VLAN ID, Layer 2 VNI, Subnet CIDR, Gateway IP, Allocation (IPs), Usage/Threshold, Sync Status</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
            <div className="font-bold text-slate-800 font-sans text-xs mb-1.5">Compliance Findings</div>
            <div className="leading-relaxed">Hostname, Rule Name, Severity, Detail</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
            <div className="font-bold text-slate-800 font-sans text-xs mb-1.5">Spanning Tree (STP)</div>
            <div className="leading-relaxed">Hostname, Management IP, STP Enabled, Mode, Bridge Priority, Is Root Bridge, Interface, Port State, Port Role</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
            <div className="font-bold text-slate-800 font-sans text-xs mb-1.5">ZTP Console Pool</div>
            <div className="leading-relaxed">MAC, Serial, Vendor, Model, DHCP IP, Base OS, Status, First Seen, Error</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
            <div className="font-bold text-slate-800 font-sans text-xs mb-1.5">Backups & Snapshots</div>
            <div className="leading-relaxed">Hostname, IP, Snapshot ID, Taken At, Config Hash, Is Baseline, Taken By</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
            <div className="font-bold text-slate-800 font-sans text-xs mb-1.5">Audit Logs</div>
            <div className="leading-relaxed">Timestamp, Username, Action, Resource, Status, Client IP, Details</div>
          </div>
        </div>
      </Card>
    </div>
  );
};

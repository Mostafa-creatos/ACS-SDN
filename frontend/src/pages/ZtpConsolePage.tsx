import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { 
  Server, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

interface ZtpRecord {
  discovery_id: string;
  mac_address: string;
  serial_number: string;
  hardware_vendor: string;
  os_version: string;
  current_dhcp_ip: string;
  first_seen: string;
  onboarding_status: 'pending' | 'provisioned' | 'failed';
  error_message?: string;
}

export const ZtpConsolePage: React.FC = () => {
  const { token } = useAuth();
  const [records, setRecords] = useState<ZtpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchRecords = async () => {
    try {
      const response = await fetch('/api/v5/discovery/pool', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch ZTP pool');
      const data = await response.json();
      setRecords(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
    const interval = setInterval(fetchRecords, 5000);
    return () => clearInterval(interval);
  }, [token]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-800 tracking-tight">ZTP Console</h1>
          <p className="text-sm text-slate-500 mt-1">
            Zero-Touch Provisioning Discovery and Baseline Onboarding
          </p>
        </div>
        <button 
          onClick={fetchRecords}
          className="btn bg-white border border-slate-200 text-slate-600 px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

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
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Device Serial</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">MAC Address</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vendor & OS</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">DHCP IP</th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Discovered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                    No devices in the discovery pool.
                  </td>
                </tr>
              )}
              {records.map((r) => (
                <tr key={r.discovery_id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {r.onboarding_status === 'pending' && <Clock className="w-4 h-4 text-amber-500" />}
                      {r.onboarding_status === 'provisioned' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      {r.onboarding_status === 'failed' && <XCircle className="w-4 h-4 text-rose-500" />}
                      <span className="text-sm font-medium capitalize text-slate-700">{r.onboarding_status}</span>
                    </div>
                    {r.error_message && (
                      <div className="text-xs text-rose-500 mt-1 max-w-[200px] truncate" title={r.error_message}>
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
                  <td className="py-3 px-4 text-sm text-slate-500">
                    {new Date(r.first_seen).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

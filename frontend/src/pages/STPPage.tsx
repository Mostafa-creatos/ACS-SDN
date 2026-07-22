import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { 
  Network, 
  RotateCw,
  GitBranch,
  Radio
} from 'lucide-react';

interface STPPortState {
  port: string;
  role: 'root' | 'designated' | 'alternate' | 'blocking' | 'backup' | 'disabled' | string;
  state: 'forwarding' | 'blocking' | 'learning' | 'listening' | 'disabled' | string;
}

interface SwitchSTPInfo {
  hostname: string;
  ip: string;
  stp_enabled: boolean;
  stp_mode: string;
  bridge_priority: number | null;
  is_root_bridge: boolean;
  port_states: STPPortState[];
  collected_at: string | null;
}

export const STPPage: React.FC = () => {
  const { token, selectedTenant } = useAuth();
  const [stpData, setStpData] = useState<SwitchSTPInfo[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Track active page of ports per switch hostname
  const [portPages, setPortPages] = useState<Record<string, number>>({});

  const fetchSTPData = useCallback(async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      if (selectedTenant) {
        headers['X-Tenant-ID'] = selectedTenant;
      }
      
      const response = await fetch('/api/v5/visibility/stp', { headers });
      if (response.ok) {
        const data = await response.json();
        setStpData(data);
      } else {
        setStpData([]);
      }
    } catch (err) {
      console.error('Failed to fetch STP data:', err);
      setStpData([]);
    } finally {
      setLoading(false);
    }
  }, [token, selectedTenant]);

  useEffect(() => {
    fetchSTPData();
  }, [fetchSTPData]);

  // Color utility for port role (Light Theme)
  const getRoleBadgeClass = (role: string) => {
    switch (role.toLowerCase()) {
      case 'root':
        return 'bg-indigo-50 text-indigo-600 border border-indigo-100';
      case 'designated':
        return 'bg-teal-50 text-teal-600 border border-teal-100';
      case 'alternate':
      case 'blocking':
        return 'bg-amber-50 text-amber-600 border border-amber-100';
      default:
        return 'bg-slate-50 text-slate-500 border border-slate-100';
    }
  };

  // Color utility for port state (Light Theme)
  const getStateBadgeClass = (state: string) => {
    switch (state.toLowerCase()) {
      case 'forwarding':
        return 'bg-emerald-50 text-emerald-600 border border-emerald-100';
      case 'blocking':
      case 'discarding':
        return 'bg-rose-50 text-rose-600 border border-rose-100';
      case 'learning':
      case 'listening':
        return 'bg-amber-50 text-amber-600 border border-amber-100';
      default:
        return 'bg-slate-50 text-slate-500 border border-slate-100';
    }
  };

  const PORTS_PER_PAGE = 5;

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 bg-white border border-slate-100 rounded-2xl shadow-sm">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-atlas-ink font-display">
            Spanning Tree Protocol (STP)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time RSTP path selection, root bridges, and blocking port states to prevent loops.
          </p>
        </div>
        <button
          onClick={fetchSTPData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-atlas-primary hover:bg-atlas-primary/95 active:bg-atlas-primary text-white text-xs font-semibold rounded-xl shadow-sm transition-all duration-200"
        >
          <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Scan STP Status
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20 text-slate-400 gap-3">
          <RotateCw className="h-6 w-6 animate-spin text-atlas-primary" />
          <span>Polling STP bridge topology...</span>
        </div>
      ) : stpData.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">
          No STP operational data found. Please trigger switch discovery or check network instance settings.
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {stpData.map((sw) => {
            // Port list pagination logic
            const activePage = portPages[sw.hostname] || 1;
            const totalPages = Math.ceil(sw.port_states.length / PORTS_PER_PAGE);
            const startIndex = (activePage - 1) * PORTS_PER_PAGE;
            const paginatedPorts = sw.port_states.slice(startIndex, startIndex + PORTS_PER_PAGE);

            return (
              <Card 
                key={sw.hostname} 
                className={`border bg-white relative overflow-hidden transition-all duration-300 hover:shadow-md ${
                  sw.is_root_bridge 
                    ? 'border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.08)]' 
                    : 'border-slate-100 shadow-sm'
                }`}
              >
                {/* Visual indicator for root bridge */}
                {sw.is_root_bridge && (
                  <div className="absolute top-0 right-0 bg-indigo-600 text-indigo-100 text-[10px] font-bold uppercase px-3 py-1 rounded-bl-xl tracking-wider flex items-center gap-1">
                    <Radio className="h-3 w-3 animate-pulse" />
                    Root Bridge
                  </div>
                )}

                {/* Card Title & General Info */}
                <div className="p-6 border-b border-slate-100">
                  <div className="flex items-start gap-4">
                    <div className={`h-12 w-12 rounded-xl border flex items-center justify-center flex-shrink-0 ${
                      sw.is_root_bridge 
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-500' 
                        : 'bg-slate-50 border-slate-100 text-slate-400'
                    }`}>
                      <Network className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-atlas-ink font-display">{sw.hostname}</h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{sw.ip}</p>
                      
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                          sw.stp_enabled 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                            : 'bg-rose-50 text-rose-600 border-rose-100'
                        }`}>
                          STP: {sw.stp_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        
                        {sw.stp_enabled && (
                          <>
                            <span className="text-xs px-2 py-0.5 bg-slate-50 border border-slate-100 rounded text-slate-600 font-mono">
                              Mode: {sw.stp_mode}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-slate-50 border border-slate-100 rounded text-slate-600 font-mono">
                              Priority: {sw.bridge_priority ?? 'N/A'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ports list */}
                <div className="p-6">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Spanning Tree Port Roles & States
                  </h4>
                  
                  {!sw.stp_enabled ? (
                    <div className="text-sm text-slate-400 italic py-4">
                      STP is not configured on this switch node.
                    </div>
                  ) : sw.port_states.length === 0 ? (
                    <div className="text-sm text-slate-400 italic py-4">
                      No active ports in the STP access network instance.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {paginatedPorts.map((pt) => (
                        <div 
                          key={pt.port} 
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/30 border border-slate-100 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <GitBranch className="h-4 w-4 text-atlas-primary rotate-90" />
                            <span className="font-mono text-xs font-semibold text-slate-700">
                              {pt.port}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {/* Role Badge */}
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${getRoleBadgeClass(pt.role)}`}>
                              {pt.role}
                            </span>
                            
                            {/* State Badge */}
                            <span className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded ${getStateBadgeClass(pt.state)}`}>
                              {pt.state}
                            </span>
                          </div>
                        </div>
                      ))}

                      {/* Pagination Controls */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100/80">
                          <button
                            disabled={activePage === 1}
                            onClick={() => setPortPages(prev => ({ ...prev, [sw.hostname]: activePage - 1 }))}
                            className="px-2.5 py-1 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 disabled:hover:bg-slate-50 transition-colors"
                          >
                            Previous
                          </button>
                          <span className="text-[10px] text-slate-400 font-semibold font-sans">
                            Page {activePage} of {totalPages}
                          </span>
                          <button
                            disabled={activePage === totalPages}
                            onClick={() => setPortPages(prev => ({ ...prev, [sw.hostname]: activePage + 1 }))}
                            className="px-2.5 py-1 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 disabled:hover:bg-slate-50 transition-colors"
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                {sw.collected_at && (
                  <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-[10px] font-mono text-slate-400 text-right">
                    Telemetry Sync: {new Date(sw.collected_at).toLocaleTimeString()}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

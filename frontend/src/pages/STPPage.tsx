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

  // Color utility for port role
  const getRoleBadgeClass = (role: string) => {
    switch (role.toLowerCase()) {
      case 'root':
        return 'bg-blue-900/40 text-blue-300 border border-blue-500/30';
      case 'designated':
        return 'bg-emerald-900/40 text-emerald-300 border border-emerald-500/30';
      case 'alternate':
      case 'blocking':
        return 'bg-amber-900/40 text-amber-300 border border-amber-500/30';
      default:
        return 'bg-slate-900 text-slate-400 border border-slate-800';
    }
  };

  // Color utility for port state
  const getStateBadgeClass = (state: string) => {
    switch (state.toLowerCase()) {
      case 'forwarding':
        return 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/20';
      case 'blocking':
      case 'discarding':
        return 'bg-rose-950/60 text-rose-400 border border-rose-500/20';
      case 'learning':
      case 'listening':
        return 'bg-amber-950/60 text-amber-400 border border-amber-500/20';
      default:
        return 'bg-slate-900 text-slate-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-indigo-400 to-purple-400">
            Spanning Tree Protocol (STP)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time RSTP path selection, root bridges, and blocking port states to prevent loops.
          </p>
        </div>
        <button
          onClick={fetchSTPData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 active:bg-indigo-600/70 text-indigo-200 border border-indigo-500/30 rounded-xl transition-all duration-200"
        >
          <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Scan STP Status
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20 text-slate-400 gap-3">
          <RotateCw className="h-6 w-6 animate-spin text-indigo-500" />
          <span>Polling STP bridge topology...</span>
        </div>
      ) : stpData.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">
          No STP operational data found. Please trigger switch discovery or check network instance settings.
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {stpData.map((sw) => {
            return (
              <Card 
                key={sw.hostname} 
                className={`border bg-slate-900/20 backdrop-blur-xl relative overflow-hidden transition-all duration-300 hover:border-slate-700/80 ${
                  sw.is_root_bridge 
                    ? 'border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.15)]' 
                    : 'border-slate-800/80'
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
                <div className="p-6 border-b border-slate-800/80">
                  <div className="flex items-start gap-4">
                    <div className={`h-12 w-12 rounded-xl border flex items-center justify-center flex-shrink-0 ${
                      sw.is_root_bridge 
                        ? 'bg-indigo-950/60 border-indigo-500/30 text-indigo-400' 
                        : 'bg-slate-950/80 border-slate-800 text-slate-400'
                    }`}>
                      <Network className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-100">{sw.hostname}</h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{sw.ip}</p>
                      
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          sw.stp_enabled 
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-rose-950/60 text-rose-400 border border-rose-500/20'
                        }`}>
                          STP: {sw.stp_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        
                        {sw.stp_enabled && (
                          <>
                            <span className="text-xs px-2 py-0.5 bg-slate-950/80 border border-slate-800 rounded text-slate-300 font-mono">
                              Mode: {sw.stp_mode}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-slate-950/80 border border-slate-800 rounded text-slate-300 font-mono">
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
                    <div className="text-sm text-slate-500 italic py-4">
                      STP is not configured on this switch node.
                    </div>
                  ) : sw.port_states.length === 0 ? (
                    <div className="text-sm text-slate-500 italic py-4">
                      No active ports in the STP access network instance.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sw.port_states.map((pt) => (
                        <div 
                          key={pt.port} 
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800/60 hover:bg-slate-950/80 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <GitBranch className="h-4 w-4 text-indigo-400 rotate-90" />
                            <span className="font-mono text-sm font-semibold text-slate-200">
                              {pt.port}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {/* Role Badge */}
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${getRoleBadgeClass(pt.role)}`}>
                              {pt.role}
                            </span>
                            
                            {/* State Badge */}
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${getStateBadgeClass(pt.state)}`}>
                              {pt.state}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                {sw.collected_at && (
                  <div className="px-6 py-3 border-t border-slate-800/40 bg-slate-950/20 text-[10px] font-mono text-slate-500 text-right">
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

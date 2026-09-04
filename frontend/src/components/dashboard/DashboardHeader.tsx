import React from 'react';
import { Play, RotateCw, Activity } from 'lucide-react';

interface Props {
  isLoading: boolean;
  lastUpdated?: string;
  auditRunning: boolean;
  auditStep: number;
  onRefresh: () => void;
  onRunAudit: () => void;
}

export const DashboardHeader: React.FC<Props> = ({
  isLoading,
  lastUpdated,
  auditRunning,
  auditStep,
  onRefresh,
  onRunAudit,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">
          NOC Control Room
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-slate-400">Real-Time Core Orchestrator & Telemetry Stream</p>
          {lastUpdated && (
            <span className="text-[10px] text-slate-400 font-mono">
              · updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          {isLoading && <Activity className="w-3 h-3 text-atlas-primary animate-pulse" />}
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-center"
          title="Refresh Dashboard"
        >
          <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={onRunAudit}
          disabled={auditRunning}
          className="btn-secondary flex items-center gap-2"
        >
          <Play className={`w-4 h-4 ${auditRunning ? 'animate-spin' : ''}`} />
          <span>
            {auditRunning ? `Running Verification (Step ${auditStep}/3)...` : 'Trigger Compliance Run'}
          </span>
        </button>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { fetchProvisioningJobs } from '../lib/api';
import { 
  CheckCircle2, 
  XCircle, 
  Terminal, 
  Clock, 
  RefreshCw, 
  ArrowRight, 
  Network,
  AlertTriangle
} from 'lucide-react';

interface ProvisioningJob {
  job_id: string;
  subnet_id: string;
  vrf_name: string;
  subnet_cidr: string;
  fabric_name: string;
  status: 'pending' | 'in_progress' | 'success' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  logs: string;
  error_message: string | null;
}

export const ProvisioningStatus: React.FC = () => {
  const [jobs, setJobs] = useState<ProvisioningJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<ProvisioningJob | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadJobs = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await fetchProvisioningJobs();
      setJobs(data);
      setError(null);
      
      // If we have an actively selected job, update its detail too
      if (selectedJob) {
        const updatedSelected = data.find(j => j.job_id === selectedJob.job_id);
        if (updatedSelected) {
          setSelectedJob(updatedSelected);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load provisioning history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  // Poll for updates if any jobs are in progress
  useEffect(() => {
    const hasActiveJob = jobs.some(j => j.status === 'in_progress' || j.status === 'pending');
    if (!hasActiveJob) return;

    const interval = setInterval(() => {
      loadJobs(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs, selectedJob]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleTimeString() + ' ' + date.toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            SUCCESS
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100">
            <XCircle className="w-3 h-3 text-rose-600" />
            FAILED
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-100 animate-pulse">
            <RefreshCw className="w-3 h-3 text-sky-600 animate-spin" />
            PROVISIONING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 text-slate-500 border border-slate-100">
            <Clock className="w-3 h-3 text-slate-400" />
            QUEUED
          </span>
        );
    }
  };

  // Process logs text to add colors to timestamps/levels
  const formatTerminalLogs = (rawLogs: string) => {
    if (!rawLogs) return 'Initializing terminal pipeline log output...';
    
    // Split logs and colorize lines
    return rawLogs.split('\n').map((line, idx) => {
      if (!line.trim()) return null;
      let lineClass = 'text-slate-300';
      
      if (line.includes('FAILED') || line.includes('Exception') || line.includes('Error')) {
        lineClass = 'text-rose-400 font-bold';
      } else if (line.includes('succeeded') || line.includes('successfully')) {
        lineClass = 'text-emerald-400';
      } else if (line.includes('Generating config') || line.includes('Pushing config')) {
        lineClass = 'text-sky-400';
      } else if (line.includes('Configuration payload:')) {
        lineClass = 'text-yellow-400 font-semibold';
      }

      return (
        <div key={idx} className={`py-0.5 font-mono text-[11px] leading-5 ${lineClass}`}>
          {line}
        </div>
      );
    });
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">Provisioning Status</h1>
          <p className="text-xs text-slate-400 mt-1">Real-time closed-loop orchestrator pushes and execution logs.</p>
        </div>
        <button 
          onClick={() => loadJobs()} 
          disabled={loading || refreshing}
          className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>
      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-lg p-4 flex gap-2.5 items-start">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold block">Orchestrator History Load Failure</strong>
            {error}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* Left Column: Jobs List */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Orchestration Logs History</h3>
              {refreshing && <span className="text-[10px] text-slate-400 font-semibold">Live Polling Updates...</span>}
            </div>

            {loading && jobs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-400 mb-2" />
                Loading provisioning records...
              </div>
            ) : jobs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No provisioning jobs triggered yet. Subnet configurations will appear here automatically.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {jobs.map((job) => {
                  const isSelected = selectedJob?.job_id === job.job_id;
                  return (
                    <div 
                      key={job.job_id}
                      onClick={() => setSelectedJob(job)}
                      className={`p-4 flex justify-between items-center cursor-pointer transition-all hover:bg-slate-50/50 ${isSelected ? 'bg-atlas-primary/5 hover:bg-atlas-primary/5 border-l-4 border-atlas-primary' : ''}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-800">{job.subnet_cidr}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{job.vrf_name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <Network className="w-3 h-3" />
                            {job.fabric_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(job.started_at)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {getStatusBadge(job.status)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Log Output Viewer */}
        <div className="lg:col-span-2">
          {selectedJob ? (
            <Card className="p-5 flex flex-col h-[500px]">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-slate-600" />
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">CLI Execution Transcript</h3>
                </div>
                {getStatusBadge(selectedJob.status)}
              </div>

              {/* Terminal Frame */}
              <div className="flex-1 bg-slate-950 rounded-lg p-4 overflow-y-auto font-mono text-[11px] border border-slate-900 shadow-inner flex flex-col justify-between">
                <div>
                  <div className="text-slate-500 mb-2 border-b border-slate-900 pb-1 select-none">
                    # SDN Controller Job ID: {selectedJob.job_id}
                  </div>
                  {formatTerminalLogs(selectedJob.logs)}
                  
                  {selectedJob.status === 'failed' && selectedJob.error_message && (
                    <div className="mt-4 p-3 rounded bg-rose-950/40 border border-rose-900/50 text-rose-300">
                      <strong className="text-rose-400 font-bold block mb-1">Provisioner Error:</strong>
                      {selectedJob.error_message}
                    </div>
                  )}
                </div>

                {selectedJob.status === 'in_progress' && (
                  <div className="mt-4 flex items-center gap-2 text-sky-400 animate-pulse font-bold text-[10px]">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                    AWAITING SWITCH INTERFACE RESPONSE...
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center h-[500px]">
              <Terminal className="w-12 h-12 text-slate-300 mb-3" />
              <span>Select a provisioning record from the left to view active SSH session logs and execution commands.</span>
            </Card>
          )}
        </div>

      </div>

    </div>
  );
};

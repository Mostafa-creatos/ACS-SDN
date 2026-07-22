import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { 
  FileCheck2, 
  Trash2, 
  ShieldAlert, 
  AlertTriangle, 
  UserCheck
} from 'lucide-react';

interface ApprovalRequest {
  id: string;
  tenant: string;
  summary: string;
  blast_radius: string;
  device_count: number;
  is_spine: boolean;
  diff: string;
}

export const PendingApprovals: React.FC = () => {
  const { token, user } = useAuth();
  
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Approve confirmation modal states
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [activeRequest, setActiveRequest] = useState<ApprovalRequest | null>(null);

  // Reject confirmation states
  const [isRejectOpen, setIsRejectOpen] = useState(false);

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const response = await fetch('/api/v5/orchestrator/approvals', { headers });
      if (response.ok) {
        setRequests(await response.json());
      } else {
        setRequests([]);
      }
    } catch (e) {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, [token]);

  // Access check
  if (user?.role !== 'Platform Admin' && user?.role !== 'platform_admin') {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-2 min-h-[50vh]">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4 stroke-[1.25]" />
        <h3 className="text-xl font-bold font-display text-atlas-ink mb-1">Access Denied</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          The Pending Approvals queue contains high-impact backbone changes that require Platform Administrator credentials. Please log out and sign in with the Platform Admin simulation profile.
        </p>
      </Card>
    );
  }

  const handleApproveClick = (req: ApprovalRequest) => {
    setActiveRequest(req);
    setIsConfirmOpen(true);
  };

  const handleRejectClick = (req: ApprovalRequest) => {
    setActiveRequest(req);
    setIsRejectOpen(true);
  };

  const confirmApprove = async () => {
    if (!activeRequest) return;

    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const response = await fetch(`/api/v5/orchestrator/approvals/${activeRequest.id}/approve`, {
        method: 'POST',
        headers
      });

      if (response.ok) {
        // Remove from list
        setRequests(prev => prev.filter(r => r.id !== activeRequest.id));
        setIsConfirmOpen(false);
        setActiveRequest(null);
      }
    } catch (e) {
      // fallback
      setRequests(prev => prev.filter(r => r.id !== activeRequest.id));
      setIsConfirmOpen(false);
      setActiveRequest(null);
    }
  };

  const confirmReject = async () => {
    if (!activeRequest) return;
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const response = await fetch(`/api/v5/orchestrator/approvals/${activeRequest.id}/reject`, {
        method: 'POST',
        headers
      });
      if (response.ok) {
        setRequests(prev => prev.filter(r => r.id !== activeRequest.id));
      }
    } catch (e) {
      setRequests(prev => prev.filter(r => r.id !== activeRequest.id));
    } finally {
      setIsRejectOpen(false);
      setActiveRequest(null);
    }
  };

  // Diff styling formatter
  const formatDiffText = (diffText: string) => {
    return diffText.split('\n').map((line, idx) => {
      if (line.startsWith('+')) {
        return (
          <div key={idx} className="bg-emerald-50 text-emerald-700 py-0.5 px-2 rounded-sm font-mono text-[11px] whitespace-pre">
            {line}
          </div>
        );
      }
      if (line.startsWith('-')) {
        return (
          <div key={idx} className="bg-rose-50 text-rose-700 py-0.5 px-2 rounded-sm font-mono text-[11px] whitespace-pre">
            {line}
          </div>
        );
      }
      return (
        <div key={idx} className="text-slate-500 py-0.5 px-2 font-mono text-[11px] whitespace-pre">
          {line}
        </div>
      );
    });
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">Pending Approvals</h1>
        <p className="text-xs text-slate-400 mt-1">Four-Eyes verification queue for high blast-radius spine changes</p>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm py-10 text-center">Loading approvals list...</div>
      ) : requests.length === 0 ? (
        /* Empty State */
        <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-2 min-h-[40vh] bg-slate-50/50">
          <FileCheck2 className="w-16 h-16 text-slate-400 mb-4 stroke-[1.25]" />
          <h3 className="text-lg font-bold font-display text-slate-700 mb-1">No changes are waiting for approval</h3>
          <p className="text-xs text-slate-500 max-w-sm">
            All configuration change scripts and segments have been reviewed and committed. The active fabric is fully synchronized.
          </p>
        </Card>
      ) : (
        /* Requests Grid Layout */
        <div className="grid grid-cols-1 gap-6 max-w-4xl">
          {requests.map((req) => (
            <Card key={req.id} className="border-l-4 border-l-atlas-primary relative flex flex-col justify-between gap-5 p-6 hover:shadow-md transition-shadow">
              
              {/* Header Details */}
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Tenant Request</span>
                    <span className="text-xs font-extrabold text-atlas-ink bg-slate-100 px-2 py-0.5 rounded">
                      {req.tenant}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 pt-0.5">{req.summary}</h4>
                </div>

                {/* Blast Radius Badge */}
                <div className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full ${
                  req.is_spine 
                    ? 'bg-atlas-coral/10 text-atlas-coral border border-atlas-coral/30' 
                    : 'bg-slate-100 text-slate-500 border'
                }`}>
                  {req.blast_radius}
                </div>
              </div>

              {/* Dry Run Monospace Diff Block */}
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
                <div className="bg-slate-100 px-3 py-1.5 border-b text-[9px] font-bold text-slate-400">
                  DRY RUN CONFIGURATION CHANGE DIFF
                </div>
                <div className="p-2 space-y-0.5 max-h-56 overflow-y-auto bg-slate-950/5 select-all">
                  {formatDiffText(req.diff)}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
                <button 
                  onClick={() => handleRejectClick(req)}
                  className="btn bg-white border text-slate-600 px-4 py-2 hover:bg-slate-100 text-xs flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>
                <button 
                  onClick={() => handleApproveClick(req)}
                  className="btn-primary px-5 py-2 font-bold text-xs flex items-center gap-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Approve & Deploy</span>
                </button>
              </div>

            </Card>
          ))}
        </div>
      )}

      {/* Approve Confirmation Modal (Double click safety lock) */}
      {isConfirmOpen && activeRequest && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-xl shadow-2xl z-50 p-6 border text-center space-y-4 animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold font-display text-atlas-ink">Confirm Configuration Deployment</h3>
            
            <div className="flex justify-center">
              <AlertTriangle className="w-12 h-12 text-atlas-coral animate-pulse" />
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              You are approving a high-impact change affecting <strong className="text-slate-800">{activeRequest.device_count} devices</strong>. This deployment script will execute configuration rollouts immediately and cannot be undone automatically.
            </p>

            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setIsConfirmOpen(false)}
                className="btn bg-slate-50 border text-slate-600 px-4 py-2 hover:bg-slate-100 w-1/2 text-xs"
              >
                Cancel
              </button>
              <button 
                onClick={confirmApprove}
                className="btn bg-atlas-primary hover:bg-atlas-primary/95 text-white font-bold px-4 py-2 w-1/2 text-xs"
              >
                Confirm Approval
              </button>
            </div>
          </div>
        </>
      )}

      {/* Reject Confirmation Modal */}
      {isRejectOpen && activeRequest && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-xl shadow-2xl z-50 p-6 border text-center space-y-4 animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold font-display text-rose-700">Reject Configuration Change</h3>
            
            <p className="text-xs text-slate-600">
              Are you sure you want to reject this request from <strong className="text-slate-800">{activeRequest.tenant}</strong>? This script will be discarded.
            </p>

            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setIsRejectOpen(false)}
                className="btn bg-slate-50 border text-slate-600 px-4 py-2 hover:bg-slate-100 w-1/2 text-xs"
              >
                Cancel
              </button>
              <button 
                onClick={confirmReject}
                className="btn bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 w-1/2 text-xs"
              >
                Reject Request
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
};

export default PendingApprovals;

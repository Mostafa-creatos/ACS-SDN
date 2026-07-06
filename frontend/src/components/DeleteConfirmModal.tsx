import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Props {
  open: boolean;
  hostname: string;
  switchId: string;
  onClose: () => void;
  onDeleted: () => void;
}

export const DeleteConfirmModal: React.FC<Props> = ({ open, hostname, switchId, onClose, onDeleted }) => {
  const { token } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const resp = await fetch(`/api/v5/admin/switches/${switchId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || 'Failed to delete switch');
      }
      onDeleted();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-xl shadow-2xl z-50 p-6 border animate-in zoom-in-95 duration-150 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-rose-600" />
        </div>

        <div>
          <h3 className="text-base font-bold font-display text-atlas-ink">Delete Switch</h3>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Are you sure you want to delete <strong className="text-slate-700">{hostname}</strong>?
            This action cannot be undone. All associated interfaces, hardware data, VLANs, LAGs,
            and snapshots will be permanently removed.
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-lg p-3 flex gap-2 items-start text-left">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} disabled={deleting} className="btn-secondary text-xs flex-1 py-2">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting} className="btn-danger text-xs flex-1 py-2">
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </>
  );
};

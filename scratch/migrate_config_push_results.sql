-- Migration: add config push result tracking to policy_approvals
-- Apply on the VM PostgreSQL database before deploying the backend update.

ALTER TABLE policy_approvals
  ADD COLUMN IF NOT EXISTS task_ids JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_results JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP DEFAULT NULL;

-- Backfill existing approved config_push rows so they don't break the UI.
-- Mark them as success (we have no stored per-switch results for old pushes).
UPDATE policy_approvals
SET push_results = '{}'::jsonb,
    completed_at = created_at
WHERE vrf_name = 'config_push'
  AND status = 'approved'
  AND push_results IS NULL;

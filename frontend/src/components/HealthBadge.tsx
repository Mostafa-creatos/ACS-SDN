import clsx from "clsx";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import type { HealthStatus } from "../types/switch-types";

const CONFIG: Record<HealthStatus, { icon: typeof CheckCircle2; color: string; label: string }> = {
  ok: { icon: CheckCircle2, color: "text-emerald-500", label: "Hardware OK" },
  warning: { icon: AlertTriangle, color: "text-amber-500", label: "Hardware Warning" },
  critical: { icon: XCircle, color: "text-rose-500", label: "Hardware Critical" },
  unknown: { icon: HelpCircle, color: "text-slate-400", label: "Hardware Unknown" }
};

function normalizeStatus(status: any): HealthStatus {
  if (!status) return "unknown";
  const s = String(status).toLowerCase().trim();
  if (["ok", "up", "active", "normal", "ready", "healthy"].includes(s)) {
    return "ok";
  }
  if (["warning", "warn", "alert", "minor"].includes(s)) {
    return "warning";
  }
  if (["critical", "down", "fail", "failed", "fault", "error", "major"].includes(s)) {
    return "critical";
  }
  return "unknown";
}

export function HardwareHealthIcon({ status }: { status: any }) {
  const norm = normalizeStatus(status);
  const cfg = CONFIG[norm] || CONFIG.unknown;
  const Icon = cfg.icon;
  return (
    <span title={cfg.label} aria-label={cfg.label}>
      <Icon className={clsx("h-4 w-4", cfg.color)} />
    </span>
  );
}

export function HardwareHealthBadge({ status }: { status: any }) {
  const norm = normalizeStatus(status);
  const cfg = CONFIG[norm] || CONFIG.unknown;
  const Icon = cfg.icon;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-semibold", cfg.color)}>
      <Icon className="h-4.5 w-4.5" />
      {cfg.label}
    </span>
  );
}

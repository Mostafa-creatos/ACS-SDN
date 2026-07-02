import clsx from "clsx";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import type { HealthStatus } from "../types/switch-types";

const CONFIG: Record<HealthStatus, { icon: typeof CheckCircle2; color: string; label: string }> = {
  ok: { icon: CheckCircle2, color: "text-emerald-500", label: "Hardware OK" },
  warning: { icon: AlertTriangle, color: "text-amber-500", label: "Hardware Warning" },
  critical: { icon: XCircle, color: "text-rose-500", label: "Hardware Critical" },
  unknown: { icon: HelpCircle, color: "text-slate-400", label: "Hardware Unknown" }
};

export function HardwareHealthIcon({ status }: { status: HealthStatus }) {
  const cfg = CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span title={cfg.label} aria-label={cfg.label}>
      <Icon className={clsx("h-4 w-4", cfg.color)} />
    </span>
  );
}

export function HardwareHealthBadge({ status }: { status: HealthStatus }) {
  const cfg = CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-semibold", cfg.color)}>
      <Icon className="h-4.5 w-4.5" />
      {cfg.label}
    </span>
  );
}

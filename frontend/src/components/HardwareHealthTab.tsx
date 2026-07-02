import clsx from "clsx";
import type { HardwareInventoryItem } from "../types/switch-types";
import { HardwareHealthIcon } from "./HealthBadge";

export function HardwareHealthTab({ items }: { items: HardwareInventoryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-slate-50 border rounded-lg p-4 text-xs text-slate-500">
        No hardware inventory has been collected for this switch yet.
      </div>
    );
  }

  const criticalCount = items.filter((i) => i.status === "critical").length;
  const warningCount = items.filter((i) => i.status === "warning").length;

  return (
    <div className="space-y-4">
      {(criticalCount > 0 || warningCount > 0) && (
        <div
          className={clsx(
            "border rounded-lg p-4",
            criticalCount > 0 ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"
          )}
        >
          <p className={clsx("text-xs font-semibold", criticalCount > 0 ? "text-rose-800" : "text-amber-800")}>
            {criticalCount > 0
              ? `${criticalCount} component${criticalCount > 1 ? "s" : ""} reporting a critical fault.`
              : `${warningCount} component${warningCount > 1 ? "s" : ""} reporting a warning.`}
          </p>
        </div>
      )}

      <div className="bg-slate-50/50 border rounded-lg p-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-200">
              <th className="py-2 font-bold">Slot</th>
              <th className="py-2 font-bold">Type</th>
              <th className="py-2 font-bold">Status</th>
              <th className="py-2 font-bold">Detail</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.slot} className="border-b border-slate-100 last:border-0">
                <td className="py-2 font-semibold text-slate-700">{item.slot}</td>
                <td className="py-2 text-slate-600">{item.type}</td>
                <td className="py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <HardwareHealthIcon status={item.status} />
                    <span className="capitalize text-slate-600 font-medium">{item.status}</span>
                  </span>
                </td>
                <td className="py-2 text-slate-500">{item.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

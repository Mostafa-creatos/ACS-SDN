import clsx from "clsx";
import { Link2, Link2Off } from "lucide-react";
import type { VltDomain } from "../types/switch-types";

function LinkStateBadge({ state, label }: { state: "up" | "down"; label: string }) {
  const isUp = state === "up";
  return (
    <div className="flex items-center gap-2">
      {isUp ? (
        <Link2 className="h-4 w-4 text-emerald-500" />
      ) : (
        <Link2Off className="h-4 w-4 text-rose-500" />
      )}
      <span className="text-xs text-slate-600">
        {label}:{" "}
        <span className={clsx("font-semibold", isUp ? "text-emerald-600" : "text-amber-600")}>
          {state.toUpperCase()}
        </span>
      </span>
    </div>
  );
}

export function FabricVltTab({ vlt }: { vlt: VltDomain | null }) {
  if (!vlt) {
    return (
      <div className="bg-slate-50 border rounded-lg p-4 text-xs text-slate-500">
        This switch is not a member of a VLT domain. VLT pairing applies to leaf switches
        deployed in redundant pairs; standalone or spine switches in a routed-only role may not use it.
      </div>
    );
  }

  const isSplitBrainRisk = vlt.iclState === "down";

  return (
    <div className="space-y-4">
      {isSplitBrainRisk && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-rose-800">
            Inter-Chassis Link is down. This is a split-brain risk -- avoid pushing further
            configuration changes to this VLT pair until the ICL is restored.
          </p>
        </div>
      )}

      <div className="bg-slate-50/50 border rounded-lg p-4">
        <h3 className="text-xs font-bold text-slate-700 mb-3">VLT Domain {vlt.domainId}</h3>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-slate-400 mb-1">Peer switch</p>
            <p className="font-semibold text-slate-700">{vlt.peerSwitchHostname}</p>
          </div>
          <div>
            <p className="text-slate-400 mb-1">Peer routing</p>
            <p className="font-semibold text-slate-700">{vlt.peerRoutingEnabled ? "Enabled" : "Disabled"}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 border-t pt-3">
          <LinkStateBadge state={vlt.peerLinkStatus} label="Peer link" />
          <LinkStateBadge state={vlt.iclState} label="ICL (inter-chassis link)" />
        </div>
      </div>

      <div className="bg-slate-50/50 border rounded-lg p-4">
        <h3 className="text-xs font-bold text-slate-700 mb-3">VRRP Groups</h3>
        {vlt.vrrpGroups.length === 0 ? (
          <p className="text-xs text-slate-400">No VRRP groups configured on this switch.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-200">
                <th className="py-2 font-bold">Group ID</th>
                <th className="py-2 font-bold">Virtual IP</th>
                <th className="py-2 font-bold">State</th>
              </tr>
            </thead>
            <tbody>
              {vlt.vrrpGroups.map((g) => (
                <tr key={g.groupId} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 text-slate-600 font-mono">{g.groupId}</td>
                  <td className="py-2 text-slate-600 font-mono">{g.vip}</td>
                  <td className="py-2">
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        g.state === "master" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"
                      )}
                    >
                      {g.state}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export type HealthStatus = "ok" | "warning" | "critical" | "unknown";

export interface VltDomain {
  id: string;
  domainId: number;
  switchId: string;
  peerSwitchId: string;
  peerSwitchHostname: string;
  peerLinkStatus: "up" | "down";
  iclState: "up" | "down";
  peerRoutingEnabled: boolean;
  vrrpGroups: { groupId: number; vip: string; state: "master" | "backup" }[];
}

export interface HardwareInventoryItem {
  slot: string;
  type: "PSU" | "Fan" | "Supervisor" | "Line Card";
  status: HealthStatus;
  detail: string;
}

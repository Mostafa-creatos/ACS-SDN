export type HealthStatus = "ok" | "warning" | "critical" | "unknown";

export interface HardwareComponent {
  component_id: string;
  component_type: "chassis" | "psu" | "fan_tray" | "fan" | "temperature";
  slot_label: string;
  part_number: string;
  ppid: string;
  service_tag: string;
  status: HealthStatus;
  detail: string;
  numeric_value?: number;
}

export interface SwitchInterface {
  name: string;
  status: "up" | "down" | "admin-down";
  speed_duplex: string;
  vlan: string;
  description: string;
  ip_address?: string;
  mac_address?: string;
  media_type?: string;
  neighbor?: string;
  switchport_mode?: "access" | "trunk" | "hybrid" | "routed";
  transceiver_type?: string;
  transceiver_serial?: string;
  transceiver_qualified?: boolean;
  mtu?: number;
  errors_in?: number;
  errors_out?: number;
  discards_in?: number;
  discards_out?: number;
}

export interface SwitchVlan {
  vlan_id: number;
  name: string;
  status: "active" | "suspended";
  member_ports: string[];
}

export interface SwitchLag {
  lag_id: string;
  lag_name: string;
  lag_type: "static" | "lacp";
  member_ports: string[];
  status: "up" | "down";
  protocol: string;
}

export interface VltDomain {
  vlt_id?: string;
  domainId: number;
  domain_id?: number;
  switchId?: string;
  peerSwitchId?: string | null;
  peer_switch_id?: string | null;
  peer_switch_hostname: string;
  peerSwitchHostname?: string;
  peer_link_status: "up" | "down";
  peerLinkStatus?: "up" | "down";
  icl_state: "up" | "down";
  iclState?: "up" | "down";
  role?: "primary" | "backup";
  peer_routing_enabled: boolean;
  peerRoutingEnabled?: boolean;
  vrrp_groups: { groupId: number; vip: string; state: "master" | "backup" }[];
  vrrpGroups?: { groupId: number; vip: string; state: "master" | "backup" }[];
}

export interface HardwareInventoryItem {
  slot: string;
  type: "PSU" | "Fan" | "Supervisor" | "Line Card";
  status: HealthStatus;
  detail: string;
}

export interface DellSwitchDetails {
  switch_id: string;
  hostname: string;
  management_ip: string;
  vendor: string;
  role: string;
  lifecycle_status: string;
  configuration_drift_category?: string | null;
  model: string;
  os_version: string;
  status: string;
  uptime: string;
  last_successful_sync?: string;
  serial_number: string;
  service_tag: string;
  part_number: string;
  ppid: string;
  express_service_code: string;
  management_mac: string;
  os10_license_status: string;
  temperature: string;
  cpu_usage?: number;
  memory_usage?: number;
  location: string;
  device_type: string;
  os_type: string;
  client_tenant: string;
  last_collection_timestamp?: string;
  credentials_status: string;
  ports_up: number;
  ports_all: number;
  chassis_status: string;
  running_config?: string;
  startup_config?: string;
  configuration_checksum?: string;
  local_bgp_asn?: number;
  loopback_0_ip?: string;
  vtep_ip?: string;
  interfaces: SwitchInterface[];
  hardware_components: HardwareComponent[];
  vlans: SwitchVlan[];
  lags: SwitchLag[];
  vlt: VltDomain | null;
}

export interface PaginatedResponse {
  items: DellSwitchDetails[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

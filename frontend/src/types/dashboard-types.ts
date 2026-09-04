export interface DashboardMetrics {
  totalSwitches: number;
  activeSwitches: number;
  driftedSwitches: number;
  unreachableSwitches: number;
  pendingApprovals: number;
  ztpPoolCount: number;
  subnetsCount: number;
  fabricsCount: number;
  allocatedIpsCount: number;
}

export interface CeleryStats {
  status: 'online' | 'offline';
  active_tasks_count: number;
  reserved_tasks_count: number;
  scheduled_tasks_count: number;
  workers_count: number;
}

export interface LeaderboardItem {
  hostname: string;
  value: number;
}

export interface ProvisioningJob {
  job_id: string;
  vrf_name: string;
  subnet_cidr: string;
  fabric_name: string;
  status: string;
  started_at: string;
  completed_at: string;
  error_message: string | null;
}

export interface ZtpDevice {
  discovery_id: string;
  mac_address: string;
  serial_number: string;
  hardware_vendor: string;
  hardware_model: string;
  current_dhcp_ip: string;
  base_os_version: string;
}

export interface AuditLog {
  log_id: string;
  username: string;
  action: string;
  ip_address: string | null;
  status: string;
  created_at: string;
}

export interface TelemetryPoint {
  timestamp: string;
  cpu: number;
  memory: number;
}

export interface DashboardData {
  health_score: number;
  metrics: DashboardMetrics;
  celery_stats: CeleryStats;
  cpu_leaderboard: LeaderboardItem[];
  mem_leaderboard: LeaderboardItem[];
  recent_jobs: ProvisioningJob[];
  ztp_devices: ZtpDevice[];
  audit_logs: AuditLog[];
  telemetry_history: TelemetryPoint[];
  last_updated: string;
}

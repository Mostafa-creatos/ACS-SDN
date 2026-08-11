import type { User } from '../types';

const decodeJwt = (token: string): any => {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            window.atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
        );
        return JSON.parse(jsonPayload);
    } catch {
        return null;
    }
};

export const isTokenExpired = (token: string): boolean => {
    const decoded = decodeJwt(token);
    if (!decoded || !decoded.exp) return true;
    return Date.now() >= decoded.exp * 1000;
};

export const refreshAccessToken = async (refreshToken: string) => {
    const res = await apiRequest('/api/v5/auth/refresh', {
        method: 'POST',
        noAuth: true,
        body: { refresh_token: refreshToken }
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
};

export const tryRefreshToken = async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem('atlas_refresh');
    if (!refreshToken) return null;
    try {
        const { ok, data } = await refreshAccessToken(refreshToken);
        if (!ok) return null;
        localStorage.setItem('atlas_jwt', data.access_token);
        if (data.refresh_token) {
            localStorage.setItem('atlas_refresh', data.refresh_token);
        }
        return data.access_token;
    } catch {
        return null;
    }
};

const getHeaders = () => {
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${localStorage.getItem('atlas_jwt')}`,
        'Content-Type': 'application/json'
    };
    const tenant = localStorage.getItem('atlas_tenant');
    if (tenant) {
        headers['X-Tenant-ID'] = tenant;
    }
    return headers;
};

export const fetchUsers = async (): Promise<User[]> => {
    const res = await fetch('/api/v5/users', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
};

export const createUser = async (payload: { username: string, role: string }): Promise<User> => {
    const res = await fetch('/api/v5/users', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create user');
    return res.json();
};

export const updateUser = async (id: string, payload: { is_active?: boolean, role?: string }): Promise<User> => {
    const res = await fetch(`/api/v5/users/${id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to update user');
    return res.json();
};

export const deactivateUser = async (id: string): Promise<void> => {
    const res = await fetch(`/api/v5/users/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to deactivate user');
};

export const revokeTenantAccess = async (userId: string, tenantId: string): Promise<void> => {
    const res = await fetch(`/api/v5/users/${userId}/tenants/${tenantId}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to revoke tenant access');
};

export const changePassword = async (payload: any): Promise<void> => {
    const res = await fetch('/api/v5/auth/change-password', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to change password');
};

export const fetchTenants = async (): Promise<any[]> => {
    const res = await fetch('/api/v5/admin/tenants', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch tenants');
    return res.json();
};

export const createTenant = async (tenantName: string): Promise<any> => {
    const res = await fetch('/api/v5/admin/tenants', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ tenant_name: tenantName })
    });
    if (!res.ok) throw new Error('Failed to create tenant');
    return res.json();
};

export const deleteTenant = async (tenantId: string): Promise<void> => {
    const res = await fetch(`/api/v5/admin/tenants/${tenantId}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete tenant');
};

export const fetchFabrics = async (): Promise<any[]> => {
    const res = await fetch('/api/v5/admin/fabrics', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch fabrics');
    return res.json();
};

export const createFabric = async (
    fabricName: string,
    globalBgpAsn: number,
    expectedNtpServers?: string,
    expectedDnsServers?: string,
    expectedSyslogServer?: string,
    loopbackPool?: string,
    vtepPool?: string
): Promise<any> => {
    const res = await fetch('/api/v5/admin/fabrics', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
            fabric_name: fabricName,
            global_bgp_asn: globalBgpAsn,
            expected_ntp_servers: expectedNtpServers || '192.168.100.1',
            expected_dns_servers: expectedDnsServers || '8.8.8.8',
            expected_syslog_server: expectedSyslogServer || '10.10.100.5',
            loopback_pool: loopbackPool || '10.200.1.0/24',
            vtep_pool: vtepPool || '10.250.1.0/24'
        })
    });
    if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || 'Failed to create fabric');
    }
    return res.json();
};

export const fetchVrfs = async (tenantId?: string): Promise<any[]> => {
    const url = tenantId ? `/api/v5/admin/vrfs?tenant_id=${tenantId}` : '/api/v5/admin/vrfs';
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch VRFs');
    return res.json();
};

export const createVrf = async (data: Record<string, unknown>): Promise<any> => {
    const res = await fetch('/api/v5/admin/vrfs', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to create VRF');
    }
    return res.json();
};

export const updateVrf = async (vrfId: string, data: Record<string, unknown>): Promise<any> => {
    const res = await fetch(`/api/v5/admin/vrfs/${vrfId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to update VRF');
    }
    return res.json();
};

export const deleteVrf = async (vrfId: string): Promise<void> => {
    const res = await fetch(`/api/v5/admin/vrfs/${vrfId}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to delete VRF');
    }
};

export const fetchSubnets = async (vrfId: string): Promise<any[]> => {
    const res = await fetch(`/api/v5/admin/vrfs/${vrfId}/subnets`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch subnets');
    return res.json();
};

export const createSubnet = async (vrfId: string, data: Record<string, unknown>): Promise<any> => {
    const res = await fetch(`/api/v5/admin/vrfs/${vrfId}/subnets`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to create subnet');
    }
    return res.json();
};

export const deleteSubnet = async (subnetId: string): Promise<void> => {
    const res = await fetch(`/api/v5/admin/subnets/${subnetId}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to delete subnet');
    }
};

export const redeploySubnet = async (subnetId: string): Promise<any> => {
    const res = await fetch(`/api/v5/admin/subnets/${subnetId}/redeploy`, {
        method: 'POST',
        headers: getHeaders()
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to trigger redeployment');
    }
    return res.json();
};


export const remediateComplianceFinding = async (findingId: string, tenantId?: string | null): Promise<{ ok: boolean; errorText?: string }> => {
    const res = await apiRequest(`/api/v5/visibility/compliance/findings/${findingId}/remediate`, {
        method: 'POST',
        tenantId
    });
    if (res.ok) return { ok: true };
    return { ok: false, errorText: await res.text() };
};

export const updateFabric = async (fabricId: string, payload: any): Promise<any> => {
    const res = await fetch(`/api/v5/admin/fabrics/${fabricId}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to update fabric');
    }
    return res.json();
};

export const deleteFabric = async (fabricId: string): Promise<void> => {
    const res = await fetch(`/api/v5/admin/fabrics/${fabricId}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to delete fabric');
    }
};

export const fetchComplianceRules = async (): Promise<any[]> => {
    const res = await fetch('/api/v5/visibility/compliance/rules', {
        headers: getHeaders()
    });
    if (!res.ok) {
        throw new Error('Failed to fetch compliance rules');
    }
    return res.json();
};

export const updateComplianceRule = async (ruleId: string, payload: { is_active?: boolean; severity?: string }): Promise<any> => {
    const res = await fetch(`/api/v5/visibility/compliance/rules/${ruleId}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to update compliance rule');
    }
    return res.json();
};

export const fetchProvisioningJobs = async (): Promise<any[]> => {
    const res = await fetch('/api/v5/admin/provisioning-jobs', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch provisioning jobs');
    return res.json();
};

export const fetchProvisioningJobDetail = async (jobId: string): Promise<any> => {
    const res = await fetch(`/api/v5/admin/provisioning-jobs/${jobId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch provisioning job details');
    return res.json();
};

interface ApiRequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
    body?: unknown;
    token?: string | null;
    tenantId?: string | null;
    noAuth?: boolean;
}

const apiRequest = async (path: string, options: ApiRequestOptions = {}): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!options.noAuth) headers['Authorization'] = `Bearer ${options.token ?? localStorage.getItem('atlas_jwt')}`;
    if (options.tenantId) headers['X-Tenant-ID'] = options.tenantId;
    return fetch(path, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
};

// ── Health / auth ────────────────────────────────────────────────────────────
export const checkBackendHealth = async (): Promise<boolean> => {
    const res = await apiRequest('/api/v5/', { method: 'HEAD', noAuth: true });
    return res.ok;
};

export const loginUser = async (username: string, password: string) => {
    const res = await apiRequest('/api/v5/auth/login', {
        method: 'POST',
        noAuth: true,
        body: { username, password }
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
};

// ── Inventory / switch lifecycle ─────────────────────────────────────────────
export const fetchInventory = async (params?: URLSearchParams, tenantId?: string | null) => {
    const qs = params ? `?${params.toString()}` : '';
    const res = await apiRequest(`/api/v5/visibility/inventory${qs}`, { tenantId });
    if (!res.ok) return null;
    return res.json();
};

export const fetchAdminSwitches = async (tenantId?: string | null) => {
    const res = await apiRequest('/api/v5/admin/switches', { tenantId });
    if (!res.ok) return null;
    return res.json();
};

export const createSwitch = async (body: Record<string, unknown>) => {
    const res = await apiRequest('/api/v5/admin/switches', { method: 'POST', body });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create switch');
    }
    return res.json();
};

export const updateSwitch = async (switchId: string, body: Record<string, unknown>): Promise<void> => {
    const res = await apiRequest(`/api/v5/admin/switches/${switchId}`, { method: 'PUT', body });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to update switch');
    }
};

export const deleteSwitch = async (switchId: string): Promise<void> => {
    const res = await apiRequest(`/api/v5/admin/switches/${switchId}`, { method: 'DELETE' });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to delete switch');
    }
};

interface InterfaceMap {
    interfaces: string[];
    loopbacks: string[];
    port_channels: string[];
    ethernet: string[];
    mgmt: string[];
}

const interfaceCache = new Map<string, InterfaceMap>();

export const fetchSwitchInterfaces = async (
    switchId: string,
    token?: string | null,
    tenant?: string,
    force = false,
): Promise<InterfaceMap> => {
    if (!force && interfaceCache.has(switchId)) {
        return interfaceCache.get(switchId)!;
    }
    const res = await apiRequest(`/api/v5/admin/switches/${switchId}/interfaces`, { token, tenantId: tenant });
    if (!res.ok) {
        throw new Error(`Failed to fetch interfaces: ${res.statusText}`);
    }
    const data: InterfaceMap = await res.json();
    interfaceCache.set(switchId, data);
    return data;
};

export const clearInterfaceCache = (switchId?: string) => {
    if (switchId) {
        interfaceCache.delete(switchId);
    } else {
        interfaceCache.clear();
    }
};

// ── Approvals ────────────────────────────────────────────────────────────────
export const fetchApprovalList = async (tenantId?: string | null) => {
    const res = await apiRequest('/api/v5/orchestrator/approvals', { tenantId });
    if (!res.ok) throw new Error('Failed to fetch approvals');
    return res.json();
};

export const approveApproval = async (approvalId: string): Promise<boolean> => {
    const res = await apiRequest(`/api/v5/orchestrator/approvals/${approvalId}/approve`, { method: 'POST' });
    return res.ok;
};

export const rejectApproval = async (approvalId: string): Promise<boolean> => {
    const res = await apiRequest(`/api/v5/orchestrator/approvals/${approvalId}/reject`, { method: 'POST' });
    return res.ok;
};

// ── Discovery / ZTP pool ─────────────────────────────────────────────────────
export const fetchZtpPoolAdmin = async (tenantId?: string | null) => {
    const res = await apiRequest('/api/v5/admin/ztp-pool', { tenantId });
    if (!res.ok) return null;
    return res.json();
};

export const fetchDiscoveryPool = async (tenantId?: string | null) => {
    const res = await apiRequest('/api/v5/discovery/pool', { tenantId });
    if (!res.ok) throw new Error('Failed to fetch ZTP pool');
    return res.json();
};

export const fetchDiscoveryStatus = async (discoveryId: string, tenantId?: string | null) => {
    const res = await apiRequest(`/api/v5/discovery/pool/${discoveryId}/status`, { tenantId });
    if (!res.ok) return null;
    return res.json();
};

export const retryDiscovery = async (discoveryId: string, tenantId?: string | null): Promise<void> => {
    await apiRequest(`/api/v5/discovery/pool/${discoveryId}/retry`, { method: 'POST', tenantId });
};

export const assignDiscoveryFabric = async (
    discoveryId: string,
    payload: { fabric_id: string; role: string; hostname: string }
): Promise<void> => {
    const res = await apiRequest(`/api/v5/discovery/pool/${discoveryId}/assign-fabric`, { method: 'PATCH', body: payload });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to assign fabric');
    }
};

export const removeDiscovery = async (discoveryId: string, tenantId?: string | null): Promise<void> => {
    await apiRequest(`/api/v5/discovery/pool/${discoveryId}`, { method: 'DELETE', tenantId });
};

// ── Visibility (STP / telemetry / celery / audit) ────────────────────────────
export const fetchStpStatus = async (tenantId?: string | null) => {
    const res = await apiRequest('/api/v5/visibility/stp', { tenantId });
    if (!res.ok) return null;
    return res.json();
};

export const fetchCeleryStats = async (tenantId?: string | null) => {
    const res = await apiRequest('/api/v5/admin/celery-stats', { tenantId });
    if (!res.ok) return null;
    return res.json();
};

export const fetchTelemetryMetric = async (metricName: string, tenantId?: string | null) => {
    const res = await apiRequest(`/api/v5/visibility/telemetry?metric_name=${metricName}`, { tenantId });
    if (!res.ok) return null;
    return res.json();
};

export const fetchAuditLogs = async (
    params: Record<string, string | number>,
    tenantId?: string | null
) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
    });
    const res = await apiRequest(`/api/v5/admin/audit-logs?${qs.toString()}`, { tenantId });
    if (!res.ok) return null;
    return res.json();
};

// ── Reports ──────────────────────────────────────────────────────────────────
export const fetchReportCsv = async (
    reportType: string,
    tenantId?: string | null
): Promise<{ ok: boolean; blob: Blob | null; errorText: string | null }> => {
    const res = await apiRequest(`/api/v5/visibility/reports/csv?report_type=${reportType}`, { tenantId });
    if (res.ok) return { ok: true, blob: await res.blob(), errorText: null };
    return { ok: false, blob: null, errorText: (await res.text()) || res.statusText };
};

// ── Compliance ───────────────────────────────────────────────────────────────
export const fetchComplianceLatest = async (params?: URLSearchParams, tenantId?: string | null) => {
    const qs = params ? `?${params.toString()}` : '';
    const res = await apiRequest(`/api/v5/visibility/compliance/latest${qs}`, { tenantId });
    if (!res.ok) return null;
    return res.json();
};

export const fetchComplianceHistory = async (tenantId?: string | null) => {
    const res = await apiRequest('/api/v5/visibility/compliance/history?limit=30', { tenantId });
    if (!res.ok) return null;
    return res.json();
};

export const runComplianceAudit = async (tenantId?: string | null): Promise<{ ok: boolean; errorText?: string }> => {
    const res = await apiRequest('/api/v5/visibility/compliance/run', { method: 'POST', tenantId });
    if (res.ok) return { ok: true };
    return { ok: false, errorText: await res.text() };
};

export const fetchComplianceRunDetail = async (runId: string, tenantId?: string | null) => {
    const res = await apiRequest(`/api/v5/visibility/compliance/runs/${runId}`, { tenantId });
    if (!res.ok) return null;
    return res.json();
};

// ── Topology ─────────────────────────────────────────────────────────────────
export const fetchTopologyGraph = async (tenantId?: string | null) => {
    const res = await apiRequest('/api/v5/topology/graph', { tenantId });
    if (!res.ok) return null;
    return res.json();
};

export const fetchEndpoints = async (tenantId?: string | null) => {
    const res = await apiRequest('/api/v5/visibility/endpoints', { tenantId });
    if (!res.ok) return null;
    return res.json();
};

// ── Config push ──────────────────────────────────────────────────────────────
export const fetchSwitchConfigHistory = async (tenantId?: string | null) => {
    const res = await apiRequest('/api/v5/switch-config/history', { tenantId });
    if (!res.ok) return null;
    return res.json();
};

export const pushSwitchConfig = async (
    switchIds: string[],
    configPayload: string,
    dryRun: boolean,
    tenantId?: string | null
) => {
    const res = await apiRequest('/api/v5/switch-config/push', {
        method: 'POST',
        tenantId,
        body: { switch_ids: switchIds, config_payload: configPayload, dry_run: dryRun }
    });
    const data = await res.json();
    return { ok: res.ok, data };
};

// ── Fabrics (quiet load for dropdowns: no tenant header, null on !ok) ────────
export const fetchFabricsQuiet = async () => {
    const res = await apiRequest('/api/v5/admin/fabrics');
    if (!res.ok) return null;
    return res.json();
};

// ── Backups ──────────────────────────────────────────────────────────────────
export const fetchBackups = async () => {
    const res = await apiRequest('/api/v5/backups');
    if (!res.ok) return null;
    return res.json();
};

export const fetchBackupSchedules = async () => {
    const res = await apiRequest('/api/v5/backups/schedules');
    if (!res.ok) return null;
    return res.json();
};

export const fetchBackupTaskStatus = async (taskId: string) => {
    const res = await apiRequest(`/api/v5/backups/tasks/${taskId}`);
    if (!res.ok) return null;
    return res.json();
};

export const createBackupSnapshot = async (
    switchId: string
) => {
    const res = await apiRequest('/api/v5/backups/snapshot', { method: 'POST', body: { switch_id: switchId } });
    if (res.ok) return { ok: true, data: await res.json() };
    const err = await res.json();
    return { ok: false, detail: err.detail };
};

export const fetchBackupContent = async (backupId: string) => {
    const res = await apiRequest(`/api/v5/backups/${backupId}/content`);
    if (!res.ok) return null;
    return res.json();
};

export const fetchBackupDiff = async (backupId: string) => {
    const res = await apiRequest(`/api/v5/backups/diff/${backupId}`);
    if (!res.ok) return null;
    return res.json();
};

export const restoreBackup = async (
    backupId: string
) => {
    const res = await apiRequest('/api/v5/backups/restore', { method: 'POST', body: { backup_id: backupId } });
    if (res.ok) return { ok: true, data: await res.json() };
    const err = await res.json();
    return { ok: false, detail: err.detail };
};

export const createBackupSchedule = async (fabricId: string | null, scheduleInterval: string): Promise<boolean> => {
    const res = await apiRequest('/api/v5/backups/schedules', {
        method: 'POST',
        body: { fabric_id: fabricId, schedule_interval: scheduleInterval }
    });
    return res.ok;
};

export const deleteBackupSchedule = async (scheduleId: string): Promise<boolean> => {
    const res = await apiRequest(`/api/v5/backups/schedules/${scheduleId}`, { method: 'DELETE' });
    return res.ok;
};

// ── IPAM ─────────────────────────────────────────────────────────────────────
export const fetchAllSubnets = async () => {
    const res = await apiRequest('/api/v5/admin/subnets');
    if (!res.ok) throw new Error('Failed to fetch subnets');
    return res.json();
};

export const searchIp = async (ip: string) => {
    const res = await apiRequest(`/api/v5/ipam/search?ip=${ip}`);
    if (!res.ok) return null;
    return res.json();
};

// ── Switch snapshots / rollback / drift ──────────────────────────────────────
export const fetchSwitchSnapshots = async (switchId: string) => {
    const res = await apiRequest(`/api/v5/visibility/snapshots?switch_id=${switchId}`);
    if (!res.ok) return null;
    return res.json();
};

export const takeSwitchSnapshot = async (switchId: string): Promise<{ ok: boolean; detail?: string }> => {
    const res = await apiRequest(`/api/v5/visibility/snapshots?switch_id=${switchId}`, { method: 'POST' });
    if (res.ok) return { ok: true };
    const err = await res.json().catch(() => ({}));
    return { ok: false, detail: err.detail };
};

export const rollbackSwitchConfig = async (
    snapshotId: string,
    dryRun: boolean
) => {
    const res = await apiRequest('/api/v5/visibility/rollback', {
        method: 'POST',
        body: { snapshot_id: snapshotId, dry_run: dryRun }
    });
    if (res.ok) return { ok: true, data: await res.json().catch(() => ({})) };
    const err = await res.json().catch(() => ({}));
    return { ok: false, detail: err.detail };
};

export const acceptSwitchDrift = async (switchId: string): Promise<{ ok: boolean; detail?: string }> => {
    const res = await apiRequest('/api/v5/visibility/accept-drift', {
        method: 'POST',
        body: { switch_id: switchId }
    });
    if (res.ok) return { ok: true };
    const err = await res.json().catch(() => ({}));
    return { ok: false, detail: err.detail };
};

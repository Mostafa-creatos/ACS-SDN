import type { User } from './types';

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

export const grantTenantAccess = async (userId: string, tenantId: string, role: string): Promise<void> => {
    const res = await fetch(`/api/v5/users/${userId}/tenants`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ tenant_id: tenantId, role })
    });
    if (!res.ok) throw new Error('Failed to grant tenant access');
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

export interface VrfCreate {
    tenant_id: string;
    vrf_name: string;
    layer3_vni: number;
    route_distinguisher?: string;
    route_target?: string;
}

export interface VrfUpdate {
    layer3_vni?: number;
    route_distinguisher?: string;
    route_target?: string;
}

export interface SubnetCreate {
    fabric_id: string;
    vlan_id: number;
    layer2_vni: number;
    subnet_cidr: string;
    anycast_gateway_ip: string;
}

export const fetchFabrics = async (): Promise<any[]> => {
    const res = await fetch('/api/v5/admin/fabrics', { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch fabrics');
    return res.json();
};

export const fetchVrfs = async (tenantId?: string): Promise<any[]> => {
    const url = tenantId ? `/api/v5/admin/vrfs?tenant_id=${tenantId}` : '/api/v5/admin/vrfs';
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch VRFs');
    return res.json();
};

export const createVrf = async (data: VrfCreate): Promise<any> => {
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

export const updateVrf = async (vrfId: string, data: VrfUpdate): Promise<any> => {
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

export const createSubnet = async (vrfId: string, data: SubnetCreate): Promise<any> => {
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

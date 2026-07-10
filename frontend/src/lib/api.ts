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

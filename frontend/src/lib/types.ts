export interface TenantMembership {
    tenantId: string;
    tenantName: string;
    role: string;
}

export interface User {
    user_id: string;
    username: string;
    is_active: boolean;
    last_login_at: string | null;
    role_in_tenant: string;
    tenantMemberships?: TenantMembership[]; // Optional for when we fetch details
}

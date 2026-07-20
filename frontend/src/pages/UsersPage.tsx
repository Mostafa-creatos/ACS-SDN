import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchUsers, createUser, deactivateUser, updateUser, revokeTenantAccess } from '../lib/api';
import type { User } from '../lib/types';
import { Trash2, UserPlus, CheckCircle2, XCircle } from 'lucide-react';

export const UsersPage: React.FC = () => {
    const { user } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newRole, setNewRole] = useState('operator');
    
    // Manage access modal
    const [manageUser, setManageUser] = useState<User | null>(null);

    const isPlatformAdmin = user?.role === 'Platform Admin' || user?.role === 'platform_admin';
    const isTenantAdmin = user?.role === 'Tenant Admin' || user?.role === 'tenant_admin' || isPlatformAdmin;

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const data = await fetchUsers();
            setUsers(data);
        } catch (e) {
            console.error('Failed to load users', e);
        } finally {
            setLoading(false);
        }
    };

    const handleInvite = async () => {
        try {
            await createUser({ username: newUsername, role: newRole });
            setShowInviteModal(false);
            setNewUsername('');
            loadUsers();
        } catch (e) {
            alert('Error creating user');
        }
    };

    const handleDeactivate = async (id: string) => {
        if (window.confirm("Are you sure you want to deactivate this user? They will no longer be able to log in.")) {
            try {
                await deactivateUser(id);
                loadUsers();
            } catch (e) {
                alert('Error deactivating user');
            }
        }
    };

    const handleRoleChange = async (id: string, role: string) => {
        try {
            await updateUser(id, { role });
            loadUsers();
        } catch (e) {
            alert('Error updating role');
        }
    };

    const handleRevokeAccess = async (userId: string, tenantId: string) => {
        try {
            await revokeTenantAccess(userId, tenantId);
            setManageUser(null);
            loadUsers();
        } catch (e) {
            alert('Error revoking access');
        }
    };

    if (!isTenantAdmin) {
        return <div className="p-8 text-center text-slate-500">You do not have permission to view this page.</div>;
    }

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Users & Access</h1>
                    <p className="text-slate-500 text-sm mt-1">Manage users and RBAC policies for this tenant.</p>
                </div>
                <button 
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-2 bg-atlas-teal text-white px-4 py-2 rounded-lg hover:bg-teal-600 transition"
                >
                    <UserPlus className="w-4 h-4" />
                    Invite User
                </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <tr>
                            <th className="px-6 py-4 font-medium">User</th>
                            <th className="px-6 py-4 font-medium">Status</th>
                            <th className="px-6 py-4 font-medium">Tenant Role</th>
                            <th className="px-6 py-4 font-medium">Last Login</th>
                            <th className="px-6 py-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={5} className="p-6 text-center text-slate-500">Loading...</td></tr>
                        ) : users.map(u => (
                            <tr key={u.user_id} className="hover:bg-slate-50/50 transition">
                                <td className="px-6 py-4">
                                    <div className="font-medium text-slate-800">{u.username}</div>
                                    <div className="text-xs text-slate-400 font-mono">{u.user_id.split('-')[0]}</div>
                                </td>
                                <td className="px-6 py-4">
                                    {u.is_active ? (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Active
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                            <XCircle className="w-3.5 h-3.5" /> Inactive
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <select 
                                        className="border-slate-200 rounded-md text-sm shadow-sm"
                                        value={u.role_in_tenant}
                                        onChange={(e) => handleRoleChange(u.user_id, e.target.value)}
                                        disabled={!isPlatformAdmin && u.role_in_tenant === 'platform_admin'}
                                    >
                                        <option value="readonly">Read-Only</option>
                                        <option value="operator">Operator</option>
                                        <option value="tenant_admin">Tenant Admin</option>
                                        {isPlatformAdmin && <option value="platform_admin">Platform Admin</option>}
                                    </select>
                                </td>
                                <td className="px-6 py-4 text-slate-500">
                                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-3">
                                        {isPlatformAdmin && (
                                            <button 
                                                onClick={() => setManageUser(u)}
                                                className="text-atlas-teal hover:text-teal-700 font-medium text-xs bg-teal-50 px-2 py-1 rounded border border-teal-100"
                                            >
                                                Manage Tenants
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => handleDeactivate(u.user_id)}
                                            className="text-red-500 hover:bg-red-50 p-1.5 rounded"
                                            title="Deactivate User"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-xl font-bold mb-4">Invite User</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Username / Email</label>
                                <input 
                                    type="text" 
                                    className="w-full border-slate-300 rounded-lg shadow-sm"
                                    value={newUsername}
                                    onChange={e => setNewUsername(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Initial Role</label>
                                <select 
                                    className="w-full border-slate-300 rounded-lg shadow-sm"
                                    value={newRole}
                                    onChange={e => setNewRole(e.target.value)}
                                >
                                    <option value="readonly">Read-Only</option>
                                    <option value="operator">Operator</option>
                                    <option value="tenant_admin">Tenant Admin</option>
                                    {isPlatformAdmin && <option value="platform_admin">Platform Admin</option>}
                                </select>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setShowInviteModal(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
                            <button onClick={handleInvite} className="px-4 py-2 bg-atlas-teal text-white rounded-lg hover:bg-teal-600">Invite</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manage Tenants Panel */}
            {manageUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
                        <h3 className="text-xl font-bold mb-4">Manage Access for {manageUser.username}</h3>
                        <p className="text-sm text-slate-500 mb-4">Platform Admins can grant or revoke access to multiple tenants.</p>
                        
                        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-medium text-sm">Current Context</span>
                                <button 
                                    className="text-red-500 text-sm hover:underline"
                                    onClick={() => {
                                        const tenantId = manageUser.tenantMemberships?.[0]?.tenantId;
                                        if (tenantId) handleRevokeAccess(manageUser.user_id, tenantId);
                                    }}
                                >Revoke</button>
                            </div>
                            <div className="text-xs text-slate-500">Role: {manageUser.role_in_tenant}</div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setManageUser(null)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">Close</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchTenants, createTenant, deleteTenant } from '../lib/api';
import { Building2, Plus, Trash2 } from 'lucide-react';

export const TenantsPage: React.FC = () => {
    const { user } = useAuth();
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [newTenantName, setNewTenantName] = useState('');

    const isPlatformAdmin = user?.role === 'Platform Admin' || user?.role === 'platform_admin';

    useEffect(() => {
        if (isPlatformAdmin) {
            loadTenants();
        } else {
            setLoading(false);
        }
    }, [isPlatformAdmin]);

    const loadTenants = async () => {
        try {
            setLoading(true);
            const data = await fetchTenants();
            setTenants(data);
        } catch (e) {
            console.error('Failed to load tenants', e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newTenantName) return;
        try {
            await createTenant(newTenantName);
            setShowModal(false);
            setNewTenantName('');
            loadTenants();
        } catch (e) {
            alert('Failed to create tenant. Ensure name is unique.');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (window.confirm(`Are you sure you want to delete tenant ${name}? This action cannot be undone.`)) {
            try {
                await deleteTenant(id);
                loadTenants();
            } catch (e) {
                alert('Failed to delete tenant. Default tenants cannot be deleted.');
            }
        }
    };

    if (!isPlatformAdmin) {
        return <div className="p-8 text-center text-slate-500">You do not have permission to view this page.</div>;
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Tenant Management</h1>
                    <p className="text-slate-500 mt-1">Create and manage logical isolated tenants across the fabric.</p>
                </div>
                <button 
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-sm shadow-emerald-200"
                >
                    <Plus className="w-5 h-5" />
                    Create Tenant
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-4 font-medium">Tenant Name</th>
                            <th className="px-6 py-4 font-medium">Tenant ID</th>
                            <th className="px-6 py-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={3} className="p-6 text-center text-slate-500">Loading...</td></tr>
                        ) : tenants.length === 0 ? (
                            <tr><td colSpan={3} className="p-6 text-center text-slate-500">No tenants found.</td></tr>
                        ) : tenants.map(t => (
                            <tr key={t.tenant_id} className="hover:bg-slate-50/50 transition">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-indigo-50 p-2 rounded-lg text-indigo-500">
                                            <Building2 className="w-5 h-5" />
                                        </div>
                                        <span className="font-medium text-slate-800">{t.tenant_name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-slate-400">
                                    {t.tenant_id}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button 
                                        onClick={() => handleDelete(t.tenant_id, t.tenant_name)}
                                        className="text-slate-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50"
                                        title="Delete Tenant"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-xl font-semibold text-slate-800">Create New Tenant</h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Tenant Name</label>
                                <input 
                                    type="text" 
                                    className="w-full border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                    placeholder="e.g. Acme Corporation"
                                    value={newTenantName}
                                    onChange={e => setNewTenantName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <button 
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleCreate}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-lg font-medium shadow-sm transition-all"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

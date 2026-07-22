import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchTenants, createTenant, deleteTenant, fetchFabrics, createFabric } from '../lib/api';
import { Building2, Plus, Trash2, Network, Globe } from 'lucide-react';

export const TenantsPage: React.FC = () => {
    const { user } = useAuth();
    const [tenants, setTenants] = useState<any[]>([]);
    const [fabrics, setFabrics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [fabricsLoading, setFabricsLoading] = useState(true);
    
    const [showTenantModal, setShowTenantModal] = useState(false);
    const [newTenantName, setNewTenantName] = useState('');

    const [showFabricModal, setShowFabricModal] = useState(false);
    const [newFabricName, setNewFabricName] = useState('');
    const [newFabricAsn, setNewFabricAsn] = useState<number | ''>('');

    const isPlatformAdmin = user?.role === 'Platform Admin' || user?.role === 'platform_admin';

    useEffect(() => {
        if (isPlatformAdmin) {
            loadTenants();
            loadFabrics();
        } else {
            setLoading(false);
            setFabricsLoading(false);
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

    const loadFabrics = async () => {
        try {
            setFabricsLoading(true);
            const data = await fetchFabrics();
            setFabrics(data);
        } catch (e) {
            console.error('Failed to load fabrics', e);
        } finally {
            setFabricsLoading(false);
        }
    };

    const handleCreateTenant = async () => {
        if (!newTenantName) return;
        try {
            await createTenant(newTenantName);
            setShowTenantModal(false);
            setNewTenantName('');
            loadTenants();
        } catch (e) {
            alert('Failed to create tenant. Ensure name is unique.');
        }
    };

    const handleCreateFabric = async () => {
        if (!newFabricName || newFabricAsn === '') return;
        try {
            await createFabric(newFabricName, Number(newFabricAsn));
            setShowFabricModal(false);
            setNewFabricName('');
            setNewFabricAsn('');
            loadFabrics();
        } catch (e: any) {
            alert(e.message || 'Failed to create fabric. Ensure name is unique.');
        }
    };

    const handleDeleteTenant = async (id: string, name: string) => {
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
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            {/* Header section */}
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 font-display">Tenant & Fabric Management</h1>
                    <p className="text-slate-500 mt-1">Configure isolated logical tenants and define physical overlay fabrics.</p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowFabricModal(true)}
                        className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-600 px-4 py-2.5 rounded-lg font-semibold text-xs border border-indigo-100 transition-all shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Create Fabric
                    </button>
                    <button 
                        onClick={() => setShowTenantModal(true)}
                        className="flex items-center gap-2 bg-atlas-primary hover:bg-atlas-primary/95 text-white px-4 py-2.5 rounded-lg font-semibold text-xs transition-all shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Create Tenant
                    </button>
                </div>
            </div>

            {/* Two-Column Grid: Left (Tenants), Right (Fabrics) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Tenants Column (Takes 2 cols) */}
                <div className="lg:col-span-2 space-y-4">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider px-1">Registered Tenants</h3>
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
                                    <tr><td colSpan={3} className="p-6 text-center text-slate-400">Loading tenants...</td></tr>
                                ) : tenants.length === 0 ? (
                                    <tr><td colSpan={3} className="p-6 text-center text-slate-400">No tenants found.</td></tr>
                                ) : tenants.map(t => (
                                    <tr key={t.tenant_id} className="hover:bg-slate-50/50 transition">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-indigo-50 p-2 rounded-lg text-indigo-500 border border-indigo-100/50">
                                                    <Building2 className="w-5 h-5" />
                                                </div>
                                                <span className="font-semibold text-slate-800">{t.tenant_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs text-slate-400">
                                            {t.tenant_id}
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-1">
                                            <Link 
                                                to={`/tenants/${t.tenant_id}/mapping`}
                                                className="text-slate-400 hover:text-atlas-primary transition-colors p-2 rounded-lg hover:bg-slate-50 inline-block align-middle"
                                                title="Manage VRF and Fabric Mapping"
                                            >
                                                <Network className="w-4 h-4" />
                                            </Link>
                                            <button 
                                                onClick={() => handleDeleteTenant(t.tenant_id, t.tenant_name)}
                                                className="text-slate-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50 inline-block align-middle"
                                                title="Delete Tenant"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Fabrics Column (Takes 1 col) */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider px-1">Network Fabrics</h3>
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
                        {fabricsLoading ? (
                            <div className="text-slate-400 text-xs py-8 text-center">Loading fabrics...</div>
                        ) : fabrics.length === 0 ? (
                            <div className="text-slate-400 text-xs py-8 text-center">No fabrics declared.</div>
                        ) : (
                            <div className="space-y-3">
                                {fabrics.map((f) => (
                                    <div key={f.fabric_id} className="p-4 rounded-xl bg-slate-50/50 border border-slate-100 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-emerald-50 border border-emerald-100 text-emerald-600 p-2 rounded-lg">
                                                <Globe className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="font-semibold text-xs text-slate-800">{f.fabric_name}</div>
                                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">ASN: {f.global_bgp_asn}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal: Create Tenant */}
            {showTenantModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-base font-bold text-slate-800 font-display">Create New Tenant</h2>
                            <button onClick={() => setShowTenantModal(false)} className="text-slate-400 hover:text-slate-600">
                                <Plus className="w-5 h-5 rotate-45" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tenant Name</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-200 rounded-lg px-4 py-2 text-xs outline-none focus:border-atlas-primary transition-all font-sans"
                                    placeholder="e.g. Acme Corporation"
                                    value={newTenantName}
                                    onChange={e => setNewTenantName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                            <button 
                                onClick={() => setShowTenantModal(false)}
                                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleCreateTenant}
                                className="bg-atlas-primary hover:bg-atlas-primary/95 text-white px-5 py-2 rounded-lg font-semibold text-xs shadow-sm transition-all"
                            >
                                Create Tenant
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Create Fabric */}
            {showFabricModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-base font-bold text-slate-800 font-display">Create New Fabric</h2>
                            <button onClick={() => setShowFabricModal(false)} className="text-slate-400 hover:text-slate-600">
                                <Plus className="w-5 h-5 rotate-45" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Fabric Name</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-200 rounded-lg px-4 py-2 text-xs outline-none focus:border-atlas-primary transition-all font-sans"
                                    placeholder="e.g. DataCenter-West"
                                    value={newFabricName}
                                    onChange={e => setNewFabricName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Global BGP ASN</label>
                                <input 
                                    type="number" 
                                    className="w-full border border-slate-200 rounded-lg px-4 py-2 text-xs outline-none focus:border-atlas-primary transition-all font-sans"
                                    placeholder="e.g. 65100"
                                    value={newFabricAsn}
                                    onChange={e => setNewFabricAsn(e.target.value ? Number(e.target.value) : '')}
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                            <button 
                                onClick={() => setShowFabricModal(false)}
                                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleCreateFabric}
                                className="bg-atlas-primary hover:bg-atlas-primary/95 text-white px-5 py-2 rounded-lg font-semibold text-xs shadow-sm transition-all"
                            >
                                Create Fabric
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
export default TenantsPage;

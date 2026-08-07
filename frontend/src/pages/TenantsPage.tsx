import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchTenants, createTenant, deleteTenant, fetchFabrics, createFabric, updateFabric } from '../lib/api';
import { Building2, Plus, Trash2, Network, Globe, Pencil } from 'lucide-react';

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
    const [newFabricNtp, setNewFabricNtp] = useState('192.168.100.1');
    const [newFabricDns, setNewFabricDns] = useState('8.8.8.8');
    const [newFabricSyslog, setNewFabricSyslog] = useState('10.10.100.5');
    const [newFabricLoopbackPool, setNewFabricLoopbackPool] = useState('10.200.1.0/24');
    const [newFabricVtepPool, setNewFabricVtepPool] = useState('10.250.1.0/24');
    const [editingFabricId, setEditingFabricId] = useState<string | null>(null);

    const isPlatformAdmin = user?.role === 'Platform Admin' || user?.role === 'platform_admin';
    const isOperator = user?.role === 'Operator';

    useEffect(() => {
        if (isPlatformAdmin || isOperator) {
            if (isPlatformAdmin) {
                loadTenants();
            }
            loadFabrics();
        } else {
            setLoading(false);
            setFabricsLoading(false);
        }
    }, [isPlatformAdmin, isOperator]);

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

    const handleStartEditFabric = (fabric: any) => {
        setEditingFabricId(fabric.fabric_id);
        setNewFabricName(fabric.fabric_name);
        setNewFabricAsn(fabric.global_bgp_asn);
        setNewFabricNtp(fabric.expected_ntp_servers || '192.168.100.1');
        setNewFabricDns(fabric.expected_dns_servers || '8.8.8.8');
        setNewFabricSyslog(fabric.expected_syslog_server || '10.10.100.5');
        setNewFabricLoopbackPool(fabric.loopback_pool || '10.200.1.0/24');
        setNewFabricVtepPool(fabric.vtep_pool || '10.250.1.0/24');
        setShowFabricModal(true);
    };

    const handleCreateFabric = async () => {
        if (!newFabricName || newFabricAsn === '') return;
        try {
            if (editingFabricId) {
                await updateFabric(editingFabricId, {
                    fabric_name: newFabricName,
                    global_bgp_asn: Number(newFabricAsn),
                    expected_ntp_servers: newFabricNtp,
                    expected_dns_servers: newFabricDns,
                    expected_syslog_server: newFabricSyslog,
                    loopback_pool: newFabricLoopbackPool,
                    vtep_pool: newFabricVtepPool
                });
            } else {
                await createFabric(
                    newFabricName, 
                    Number(newFabricAsn), 
                    newFabricNtp, 
                    newFabricDns, 
                    newFabricSyslog,
                    newFabricLoopbackPool,
                    newFabricVtepPool
                );
            }
            setShowFabricModal(false);
            setEditingFabricId(null);
            setNewFabricName('');
            setNewFabricAsn('');
            setNewFabricNtp('192.168.100.1');
            setNewFabricDns('8.8.8.8');
            setNewFabricSyslog('10.10.100.5');
            setNewFabricLoopbackPool('10.200.1.0/24');
            setNewFabricVtepPool('10.250.1.0/24');
            loadFabrics();
        } catch (e: any) {
            alert(e.message || 'Failed to save fabric. Ensure name is unique.');
        }
    };

    const handleDeleteFabric = async (id: string, name: string) => {
        if (window.confirm(`Are you sure you want to delete fabric ${name}? This action cannot be undone.`)) {
            try {
                // Use imported deleteFabric from lib/api
                const { deleteFabric } = await import('../lib/api');
                await deleteFabric(id);
                loadFabrics();
            } catch (e: any) {
                alert(e.message || 'Failed to delete fabric.');
            }
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

    if (!isPlatformAdmin && !isOperator) {
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
                    {isPlatformAdmin && (
                        <button 
                            onClick={() => setShowTenantModal(true)}
                            className="flex items-center gap-2 bg-atlas-primary hover:bg-atlas-primary/95 text-white px-4 py-2.5 rounded-lg font-semibold text-xs transition-all shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Create Tenant
                        </button>
                    )}
                </div>
            </div>

            {/* Two-Column Grid: Left (Tenants), Right (Fabrics) */}
            <div className={`grid grid-cols-1 ${isPlatformAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-1'} gap-8`}>
                {/* Tenants Column (Takes 2 cols) */}
                {isPlatformAdmin && (
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
                )}

                {/* Fabrics Column (Takes 1 col) */}
                <div className={`${isPlatformAdmin ? 'lg:col-span-1' : 'w-full'} space-y-4`}>
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
                                                <div className="text-[9px] text-slate-400 font-sans mt-0.5">
                                                    Loopback: {f.loopback_pool} | VTEP: {f.vtep_pool}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={() => handleStartEditFabric(f)}
                                                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                                                title="Edit Fabric Properties"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteFabric(f.fabric_id, f.fabric_name)}
                                                className="text-slate-400 hover:text-rose-500 p-1.5 hover:bg-rose-50 rounded-lg transition-colors"
                                                title="Delete Fabric"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
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
                            <h2 className="text-base font-bold text-slate-800 font-display">{editingFabricId ? 'Edit Fabric Properties' : 'Create New Fabric'}</h2>
                            <button onClick={() => { setShowFabricModal(false); setEditingFabricId(null); }} className="text-slate-400 hover:text-slate-600">
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
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Expected NTP Server IP</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-200 rounded-lg px-4 py-2 text-xs outline-none focus:border-atlas-primary transition-all font-sans"
                                    placeholder="e.g. 192.168.100.1"
                                    value={newFabricNtp}
                                    onChange={e => setNewFabricNtp(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Expected DNS Name Server IP</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-200 rounded-lg px-4 py-2 text-xs outline-none focus:border-atlas-primary transition-all font-sans"
                                    placeholder="e.g. 8.8.8.8"
                                    value={newFabricDns}
                                    onChange={e => setNewFabricDns(e.target.value)}
                                />
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Expected Syslog Server IP</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-200 rounded-lg px-4 py-2 text-xs outline-none focus:border-atlas-primary transition-all font-sans"
                                    placeholder="e.g. 10.10.100.5"
                                    value={newFabricSyslog}
                                    onChange={e => setNewFabricSyslog(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Loopback IP Pool</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-200 rounded-lg px-4 py-2 text-xs outline-none focus:border-atlas-primary transition-all font-sans"
                                    placeholder="e.g. 10.200.1.0/24"
                                    value={newFabricLoopbackPool}
                                    onChange={e => setNewFabricLoopbackPool(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">VTEP IP Pool</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-200 rounded-lg px-4 py-2 text-xs outline-none focus:border-atlas-primary transition-all font-sans"
                                    placeholder="e.g. 10.250.1.0/24"
                                    value={newFabricVtepPool}
                                    onChange={e => setNewFabricVtepPool(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                            <button 
                                onClick={() => { setShowFabricModal(false); setEditingFabricId(null); }}
                                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleCreateFabric}
                                className="bg-atlas-primary hover:bg-atlas-primary/95 text-white px-5 py-2 rounded-lg font-semibold text-xs shadow-sm transition-all"
                            >
                                {editingFabricId ? 'Save Changes' : 'Create Fabric'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
export default TenantsPage;

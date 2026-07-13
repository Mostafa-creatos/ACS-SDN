import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { 
  Network, 
  Plus, 
  Trash2, 
  Edit3, 
  ChevronDown, 
  ChevronRight, 
  FolderTree,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';
import { 
  fetchTenants, 
  fetchVrfs, 
  createVrf, 
  updateVrf, 
  deleteVrf, 
  fetchSubnets, 
  createSubnet, 
  deleteSubnet, 
  fetchFabrics 
} from '../lib/api';

export const TenantFabricMapping: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  
  const [tenantName, setTenantName] = useState('Loading...');
  const [tenantLoading, setTenantLoading] = useState(true);
  
  const [vrfs, setVrfs] = useState<any[]>([]);
  const [vrfsLoading, setVrfsLoading] = useState(true);
  
  const [expandedVrfIds, setExpandedVrfIds] = useState<Record<string, boolean>>({});
  const [subnets, setSubnets] = useState<Record<string, any[]>>({});
  const [subnetsLoading, setSubnetsLoading] = useState<Record<string, boolean>>({});
  
  const [fabrics, setFabrics] = useState<any[]>([]);
  const [fabricsLoading, setFabricsLoading] = useState(false);

  // Modals state
  const [isAddVrfOpen, setIsAddVrfOpen] = useState(false);
  const [isEditVrfOpen, setIsEditVrfOpen] = useState(false);
  const [isAddSubnetOpen, setIsAddSubnetOpen] = useState(false);
  const [selectedVrf, setSelectedVrf] = useState<any>(null);
  
  const [validationError, setValidationError] = useState<string | null>(null);

  // Form states
  const [vrfForm, setVrfForm] = useState({
    vrf_name: '',
    layer3_vni: '5000',
    route_distinguisher: 'auto',
    route_target: 'both auto'
  });
  
  const [subnetForm, setSubnetForm] = useState({
    fabric_id: '',
    vlan_id: '100',
    layer2_vni: '10100',
    subnet_cidr: '',
    anycast_gateway_ip: ''
  });

  const loadTenantAndVrfs = async () => {
    if (!tenantId) return;
    setTenantLoading(true);
    setVrfsLoading(true);
    try {
      // 1. Fetch all tenants to find the name
      const tenantList = await fetchTenants();
      const matched = tenantList.find(t => t.tenant_id === tenantId);
      if (matched) {
        setTenantName(matched.tenant_name);
      } else {
        setTenantName('Unknown Tenant');
      }
    } catch (err) {
      console.error('Failed to load tenant info', err);
      setTenantName('Error loading tenant');
    } finally {
      setTenantLoading(false);
    }

    try {
      // 2. Fetch VRFs for this tenant
      const vrfList = await fetchVrfs(tenantId);
      setVrfs(vrfList);
    } catch (err) {
      console.error('Failed to load VRFs', err);
    } finally {
      setVrfsLoading(false);
    }
  };

  const loadSubnets = async (vrfId: string) => {
    setSubnetsLoading(prev => ({ ...prev, [vrfId]: true }));
    try {
      const subnetList = await fetchSubnets(vrfId);
      setSubnets(prev => ({ ...prev, [vrfId]: subnetList }));
    } catch (err) {
      console.error(`Failed to load subnets for VRF ${vrfId}`, err);
    } finally {
      setSubnetsLoading(prev => ({ ...prev, [vrfId]: false }));
    }
  };

  const loadFabrics = async () => {
    setFabricsLoading(true);
    try {
      const fabList = await fetchFabrics();
      setFabrics(fabList);
      if (fabList.length > 0) {
        setSubnetForm(prev => ({ ...prev, fabric_id: fabList[0].fabric_id }));
      }
    } catch (err) {
      console.error('Failed to load fabrics', err);
    } finally {
      setFabricsLoading(false);
    }
  };

  useEffect(() => {
    loadTenantAndVrfs();
  }, [tenantId]);

  const toggleVrfExpand = (vrfId: string) => {
    const isExpanded = !expandedVrfIds[vrfId];
    setExpandedVrfIds(prev => ({ ...prev, [vrfId]: isExpanded }));
    if (isExpanded) {
      loadSubnets(vrfId);
    }
  };

  // Add VRF submit handler
  const handleAddVrfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    
    const vniNum = Number(vrfForm.layer3_vni);
    if (isNaN(vniNum) || vniNum < 5000 || vniNum > 16777214) {
      setValidationError('Layer 3 VNI must be an integer between 5000 and 16777214.');
      return;
    }

    try {
      await createVrf({
        tenant_id: tenantId!,
        vrf_name: vrfForm.vrf_name,
        layer3_vni: vniNum,
        route_distinguisher: vrfForm.route_distinguisher,
        route_target: vrfForm.route_target
      });
      
      setIsAddVrfOpen(false);
      // Reset form
      setVrfForm({
        vrf_name: '',
        layer3_vni: '5000',
        route_distinguisher: 'auto',
        route_target: 'both auto'
      });
      
      // Reload VRFs list
      loadTenantAndVrfs();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to create VRF.');
    }
  };

  // Edit VRF submit handler
  const handleEditVrfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const vniNum = Number(vrfForm.layer3_vni);
    if (isNaN(vniNum) || vniNum < 5000 || vniNum > 16777214) {
      setValidationError('Layer 3 VNI must be an integer between 5000 and 16777214.');
      return;
    }

    try {
      await updateVrf(selectedVrf.vrf_id, {
        layer3_vni: vniNum,
        route_distinguisher: vrfForm.route_distinguisher,
        route_target: vrfForm.route_target
      });
      
      setIsEditVrfOpen(false);
      setSelectedVrf(null);
      loadTenantAndVrfs();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to update VRF.');
    }
  };

  // Add Subnet submit handler
  const handleAddSubnetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!subnetForm.fabric_id) {
      setValidationError('Please select a valid fabric.');
      return;
    }

    const vlanNum = Number(subnetForm.vlan_id);
    if (isNaN(vlanNum) || vlanNum < 2 || vlanNum > 4094) {
      setValidationError('VLAN ID must be an integer between 2 and 4094.');
      return;
    }

    const l2VniNum = Number(subnetForm.layer2_vni);
    if (isNaN(l2VniNum) || l2VniNum < 10000 || l2VniNum > 16777214) {
      setValidationError('L2 VNI must be an integer between 10000 and 16777214.');
      return;
    }

    // Basic CIDR validation
    const cidrRegex = /^([0-9]{1,3}\.){3}[0-9]{1,3}\/([0-9]|[1-2][0-9]|3[0-2])$/;
    if (!cidrRegex.test(subnetForm.subnet_cidr)) {
      setValidationError('Invalid CIDR prefix block format (e.g. 10.0.1.0/24).');
      return;
    }

    // Gateway validation
    const ipRegex = /^([0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ipRegex.test(subnetForm.anycast_gateway_ip)) {
      setValidationError('Invalid Anycast Gateway IP address.');
      return;
    }

    try {
      await createSubnet(selectedVrf.vrf_id, {
        fabric_id: subnetForm.fabric_id,
        vlan_id: vlanNum,
        layer2_vni: l2VniNum,
        subnet_cidr: subnetForm.subnet_cidr,
        anycast_gateway_ip: subnetForm.anycast_gateway_ip
      });

      setIsAddSubnetOpen(false);
      // Reset form
      setSubnetForm(prev => ({
        ...prev,
        subnet_cidr: '',
        anycast_gateway_ip: ''
      }));

      // Reload subnets list for this VRF
      loadSubnets(selectedVrf.vrf_id);
      
      // Update VRF subnets count in table
      loadTenantAndVrfs();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to create subnet.');
    }
  };

  const handleDeleteVrf = async (vrf: any) => {
    if (!window.confirm(`Are you sure you want to delete VRF "${vrf.vrf_name}"?`)) {
      return;
    }
    try {
      await deleteVrf(vrf.vrf_id);
      loadTenantAndVrfs();
    } catch (err: any) {
      alert(err.message || 'Failed to delete VRF.');
    }
  };

  const handleDeleteSubnet = async (vrfId: string, subnet: any) => {
    if (!window.confirm(`Are you sure you want to delete subnet segment "${subnet.subnet_cidr}"?`)) {
      return;
    }
    try {
      await deleteSubnet(subnet.subnet_id);
      // Reload subnets and count
      loadSubnets(vrfId);
      loadTenantAndVrfs();
    } catch (err: any) {
      alert(err.message || 'Failed to delete subnet.');
    }
  };

  const openEditVrf = (vrf: any) => {
    setSelectedVrf(vrf);
    setVrfForm({
      vrf_name: vrf.vrf_name,
      layer3_vni: String(vrf.layer3_vni),
      route_distinguisher: vrf.route_distinguisher,
      route_target: vrf.route_target
    });
    setValidationError(null);
    setIsEditVrfOpen(true);
  };

  const openAddSubnet = (vrf: any) => {
    setSelectedVrf(vrf);
    setValidationError(null);
    loadFabrics();
    setIsAddSubnetOpen(true);
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Header */}
      <div>
        <Link to="/tenants" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors font-medium">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Tenants</span>
        </Link>
        <div className="flex justify-between items-end mt-2">
          <div>
            <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">
              {tenantLoading ? 'Loading Tenant...' : tenantName}
            </h1>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
              <FolderTree className="w-3.5 h-3.5 shrink-0" />
              <span>ID: {tenantId}</span>
            </p>
          </div>
          <button 
            onClick={() => {
              setValidationError(null);
              setIsAddVrfOpen(true);
            }}
            className="btn-primary flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add VRF</span>
          </button>
        </div>
      </div>

      {/* VRFs and Subnets Table Container */}
      <Card>
        <h3 className="text-base font-bold font-display text-atlas-ink mb-4 flex items-center gap-2">
          <Network className="w-5 h-5 text-atlas-primary" />
          <span>Tenant Virtual Routing and Overlays (VRFs)</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-3 text-left w-10"></th>
                <th className="pb-3 text-left">VRF Name</th>
                <th className="pb-3 text-left">Layer 3 VNI</th>
                <th className="pb-3 text-left">Route Distinguisher (RD)</th>
                <th className="pb-3 text-left">Route Target (RT)</th>
                <th className="pb-3 text-center">Subnets</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {vrfsLoading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500">Loading virtual routing contexts...</td>
                </tr>
              ) : vrfs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500">No VRFs defined for this tenant. Define one to map fabrics.</td>
                </tr>
              ) : (
                vrfs.map((vrf) => {
                  const isExpanded = !!expandedVrfIds[vrf.vrf_id];
                  const vrfSubnets = subnets[vrf.vrf_id] || [];
                  const isSubnetsLoading = !!subnetsLoading[vrf.vrf_id];

                  return (
                    <React.Fragment key={vrf.vrf_id}>
                      {/* Main VRF Row */}
                      <tr className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => toggleVrfExpand(vrf.vrf_id)}>
                        <td className="py-3 text-center" onClick={(e) => { e.stopPropagation(); toggleVrfExpand(vrf.vrf_id); }}>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-400 mx-auto" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400 mx-auto" />
                          )}
                        </td>
                        <td className="py-3 font-bold text-slate-800 text-xs">{vrf.vrf_name}</td>
                        <td className="py-3 font-semibold text-atlas-primary text-xs">{vrf.layer3_vni}</td>
                        <td className={`py-3 text-xs ${vrf.route_distinguisher.includes('auto') ? 'text-slate-400 italic' : 'text-slate-600 font-mono text-[11px]'}`}>
                          {vrf.route_distinguisher}
                        </td>
                        <td className={`py-3 text-xs ${vrf.route_target.includes('auto') ? 'text-slate-400 italic' : 'text-slate-600 font-mono text-[11px]'}`}>
                          {vrf.route_target}
                        </td>
                        <td className="py-3 text-center">
                          <span className="inline-flex items-center justify-center px-2 py-1 text-[10px] font-bold leading-none text-emerald-800 bg-emerald-100 rounded-full">
                            {vrf.subnets_count}
                          </span>
                        </td>
                        <td className="py-3 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                          <button 
                            onClick={() => openEditVrf(vrf)}
                            className="p-1 text-slate-400 hover:text-slate-700 transition-colors inline-block"
                            title="Edit VRF"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteVrf(vrf)}
                            className="p-1 text-slate-400 hover:text-rose-500 transition-colors inline-block"
                            title="Delete VRF"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Subnets Row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="bg-slate-50/50 p-4 border-l-2 border-atlas-primary">
                            <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                                  Subnet Overlays assigned inside "{vrf.vrf_name}"
                                </span>
                                <button 
                                  onClick={() => openAddSubnet(vrf)}
                                  className="btn bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 px-3 py-1 flex items-center gap-1 text-[11px]"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Assign Subnet Segment</span>
                                </button>
                              </div>

                              {isSubnetsLoading ? (
                                <div className="text-xs text-slate-400 text-center py-4">Querying subnets overlay details...</div>
                              ) : vrfSubnets.length === 0 ? (
                                <div className="text-xs text-slate-400 text-center py-4 bg-white border rounded-xl border-dashed">
                                  No subnets assigned in this VRF. Connect a subnet on a Fabric to enable routing.
                                </div>
                              ) : (
                                <div className="overflow-x-auto bg-white border rounded-xl shadow-sm">
                                  <table className="min-w-full">
                                    <thead>
                                      <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                                        <th className="p-3 text-left">Fabric Target</th>
                                        <th className="p-3 text-left">VLAN ID</th>
                                        <th className="p-3 text-left">Layer 2 VNI</th>
                                        <th className="p-3 text-left">Subnet CIDR Prefix</th>
                                        <th className="p-3 text-left">Gateway IP</th>
                                        <th className="p-3 text-right w-16"></th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 text-xs">
                                      {vrfSubnets.map((sub: any) => (
                                        <tr key={sub.subnet_id} className="hover:bg-slate-50/50">
                                          <td className="p-3 font-semibold text-slate-700">{sub.fabric_name}</td>
                                          <td className="p-3 text-slate-600 font-medium">VLAN {sub.vlan_id}</td>
                                          <td className="p-3 text-slate-600 font-mono">{sub.layer2_vni}</td>
                                          <td className="p-3 font-mono font-bold text-atlas-primary">{sub.subnet_cidr}</td>
                                          <td className="p-3 font-mono text-slate-500">{sub.anycast_gateway_ip}</td>
                                          <td className="p-3 text-right">
                                            <button 
                                              onClick={() => handleDeleteSubnet(vrf.vrf_id, sub)}
                                              className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                                              title="Remove subnet"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add VRF Modal */}
      {isAddVrfOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setIsAddVrfOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-2xl z-50 p-6 animate-in zoom-in-95 duration-150 border">
            <h3 className="text-base font-bold font-display text-atlas-ink mb-4">Define Virtual Routing Domain (VRF)</h3>
            
            {validationError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-lg p-3 flex gap-2 items-start mb-4">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            <form onSubmit={handleAddVrfSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">VRF Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. VRF-Production"
                  value={vrfForm.vrf_name}
                  onChange={(e) => setVrfForm({...vrfForm, vrf_name: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary font-semibold text-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Layer 3 VNI (Overlay ID)</label>
                <input 
                  type="number" 
                  required
                  placeholder="VNI range 5000 - 16777214"
                  value={vrfForm.layer3_vni}
                  onChange={(e) => setVrfForm({...vrfForm, layer3_vni: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary text-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Route Distinguisher (RD)</label>
                <input 
                  type="text" 
                  required
                  value={vrfForm.route_distinguisher}
                  onChange={(e) => setVrfForm({...vrfForm, route_distinguisher: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary font-mono text-slate-700"
                />
                <span className="text-[10px] text-slate-400 block mt-1">Specify "auto" to configure automatically based on VNI value.</span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Route Target (RT)</label>
                <input 
                  type="text" 
                  required
                  value={vrfForm.route_target}
                  onChange={(e) => setVrfForm({...vrfForm, route_target: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary font-mono text-slate-700"
                />
                <span className="text-[10px] text-slate-400 block mt-1">Specify "both auto" or specific RT (e.g. both 65001:5000).</span>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => setIsAddVrfOpen(false)}
                  className="btn bg-slate-50 border text-slate-600 px-4 py-2 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="btn-primary px-4 py-2 font-bold"
                >
                  Create VRF
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Edit VRF Modal */}
      {isEditVrfOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setIsEditVrfOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-2xl z-50 p-6 animate-in zoom-in-95 duration-150 border">
            <h3 className="text-base font-bold font-display text-atlas-ink mb-4">Edit VRF context "{selectedVrf?.vrf_name}"</h3>
            
            {validationError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-lg p-3 flex gap-2 items-start mb-4">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            <form onSubmit={handleEditVrfSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Layer 3 VNI (Overlay ID)</label>
                <input 
                  type="number" 
                  required
                  placeholder="VNI range 5000 - 16777214"
                  value={vrfForm.layer3_vni}
                  onChange={(e) => setVrfForm({...vrfForm, layer3_vni: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary text-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Route Distinguisher (RD)</label>
                <input 
                  type="text" 
                  required
                  value={vrfForm.route_distinguisher}
                  onChange={(e) => setVrfForm({...vrfForm, route_distinguisher: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary font-mono text-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Route Target (RT)</label>
                <input 
                  type="text" 
                  required
                  value={vrfForm.route_target}
                  onChange={(e) => setVrfForm({...vrfForm, route_target: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary font-mono text-slate-700"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => setIsEditVrfOpen(false)}
                  className="btn bg-slate-50 border text-slate-600 px-4 py-2 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="btn-primary px-4 py-2 font-bold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Add Subnet Modal */}
      {isAddSubnetOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setIsAddSubnetOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-2xl z-50 p-6 animate-in zoom-in-95 duration-150 border">
            <h3 className="text-base font-bold font-display text-atlas-ink mb-4">Assign Fabric Overlay Subnet</h3>
            
            {validationError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-lg p-3 flex gap-2 items-start mb-4">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubnetSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Fabric Context</label>
                {fabricsLoading ? (
                  <div className="text-xs text-slate-500">Querying fabrics list...</div>
                ) : (
                  <select 
                    value={subnetForm.fabric_id}
                    onChange={(e) => setSubnetForm({...subnetForm, fabric_id: e.target.value})}
                    className="w-full bg-slate-50 border text-xs p-2 rounded-lg outline-none cursor-pointer text-slate-700 font-semibold"
                  >
                    {fabrics.map((f) => (
                      <option key={f.fabric_id} value={f.fabric_id}>{f.fabric_name} (BGP ASN {f.global_bgp_asn})</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Subnet CIDR Block</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. 10.0.1.0/24"
                  value={subnetForm.subnet_cidr}
                  onChange={(e) => setSubnetForm({...subnetForm, subnet_cidr: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary font-mono text-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Anycast Gateway IP</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. 10.0.1.1"
                  value={subnetForm.anycast_gateway_ip}
                  onChange={(e) => setSubnetForm({...subnetForm, anycast_gateway_ip: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary font-mono text-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">VLAN ID Segment</label>
                  <input 
                    type="number" 
                    required
                    placeholder="2 - 4094"
                    value={subnetForm.vlan_id}
                    onChange={(e) => setSubnetForm({...subnetForm, vlan_id: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Layer 2 VNI</label>
                  <input 
                    type="number" 
                    required
                    placeholder="10000 - 16777214"
                    value={subnetForm.layer2_vni}
                    onChange={(e) => setSubnetForm({...subnetForm, layer2_vni: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary text-slate-700"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => setIsAddSubnetOpen(false)}
                  className="btn bg-slate-50 border text-slate-600 px-4 py-2 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="btn-primary px-4 py-2 font-bold"
                >
                  Deploy segment
                </button>
              </div>
            </form>
          </div>
        </>
      )}

    </div>
  );
};
export default TenantFabricMapping;

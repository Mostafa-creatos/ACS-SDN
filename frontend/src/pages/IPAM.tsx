import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { ProgressBar } from '../components/ProgressBar';
import { useAuth } from '../context/AuthContext';
import { 
  Search, 
  Plus, 
  CheckCircle, 
  XCircle, 
  AlertTriangle
} from 'lucide-react';
import { fetchFabrics, fetchVrfs, createSubnet } from '../lib/api';

interface Subnet {
  subnet_id: string;
  vrf_name: string;
  subnet_cidr: string;
  anycast_gateway_ip: string;
  vlan_id: number;
  total_ips: number;
  used_ips: number;
  available_ips: number;
}

interface IPResult {
  ip: string;
  switch_name?: string;
  interface_name?: string;
  vlan?: number;
  vrf?: string;
  last_seen?: string;
  status: 'assigned' | 'unassigned' | string;
}

export const IPAM: React.FC = () => {
  const { token } = useAuth();
  
  const [subnets, setSubnets] = useState<Subnet[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchIP, setSearchIP] = useState('');
  const [searchResult, setSearchResult] = useState<IPResult | null>(null);
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Add Subnet Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Lists for dropdowns
  const [fabrics, setFabrics] = useState<any[]>([]);
  const [vrfs, setVrfs] = useState<any[]>([]);
  const [dropdownLoading, setDropdownLoading] = useState(false);

  const [newSubnet, setNewSubnet] = useState({
    vrf_id: '',
    fabric_id: '',
    subnet_cidr: '',
    anycast_gateway_ip: '',
    vlan_id: '100',
    layer2_vni: '10100'
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  const fetchSubnetsData = async () => {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const response = await fetch('/api/v5/admin/subnets', { headers });
      if (response.ok) {
        const data = await response.json();
        // Map backend properties to dashboard schema
        const mapped = data.map((s: any) => ({
          subnet_id: s.subnet_id,
          vrf_name: s.vrf_name || 'N/A',
          subnet_cidr: s.subnet_cidr,
          anycast_gateway_ip: s.anycast_gateway_ip,
          vlan_id: s.vlan_id,
          total_ips: s.total_ips || 254,
          used_ips: s.used_ips || 0,
          available_ips: (s.total_ips || 254) - (s.used_ips || 0)
        }));
        setSubnets(mapped);
      } else {
        setSubnets([]);
      }
    } catch (e) {
      setSubnets([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDropdowns = async () => {
    setDropdownLoading(true);
    try {
      const [fabList, vrfList] = await Promise.all([
        fetchFabrics(),
        fetchVrfs()
      ]);
      setFabrics(fabList);
      setVrfs(vrfList);
      
      // Auto-select first elements
      setNewSubnet(prev => ({
        ...prev,
        fabric_id: fabList[0]?.fabric_id || '',
        vrf_id: vrfList[0]?.vrf_id || ''
      }));
    } catch (err) {
      console.error("Failed to load fabrics or VRFs", err);
    } finally {
      setDropdownLoading(false);
    }
  };

  useEffect(() => {
    fetchSubnetsData();
  }, [token]);

  useEffect(() => {
    if (isModalOpen) {
      loadDropdowns();
    }
  }, [isModalOpen]);

  // Handle IP Finder
  const handleIPSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchIP) return;

    setSearchLoading(true);
    setSearchTriggered(true);
    setSearchResult(null);

    try {
      const response = await fetch(`/api/v5/ipam/search?ip=${searchIP}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setSearchResult(data);
      } else {
        setSearchResult(null);
      }
    } catch (err) {
      setSearchResult(null);
    } finally {
      setSearchLoading(false);
    }
  };

  // Add Subnet action with validation
  const handleAddSubnet = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!newSubnet.vrf_id || !newSubnet.fabric_id) {
      setValidationError('Please select a valid VRF and Fabric.');
      return;
    }

    // CIDR Validation regex
    const cidrRegex = /^([0-9]{1,3}\.){3}[0-9]{1,3}\/([0-9]|[1-2][0-9]|3[0-2])$/;
    if (!cidrRegex.test(newSubnet.subnet_cidr)) {
      setValidationError('Invalid Subnet CIDR format. Must match standard format e.g. 10.0.1.0/24');
      return;
    }

    // IP validation regex
    const ipRegex = /^([0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ipRegex.test(newSubnet.anycast_gateway_ip)) {
      setValidationError('Invalid Anycast Gateway IP address.');
      return;
    }

    const vlanNum = Number(newSubnet.vlan_id);
    if (isNaN(vlanNum) || vlanNum < 2 || vlanNum > 4094) {
      setValidationError('VLAN ID must be an integer between 2 and 4094.');
      return;
    }

    const l2VniNum = Number(newSubnet.layer2_vni);
    if (isNaN(l2VniNum) || l2VniNum < 10000 || l2VniNum > 16777214) {
      setValidationError('L2 VNI must be an integer between 10000 and 16777214.');
      return;
    }

    try {
      await createSubnet(newSubnet.vrf_id, {
        fabric_id: newSubnet.fabric_id,
        vlan_id: vlanNum,
        layer2_vni: l2VniNum,
        subnet_cidr: newSubnet.subnet_cidr,
        anycast_gateway_ip: newSubnet.anycast_gateway_ip
      });
      
      setIsModalOpen(false);
      
      // Reset form
      setNewSubnet({
        vrf_id: vrfs[0]?.vrf_id || '',
        fabric_id: fabrics[0]?.fabric_id || '',
        subnet_cidr: '',
        anycast_gateway_ip: '',
        vlan_id: '100',
        layer2_vni: '10100'
      });
      
      fetchSubnetsData();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to deploy subnet segment.');
    }
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">IPAM Planner</h1>
          <p className="text-xs text-slate-400 mt-1">Network Subnets Allocation and VRF IP Allocators</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Add Subnet</span>
        </button>
      </div>

      {/* 1. IP Finder Search Bar */}
      <Card className="p-5 border-atlas-primary/20 bg-gradient-to-r from-slate-50 to-white">
        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Prominent IP Finder</span>
        <form onSubmit={handleIPSearch} className="flex gap-2">
          <div className="relative flex-grow">
            <input 
              type="text" 
              value={searchIP}
              onChange={(e) => setSearchIP(e.target.value)}
              placeholder="Enter active host IP address to scan network database... e.g. 10.250.60.101"
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary transition-colors text-slate-700 font-mono"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
          </div>
          <button 
            type="submit" 
            className="btn-primary py-2.5 px-6 font-bold"
          >
            {searchLoading ? 'Scanning...' : 'Find IP'}
          </button>
        </form>

        {/* IP Search Results Card */}
        {searchTriggered && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            {searchResult && searchResult.status === 'assigned' ? (
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-emerald-50/50 border border-emerald-100 rounded-lg p-4">
                <div className="flex gap-3 items-center">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="text-xs">
                    <span className="font-mono font-bold text-emerald-800 text-sm">{searchResult.ip}</span>
                    <span className="text-slate-500 ml-2">allocated on VRF <span className="font-semibold text-slate-700">{searchResult.vrf || 'N/A'}</span></span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:flex gap-4 sm:gap-6 text-[11px]">
                  <div className="space-y-0.5">
                    <span className="text-slate-400 block font-medium">Switch Target</span>
                    <span className="font-semibold text-slate-700 uppercase">{searchResult.switch_name}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-400 block font-medium">Interface Link</span>
                    <span className="font-mono font-semibold text-slate-700">{searchResult.interface_name}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-400 block font-medium">VLAN / VRF</span>
                    <span className="font-semibold text-slate-700">VLAN {searchResult.vlan}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-400 block font-medium">Last Seen / Status</span>
                    <span className="text-slate-500">{searchResult.last_seen || 'Active'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 items-center bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs">
                <XCircle className="w-5 h-5 text-slate-400 shrink-0" />
                <div className="text-slate-500">
                  No record found for address <span className="font-mono font-semibold text-slate-700">{searchIP}</span>. This address is unassigned.
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 2. Subnets Table */}
      <Card>
        <h3 className="text-base font-bold font-display text-atlas-ink mb-4">VRF Subnet Configurations</h3>
        
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-3 text-left">VRF context</th>
                <th className="pb-3 text-left">Subnet CIDR</th>
                <th className="pb-3 text-left">Gateway IP</th>
                <th className="pb-3 text-left">VLAN</th>
                <th className="pb-3 text-left">Allocation (IPs)</th>
                <th className="pb-3 text-left">Usage/Threshold</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500">Loading subnets...</td>
                </tr>
              ) : subnets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500">No subnets found.</td>
                </tr>
              ) : (
                subnets.map((sub, idx) => {
                  const percent = sub.total_ips > 0 ? (sub.used_ips / sub.total_ips) * 100 : 0;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 font-semibold text-slate-800 text-xs">{sub.vrf_name}</td>
                      <td className="py-3 font-mono text-[11px] text-atlas-primary font-semibold">{sub.subnet_cidr}</td>
                      <td className="py-3 font-mono text-[11px] text-slate-500">{sub.anycast_gateway_ip}</td>
                      <td className="py-3 text-xs text-slate-600">VLAN {sub.vlan_id}</td>
                      <td className="py-3 text-xs text-slate-600">
                        <strong>{sub.used_ips}</strong> / {sub.total_ips}
                      </td>
                      <td className="py-3 w-48">
                        <ProgressBar value={percent} showLabel={false} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Subnet Modal */}
      {isModalOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-2xl z-50 p-6 animate-in zoom-in-95 duration-150 border">
            <h3 className="text-base font-bold font-display text-atlas-ink mb-4">Create VRF Subnet Segment</h3>
            
            {validationError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-lg p-3 flex gap-2 items-start mb-4">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubnet} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">VRF Context</label>
                {dropdownLoading ? (
                  <div className="text-xs text-slate-500">Loading VRFs...</div>
                ) : (
                  <select 
                    value={newSubnet.vrf_id}
                    onChange={(e) => setNewSubnet({...newSubnet, vrf_id: e.target.value})}
                    className="w-full bg-slate-50 border text-xs p-2 rounded-lg outline-none cursor-pointer"
                  >
                    {vrfs.map((vrf) => (
                      <option key={vrf.vrf_id} value={vrf.vrf_id}>{vrf.vrf_name} (L3 VNI {vrf.layer3_vni})</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Fabric Context</label>
                {dropdownLoading ? (
                  <div className="text-xs text-slate-500">Loading Fabrics...</div>
                ) : (
                  <select 
                    value={newSubnet.fabric_id}
                    onChange={(e) => setNewSubnet({...newSubnet, fabric_id: e.target.value})}
                    className="w-full bg-slate-50 border text-xs p-2 rounded-lg outline-none cursor-pointer"
                  >
                    {fabrics.map((f) => (
                      <option key={f.fabric_id} value={f.fabric_id}>{f.fabric_name} (ASN {f.global_bgp_asn})</option>
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
                  value={newSubnet.subnet_cidr}
                  onChange={(e) => setNewSubnet({...newSubnet, subnet_cidr: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary font-mono text-slate-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Anycast Gateway IP</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. 10.0.1.1"
                  value={newSubnet.anycast_gateway_ip}
                  onChange={(e) => setNewSubnet({...newSubnet, anycast_gateway_ip: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary font-mono text-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">VLAN ID Segment</label>
                  <input 
                    type="number" 
                    required
                    placeholder="e.g. 100"
                    value={newSubnet.vlan_id}
                    onChange={(e) => setNewSubnet({...newSubnet, vlan_id: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">L2 VNI Segment</label>
                  <input 
                    type="number" 
                    required
                    placeholder="e.g. 10100"
                    value={newSubnet.layer2_vni}
                    onChange={(e) => setNewSubnet({...newSubnet, layer2_vni: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-atlas-primary text-slate-700"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn bg-slate-50 border text-slate-600 px-4 py-2 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="btn-primary px-4 py-2 font-bold"
                >
                  Deploy Segment
                </button>
              </div>
            </form>
          </div>
        </>
      )}

    </div>
  );
};

export default IPAM;

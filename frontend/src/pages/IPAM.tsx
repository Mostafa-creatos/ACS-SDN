import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { ProgressBar } from '../components/ProgressBar';
import { 
  Search, 
  Plus, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Terminal,
  Clock,
  RefreshCw,
  Server
} from 'lucide-react';
import { fetchFabrics, fetchVrfs, createSubnet, fetchProvisioningJobs, redeploySubnet, fetchAllSubnets, searchIp } from '../lib/api';

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

interface DeviceStatus {
  status: 'pending' | 'in_progress' | 'success' | 'failed';
  vendor: string;
  management_ip: string;
  error: string | null;
  completed_at: string | null;
  commands: string;
}

interface ProvisioningJob {
  job_id: string;
  subnet_id: string;
  vrf_name: string;
  subnet_cidr: string;
  fabric_name: string;
  status: 'pending' | 'in_progress' | 'success' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  logs: string;
  error_message: string | null;
  device_statuses?: Record<string, DeviceStatus>;
}

export const IPAM: React.FC = () => {
  
  const [activeTab, setActiveTab] = useState<'subnets' | 'provisioning'>('subnets');
  const [subnets, setSubnets] = useState<Subnet[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchIP, setSearchIP] = useState('');
  const [searchResult, setSearchResult] = useState<IPResult | null>(null);
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Provisioning state variables
  const [jobs, setJobs] = useState<ProvisioningJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ProvisioningJob | null>(null);
  const [expandedLeaf, setExpandedLeaf] = useState<string | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);

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
      const data = await fetchAllSubnets();
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
    } catch (e) {
      setSubnets([]);
    } finally {
      setLoading(false);
    }
  };

  const loadJobs = async (isSilent = false) => {
    if (!isSilent) setJobsLoading(true);
    try {
      const data = await fetchProvisioningJobs();
      setJobs(data);
      if (selectedJob) {
        const updated = data.find(j => j.job_id === selectedJob.job_id);
        if (updated) {
          setSelectedJob(updated);
        }
      }
    } catch (err) {
      console.error("Failed to fetch jobs history:", err);
    } finally {
      setJobsLoading(false);
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
    loadJobs();
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      loadDropdowns();
    }
  }, [isModalOpen]);

  // Poll for updates if any jobs are in progress
  useEffect(() => {
    const hasActiveJob = jobs.some(j => j.status === 'in_progress' || j.status === 'pending');
    if (!hasActiveJob) return;

    const interval = setInterval(() => {
      loadJobs(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs, selectedJob]);

  // Handle IP Finder
  const handleIPSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchIP) return;

    setSearchLoading(true);
    setSearchTriggered(true);
    setSearchResult(null);

    try {
      const data = await searchIp(searchIP);
      if (data) {
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

  const [redeployingSubnetId, setRedeployingSubnetId] = useState<string | null>(null);

  const handleRedeploy = async (subnetId: string) => {
    setRedeployingSubnetId(subnetId);
    try {
      await redeploySubnet(subnetId);
      await loadJobs();
      setActiveTab('provisioning');
    } catch (err: any) {
      alert(err.message || 'Failed to trigger redeployment');
    } finally {
      setRedeployingSubnetId(null);
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
      
      // Auto-switch to provisioning jobs tab to observe output
      await loadJobs();
      setActiveTab('provisioning');
      
      // Select the first job (newly created)
      const freshJobs = await fetchProvisioningJobs();
      setJobs(freshJobs);
      if (freshJobs.length > 0) {
        setSelectedJob(freshJobs[0]);
      }
    } catch (err: any) {
      setValidationError(err.message || 'Failed to deploy subnet segment.');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleTimeString() + ' ' + date.toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase">
            <CheckCircle className="w-2.5 h-2.5 text-emerald-600" />
            SUCCESS
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100 uppercase">
            <XCircle className="w-2.5 h-2.5 text-rose-600" />
            FAILED
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-100 animate-pulse uppercase">
            <RefreshCw className="w-2.5 h-2.5 text-sky-600 animate-spin" />
            SYNCING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 text-slate-600 border border-slate-200 uppercase">
            <Clock className="w-2.5 h-2.5 text-slate-400" />
            PENDING
          </span>
        );
    }
  };

  const formatTerminalLogs = (rawLogs: any) => {
    if (!rawLogs || typeof rawLogs !== 'string') return 'Initializing terminal pipeline log output...';
    return rawLogs.split('\n').map((line, idx) => {
      if (!line.trim()) return null;
      let lineClass = 'text-slate-300';
      if (line.includes('FAILED') || line.includes('Exception') || line.includes('Error')) {
        lineClass = 'text-rose-400 font-bold';
      } else if (line.includes('succeeded') || line.includes('successfully')) {
        lineClass = 'text-emerald-400';
      } else if (line.includes('Generating config') || line.includes('Pushing config')) {
        lineClass = 'text-sky-400';
      } else if (line.includes('Configuration payload:')) {
        lineClass = 'text-yellow-400 font-semibold';
      }

      return (
        <div key={idx} className={`py-0.5 font-mono text-[11px] leading-5 ${lineClass}`}>
          {line}
        </div>
      );
    });
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-atlas-ink">IP Management</h1>
          <p className="text-xs text-slate-400 mt-1">Network Subnets Allocation, VRF IP Planner, and Closed-Loop Leaf Provisioning Status</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Add Subnet</span>
        </button>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('subnets')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'subnets' 
              ? 'border-atlas-primary text-atlas-primary font-bold' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Subnet Directory & Allocations
        </button>
        <button
          onClick={() => setActiveTab('provisioning')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'provisioning' 
              ? 'border-atlas-primary text-atlas-primary font-bold' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <span>Auto-Provisioning Status</span>
          {jobs.some(j => j.status === 'in_progress') && (
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
          )}
        </button>
      </div>

      {/* Tab CONTENT 1: Subnet Allocations */}
      {activeTab === 'subnets' && (
        <>
          {/* IP Finder Search Bar */}
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

          {/* Subnets Table */}
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
                    <th className="pb-3 text-left">Sync Status</th>
                    <th className="pb-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500">Loading subnets...</td>
                    </tr>
                  ) : subnets.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500">No subnets found.</td>
                    </tr>
                  ) : (
                    subnets.map((sub, idx) => {
                      const percent = sub.total_ips > 0 ? (sub.used_ips / sub.total_ips) * 100 : 0;
                      // Find latest provisioning job for this subnet
                      const subnetJob = jobs.find(j => j.subnet_id === sub.subnet_id);
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 font-semibold text-slate-800 text-xs">{sub.vrf_name}</td>
                          <td className="py-3 font-mono text-[11px] text-atlas-primary font-semibold">{sub.subnet_cidr}</td>
                          <td className="py-3 font-mono text-[11px] text-slate-500">{sub.anycast_gateway_ip}</td>
                          <td className="py-3 text-xs text-slate-600">VLAN {sub.vlan_id}</td>
                          <td className="py-3 text-xs text-slate-600">
                            <strong>{sub.used_ips}</strong> / {sub.total_ips}
                          </td>
                          <td className="py-3 w-44">
                            <div className="flex items-center gap-3 w-full">
                              <div className="flex-1">
                                <ProgressBar value={percent} showLabel={false} />
                              </div>
                              <span className="text-[10px] font-bold text-slate-500 min-w-[32px] text-right">
                                {percent.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3">
                            {subnetJob ? (
                              <button
                                onClick={() => {
                                  setSelectedJob(subnetJob);
                                  setActiveTab('provisioning');
                                }}
                                className="cursor-pointer hover:scale-105 transition-transform"
                                title="Click to view detailed switch provisioning statuses"
                              >
                                {getStatusBadge(subnetJob.status)}
                              </button>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400 border border-slate-200">
                                NO JOB
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-center">
                            <button
                              onClick={() => handleRedeploy(sub.subnet_id)}
                              disabled={redeployingSubnetId !== null || (subnetJob && (subnetJob.status === 'in_progress' || subnetJob.status === 'pending'))}
                              className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-colors ${
                                redeployingSubnetId === sub.subnet_id
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                  : 'bg-white hover:bg-atlas-primary/5 text-atlas-primary border-atlas-primary/20 hover:border-atlas-primary/40'
                              }`}
                            >
                              {redeployingSubnetId === sub.subnet_id ? (
                                <span className="flex items-center gap-1">
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Redeploying...
                                </span>
                              ) : (
                                'Redeploy'
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Tab CONTENT 2: Provisioning Status */}
      {activeTab === 'provisioning' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Jobs List */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold font-display text-atlas-ink uppercase tracking-wider">Orchestrator Push History</h3>
                <button 
                  onClick={() => loadJobs(false)}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors"
                  title="Reload provisioning jobs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${jobsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
                {jobs.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    No provisioning jobs triggered yet. Subnet configurations will appear here automatically.
                  </div>
                ) : (
                  jobs.map((job) => {
                    const isSelected = selectedJob?.job_id === job.job_id;
                    return (
                      <div 
                        key={job.job_id}
                        onClick={() => {
                          setSelectedJob(job);
                          setExpandedLeaf(null);
                        }}
                        className={`p-3 cursor-pointer text-xs rounded-lg transition-colors my-1 border flex items-start justify-between gap-3 ${
                          isSelected 
                            ? 'bg-atlas-primary/5 border-atlas-primary/30 shadow-sm' 
                            : 'bg-white border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800">
                            <span className="font-mono text-[11px] text-atlas-primary">{job.subnet_cidr}</span>
                            <span className="text-[10px] text-slate-400 font-medium">({job.vrf_name})</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            Fabric: <span className="font-semibold text-slate-600">{job.fabric_name}</span>
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono">
                            Started: {formatDate(job.started_at)}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {getStatusBadge(job.status)}
                          {job.device_statuses && (
                            <span className="text-[9px] font-bold text-slate-500">
                              {Object.values(job.device_statuses).filter(d => d.status === 'success').length} / {Object.keys(job.device_statuses).length} Leafs
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          {/* Right Column: Job details with switch status tracking */}
          <div className="lg:col-span-7">
            {selectedJob ? (
              <div className="space-y-6">
                
                {/* Job metadata card */}
                <Card className="p-5">
                  <div className="flex justify-between items-start border-b border-slate-100 pb-3 mb-4">
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Active Execution Job Details</span>
                      <h3 className="font-mono text-base font-bold text-atlas-primary">{selectedJob.subnet_cidr}</h3>
                      <span className="text-[10px] text-slate-400">Job Reference ID: <span className="font-mono">{selectedJob.job_id}</span></span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      {selectedJob.status === 'failed' && (
                        <button
                          onClick={() => handleRedeploy(selectedJob.subnet_id)}
                          disabled={redeployingSubnetId !== null}
                          className="px-2.5 py-1 text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white rounded shadow-sm transition-colors flex items-center gap-1 cursor-pointer disabled:bg-rose-400 disabled:cursor-not-allowed"
                        >
                          <RefreshCw className={`w-3 h-3 ${redeployingSubnetId === selectedJob.subnet_id ? 'animate-spin' : ''}`} />
                          {redeployingSubnetId === selectedJob.subnet_id ? 'Retrying...' : 'Retry Push'}
                        </button>
                      )}
                      {getStatusBadge(selectedJob.status)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block font-medium">Fabric Target</span>
                      <span className="font-bold text-slate-700">{selectedJob.fabric_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">VRF Context</span>
                      <span className="font-bold text-slate-700">{selectedJob.vrf_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium font-mono">Started At</span>
                      <span className="text-slate-500 font-mono text-[10px]">{formatDate(selectedJob.started_at)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium font-mono">Finished At</span>
                      <span className="text-slate-500 font-mono text-[10px]">{formatDate(selectedJob.completed_at)}</span>
                    </div>
                  </div>

                  {selectedJob.error_message && (
                    <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 text-xs text-rose-700 flex gap-2 items-start mt-4">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Job Execution Error: </span>
                        <span>{selectedJob.error_message}</span>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Leaf switch granular statuses */}
                <Card className="p-5">
                  <h3 className="text-xs font-bold font-display text-atlas-ink uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-atlas-primary" />
                    <span>Leaf Switch Deployments ({selectedJob.device_statuses ? Object.keys(selectedJob.device_statuses).length : 0})</span>
                  </h3>

                  <div className="space-y-3">
                    {!selectedJob.device_statuses || Object.keys(selectedJob.device_statuses).length === 0 ? (
                      <div className="py-4 text-center text-slate-400 text-xs">
                        No switch statuses recorded. The fabric matches no leaf switches.
                      </div>
                    ) : (
                      Object.entries(selectedJob.device_statuses).map(([hostname, dev]) => {
                        const isExpanded = expandedLeaf === hostname;
                        return (
                          <div 
                            key={hostname}
                            className={`border rounded-lg p-3 transition-colors ${
                              dev.status === 'failed' 
                                ? 'border-rose-100 bg-rose-50/20' 
                                : dev.status === 'success'
                                ? 'border-emerald-100 bg-emerald-50/20'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800 text-xs uppercase">{hostname}</span>
                                  <span className="inline-flex items-center px-1.5 py-0.2 bg-slate-100 text-slate-500 rounded text-[9px] font-mono border uppercase shrink-0">
                                    {dev.vendor}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  Management IP: <span className="font-semibold text-slate-600">{dev.management_ip}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                {getStatusBadge(dev.status)}
                                <button
                                  type="button"
                                  onClick={() => setExpandedLeaf(isExpanded ? null : hostname)}
                                  className="text-[10px] font-bold text-atlas-primary hover:underline cursor-pointer"
                                >
                                  {isExpanded ? 'Hide Payload' : 'View Payload'}
                                </button>
                              </div>
                            </div>

                            {dev.error && (
                              <div className="mt-2 text-[10px] text-rose-700 bg-rose-50 border border-rose-100 p-2 rounded font-mono">
                                <strong>Push Error:</strong> {dev.error}
                              </div>
                            )}

                            {isExpanded && (
                              <div className="mt-3 space-y-2 animate-in slide-in-from-top-1 duration-150">
                                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Generated Configuration Commands:</span>
                                <div className="bg-slate-900 rounded-lg p-3 font-mono text-[10px] text-slate-200 overflow-x-auto select-all whitespace-pre">
                                  {dev.commands || "! No configuration generated"}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>

                {/* Colorized CLI Execution Transcript terminal block */}
                <Card className="p-5">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100 mb-3">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-slate-600" />
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">CLI Execution Transcript</h3>
                    </div>
                    {getStatusBadge(selectedJob.status)}
                  </div>
                  <div className="bg-slate-950 rounded-lg p-4 font-mono text-[11px] border border-slate-900 shadow-inner max-h-[350px] overflow-y-auto">
                    <div className="text-slate-500 mb-2 border-b border-slate-900 pb-1 select-none">
                      # SDN Controller Job ID: {selectedJob.job_id}
                    </div>
                    {formatTerminalLogs(selectedJob.logs)}
                  </div>
                </Card>

              </div>
            ) : (
              <Card className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3 border-dashed border-slate-200">
                <Terminal className="w-8 h-8 text-slate-300" />
                <div>
                  Select a provisioning record from the left history checklist to view active SSH session logs and execution commands.
                </div>
              </Card>
            )}
          </div>

        </div>
      )}

      {/* Add Subnet Modal */}
      {isModalOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-2xl z-50 p-6 border animate-in zoom-in-95 duration-150">
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
                    className="w-full bg-slate-50 border text-xs p-2 rounded-lg outline-none cursor-pointer text-slate-700 font-medium"
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
                    className="w-full bg-slate-50 border text-xs p-2 rounded-lg outline-none cursor-pointer text-slate-700 font-medium"
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
                  className="btn bg-slate-50 border text-slate-600 px-4 py-2 hover:bg-slate-100 rounded-lg transition-colors text-xs"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="btn-primary px-4 py-2 font-bold text-xs"
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

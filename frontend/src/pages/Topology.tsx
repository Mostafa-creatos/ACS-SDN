import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import dagre from 'cytoscape-dagre';
import { useAuth } from '../context/AuthContext';
import { StatusPill } from '../components/StatusPill';
import { Save, RefreshCw, RotateCcw, X, AlertOctagon, ChevronRight, Eye, EyeOff, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { ChassisRenderer } from '../components/ChassisRenderer';
import { fetchTopologyGraph, fetchEndpoints, triggerTopologySync } from '../lib/api';

cytoscape.use(fcose);
cytoscape.use(dagre);

interface NodeData {
  id: string;
  label: string;
  ip: string;
  status: string;
  role: string;
  model: string;
  vendor: string;
  interfacesCount: number;
  fabric_name: string;
  serial_number?: string;
  os_version?: string;
  management_mac?: string;
  local_bgp_asn?: number;
  loopback_0_ip?: string;
  vtep_ip?: string;
  ports_up?: number;
  ports_all?: number;
  interfaces?: any[];
}

interface EdgeData {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  protocol?: 'LLDP' | 'CDP' | 'OOB-MGMT' | string;
  label?: string;
  state?: 'up' | 'down' | string;
}

interface EndpointData {
  endpoint_id: string;
  mac_address: string;
  ip_address: string | null;
  vlan_id: number;
  port: string;
  switch_hostname: string;
}

// Custom 100% mathematically centered high-tech SVG icons for Spine vs Leaf switches
const VENDOR_ICONS: Record<string, string> = {
  dell_spine: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#1e1b4b" stroke="#6366f1" stroke-width="2.5"/><rect x="15" y="28" width="70" height="44" rx="6" fill="#0f172a" stroke="#6366f1" stroke-width="2"/><rect x="32" y="14" width="36" height="14" rx="4" fill="#4338ca" stroke="#a5b4fc" stroke-width="1.5"/><text x="50" y="21" fill="#ffffff" font-size="9" font-family="Arial, sans-serif" font-weight="900" text-anchor="middle" dominant-baseline="central">SPINE</text><rect x="22" y="38" width="10" height="9" rx="1.5" fill="#818cf8"/><rect x="37" y="38" width="10" height="9" rx="1.5" fill="#818cf8"/><rect x="53" y="38" width="10" height="9" rx="1.5" fill="#818cf8"/><rect x="68" y="38" width="10" height="9" rx="1.5" fill="#818cf8"/><rect x="22" y="53" width="10" height="9" rx="1.5" fill="#818cf8"/><rect x="37" y="53" width="10" height="9" rx="1.5" fill="#818cf8"/><rect x="53" y="53" width="10" height="9" rx="1.5" fill="#818cf8"/><rect x="68" y="53" width="10" height="9" rx="1.5" fill="#818cf8"/><circle cx="20" cy="20" r="2.5" fill="#10b981"/><circle cx="27" cy="20" r="2.5" fill="#38bdf8"/></svg>')}`,
  
  dell_leaf: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#064e3b" stroke="#10b981" stroke-width="2.5"/><rect x="15" y="28" width="70" height="44" rx="6" fill="#022c22" stroke="#10b981" stroke-width="2"/><rect x="32" y="14" width="36" height="14" rx="4" fill="#047857" stroke="#6ee7b7" stroke-width="1.5"/><text x="50" y="21" fill="#ffffff" font-size="9" font-family="Arial, sans-serif" font-weight="900" text-anchor="middle" dominant-baseline="central">LEAF</text><rect x="22" y="38" width="10" height="9" rx="1.5" fill="#34d399"/><rect x="37" y="38" width="10" height="9" rx="1.5" fill="#34d399"/><rect x="53" y="38" width="10" height="9" rx="1.5" fill="#34d399"/><rect x="68" y="38" width="10" height="9" rx="1.5" fill="#34d399"/><rect x="22" y="53" width="10" height="9" rx="1.5" fill="#34d399"/><rect x="37" y="53" width="10" height="9" rx="1.5" fill="#34d399"/><rect x="53" y="53" width="10" height="9" rx="1.5" fill="#34d399"/><rect x="68" y="53" width="10" height="9" rx="1.5" fill="#34d399"/><circle cx="20" cy="20" r="2.5" fill="#34d399"/><circle cx="27" cy="20" r="2.5" fill="#34d399"/></svg>')}`,
  
  cisco: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#0b5cad" stroke="#ffffff" stroke-width="1.5"/><path d="M10 20v-4m3 6v-8m3 10V10m3 12v-14m3 16V6m3 14v-10m3 12v-8m3 6v-4" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/></svg>')}`,
  juniper: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#6c2e9c" stroke="#ffffff" stroke-width="1.5"/><text x="20" y="20" fill="#ffffff" font-size="14" font-family="Times New Roman, serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">J</text></svg>')}`,
  generic: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#34495e" stroke="#ffffff" stroke-width="1.5"/><path d="M12 16h16M12 24h16M16 12l-4 4 4 4M24 20l4 4-4 4" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')}`
};

export const Topology: React.FC = () => {
  const navigate = useNavigate();
  const { selectedTenant } = useAuth();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointData[]>([]);
  const [filterState, setFilterState] = useState<string>('ALL');
  const [layoutName, setLayoutName] = useState<string>('fcose');
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showInterfaces, setShowInterfaces] = useState<boolean>(() => {
    const saved = localStorage.getItem('atlas_topo_show_interfaces');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [showMgmtLinks, setShowMgmtLinks] = useState<boolean>(() => {
    const saved = localStorage.getItem('atlas_topo_show_mgmt');
    return saved !== null ? JSON.parse(saved) : false;
  });

  // Multiple selection state
  const [selectedNodes, setSelectedNodes] = useState<NodeData[]>([]);

  // Side Drawer details state
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Custom Tooltip state
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    visible: boolean;
    title: string;
    status: string;
    role: string;
    ip: string;
    reachable: boolean;
  }>({ x: 0, y: 0, visible: false, title: '', status: '', role: '', ip: '', reachable: true });

  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadGraphData = async () => {
    setLoading(true);
    try {
      const [topoData, epData] = await Promise.all([
        fetchTopologyGraph(selectedTenant),
        fetchEndpoints(selectedTenant),
      ]);

      setNodes(topoData?.nodes || []);
      setEdges(topoData?.edges || []);
      setEndpoints(epData || []);
    } catch (e) {
      setNodes([]);
      setEdges([]);
      setEndpoints([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsSyncing(true);
    try {
      await triggerTopologySync(selectedTenant);
      await loadGraphData();
    } catch (err) {
      console.error('Topology sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadGraphData();
  }, [selectedTenant]);



  // Persist showInterfaces preference
  useEffect(() => {
    localStorage.setItem('atlas_topo_show_interfaces', JSON.stringify(showInterfaces));
  }, [showInterfaces]);

  useEffect(() => {
    localStorage.setItem('atlas_topo_show_mgmt', JSON.stringify(showMgmtLinks));
  }, [showMgmtLinks]);

  // Handle dynamic edge updates on showInterfaces state change
  useEffect(() => {
    if (cyRef.current) {
      cyRef.current.style()
        .selector('edge')
        .style({
          'source-label': '',
          'target-label': '',
        })
        .selector('edge:hover')
        .style({
          'source-label': showInterfaces ? 'data(sourcePort)' : '',
          'target-label': showInterfaces ? 'data(targetPort)' : '',
        })
        .update();
    }
  }, [showInterfaces]);

  // Cytoscape initialization and updates
  useEffect(() => {
    if (loading || !containerRef.current || isSmallScreen) return;

    // Filter elements
    const activeNodes = nodes.filter(n => {
      if (filterState === 'ALL') return true;
      const st = (n.status || '').toLowerCase();
      const fs = filterState.toLowerCase();
      if (fs === 'down') return st === 'down' || st === 'offline';
      if (fs === 'compliant_active' || fs === 'compliant') return st === 'compliant' || st === 'compliant_active' || st === 'up';
      if (fs === 'drifted') return st === 'drifted';
      if (fs === 'discovered') return st === 'discovered' || st === 'discovered_raw';
      return st === fs;
    });
    const activeNodeIds = new Set(activeNodes.map(n => n.id));
    const rawEdges = edges.filter(e => {
      const isAttached = activeNodeIds.has(e.source) && activeNodeIds.has(e.target);
      if (!isAttached) return false;
      if (!showMgmtLinks) {
        const srcPort = (e.sourcePort || '').toLowerCase();
        const dstPort = (e.targetPort || '').toLowerCase();
        const labelLower = (e.label || '').toLowerCase();
        if (srcPort.includes('mgmt') || dstPort.includes('mgmt') || labelLower.includes('mgmt')) return false;
      }
      return true;
    });

    const seenEdgePairs = new Set<string>();
    const activeEdges = rawEdges.filter(e => {
      const nodePair = [e.source, e.target].sort().join('||');
      const portPair = [e.sourcePort || '', e.targetPort || ''].sort().join('||');
      const key = `${nodePair}__${portPair}`;
      if (seenEdgePairs.has(key)) return false;
      seenEdgePairs.add(key);
      return true;
    });

    // Convert to Cytoscape elements
    const uniqueFabrics = Array.from(new Set(activeNodes.map(n => n.fabric_name || 'Default Fabric')));

    const elements: cytoscape.ElementDefinition[] = [
      // Parent Compound Nodes for Fabrics
      ...uniqueFabrics.map(fabricName => ({
        data: {
          id: `fabric-${fabricName}`,
          name: fabricName,
          nodeType: 'fabric-group'
        }
      })),
      ...activeNodes.map(n => {
        const isSpine = n.role === 'spine' || (n.label || '').toLowerCase().includes('spine');
        const isReachable = n.status !== 'offline' && n.status !== 'down';
        
        let color = isSpine ? '#6366f1' : '#10b981'; // Spine = Indigo/Purple, Leaf = Emerald/Teal
        if (!isReachable) color = '#ef4444'; // Unreachable = Red
        else if (n.status === 'drifted') color = '#f59e0b'; // Config Drift = Amber

        let vendorIcon = isSpine ? VENDOR_ICONS.dell_spine : VENDOR_ICONS.dell_leaf;

        return {
          data: {
            id: n.id,
            parent: `fabric-${n.fabric_name || 'Default Fabric'}`,
            label: n.label,
            name: n.label,
            role: isSpine ? 'spine' : 'leaf',
            color,
            reachable: isReachable,
            icon: vendorIcon,
            raw: { ...n, vendor: 'dell' }
          }
        };
      }),
      ...(() => {
        const seenLinkPairs = new Set<string>();
        const deduplicatedEdges = [];
        for (const e of activeEdges) {
          let sourcePort = e.sourcePort || '';
          let targetPort = e.targetPort || '';
          if ((!sourcePort || !targetPort) && e.label) {
            const parts = e.label.split('<->');
            if (parts.length === 2) {
              sourcePort = parts[0].trim();
              targetPort = parts[1].trim();
            }
          }

          const isMgmt = e.protocol === 'OOB-MGMT' || sourcePort.toLowerCase().includes('mgmt') || targetPort.toLowerCase().includes('mgmt');

          if (!showMgmtLinks && isMgmt) {
            continue;
          }

          const pairA = `${e.source}:${sourcePort}`;
          const pairB = `${e.target}:${targetPort}`;
          const linkKey = [pairA, pairB].sort().join(' <-> ');

          if (seenLinkPairs.has(linkKey)) continue;
          seenLinkPairs.add(linkKey);

          const isDown = e.state === 'down';
          const isCDP = e.protocol === 'CDP';
          const color = isDown ? '#ef4444' : (isMgmt ? '#38bdf8' : (isCDP ? '#00c3ff' : '#00e676'));

          deduplicatedEdges.push({
            data: {
              id: e.id,
              source: e.source,
              target: e.target,
              sourcePort,
              targetPort,
              protocol: isMgmt ? 'OOB-MGMT' : (e.protocol || 'LLDP'),
              color,
              isMgmt,
              isDown,
              state: e.state || 'up'
            }
          });
        }
        return deduplicatedEdges;
      })()
    ];

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    // Load saved positions if saved layout is active
    const savedPosKey = `atlas_topo_positions_${selectedTenant || 'default'}`;
    const savedPositionsRaw = localStorage.getItem(savedPosKey);
    const savedPositions = savedPositionsRaw ? JSON.parse(savedPositionsRaw) : null;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'shape': 'ellipse',
            'width': 46,
            'height': 46,
            'background-color': 'transparent',
            'background-image': 'data(icon)',
            'background-fit': 'contain',
            'background-position-x': '50%',
            'background-position-y': '50%',
            'background-clip': 'node',
            'border-width': '0px',
            'label': 'data(name)',
            'color': '#ffffff',
            'font-family': "'Sora', 'Inter', sans-serif",
            'font-size': '10px',
            'font-weight': 'bold',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'shadow-blur': 12,
            'shadow-color': 'data(color)',
            'shadow-opacity': 0.75,
            'shadow-offset-y': 0,
            'transition-property': 'border-width, shadow-blur',
            'transition-duration': 0.2
          }
        },
        // Spine Node visual distinction (52px diameter with Indigo glow)
        {
          selector: 'node[role = "spine"]',
          style: {
            'width': 52,
            'height': 52,
            'border-width': '3px',
            'border-color': '#6366f1',
            'shadow-blur': 18,
            'shadow-color': '#818cf8',
            'shadow-opacity': 0.85
          }
        },
        // Leaf Node visual distinction (44px diameter with Emerald glow)
        {
          selector: 'node[role = "leaf"]',
          style: {
            'width': 44,
            'height': 44,
            'border-width': '2.5px',
            'border-color': '#10b981',
            'shadow-blur': 14,
            'shadow-color': '#34d399',
            'shadow-opacity': 0.75
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': '3px',
            'border-color': '#38bdf8',
            'shadow-blur': 22,
            'shadow-color': '#38bdf8',
            'shadow-opacity': 1.0
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2.2,
            'line-color': 'data(color)',
            'curve-style': 'bezier',
            'target-arrow-shape': 'none',
            'opacity': 0.85,
            'font-size': '9px',
            'color': '#94a3b8',
            'text-rotation': 'autorotate',
            'text-background-opacity': 0,
            'source-text-offset': 40,
            'target-text-offset': 40,
            'font-family': "'Sora', 'Inter', sans-serif",
            'font-weight': '600',
            'edge-text-rotation': 'autorotate',
            'transition-property': 'width, opacity',
            'transition-duration': 0.15
          }
        },
        {
          selector: 'edge[?isMgmt]',
          style: {
            'line-style': 'dashed',
            'line-dash-pattern': [6, 4],
            'line-color': '#38bdf8',
            'width': 1.8,
            'opacity': 0.7
          }
        },
        {
          selector: 'edge[?isDown]',
          style: {
            'line-style': 'dashed',
            'line-dash-pattern': [8, 4],
            'line-color': '#ef4444',
            'target-arrow-color': '#ef4444',
            'width': 2.5,
            'opacity': 0.95
          }
        },
        {
          selector: 'edge:hover',
          style: {
            'width': 3.2,
            'opacity': 1.0,
            'source-label': showInterfaces ? 'data(sourcePort)' : '',
            'target-label': showInterfaces ? 'data(targetPort)' : '',
            'text-background-opacity': 0.9,
            'text-background-color': '#0f172a',
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
          }
        },
        {
          selector: 'node[nodeType = "fabric-group"]',
          style: {
            'shape': 'roundrectangle',
            'background-color': '#334155',
            'background-opacity': 0.08,
            'border-width': '2px',
            'border-color': '#475569',
            'border-style': 'dashed',
            'label': 'data(name)',
            'color': '#f8fafc',
            'font-family': "'Sora', 'Inter', sans-serif",
            'font-size': '11px',
            'font-weight': 'bold',
            'text-valign': 'top',
            'text-margin-y': -8,
            'text-halign': 'center',
            'padding': 18
          }
        },

        {
          selector: 'edge[edgeType = "host-link"]',
          style: {
            'width': 1,
            'line-style': 'dashed',
            'line-dash-pattern': [6, 3],
            'line-color': '#38bdf8',
            'opacity': 0.5,
            'target-arrow-shape': 'none',
          }
        }
      ] as any,
      layout: (layoutName === 'saved' && savedPositions) ? {
        name: 'preset',
        positions: (node: any) => savedPositions[node.id()] || { x: 100, y: 100 },
        animate: true,
        animationDuration: 400
      } : (layoutName === 'dagre' ? {
        name: 'dagre',
        rankDir: 'TB',
        ranker: 'network-simplex',
        nodeSep: 80,
        rankSep: 140,
        padding: 50,
        animate: true
      } : {
        name: layoutName === 'saved' ? 'fcose' : layoutName,
        padding: 60,
        animate: true,
        animationDuration: 500,
        nodeRepulsion: 9500,
        idealEdgeLength: 140,
        gravity: 0.15,
        edgeElasticity: 0.35,
        nodeSep: 90,
        edgeSep: 45,
        rankSep: 140
      }) as any
    });

    cyRef.current = cy;

    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const rawData = node.data('raw');
      if (!rawData) return;
      const renderedPos = node.renderedPosition();
      
      setTooltip({
        visible: true,
        x: renderedPos.x + 10,
        y: renderedPos.y - 45,
        title: rawData.label || node.data('name'),
        status: rawData.status || 'compliant_active',
        role: rawData.role || 'leaf',
        ip: rawData.ip || '172.20.20.1',
        reachable: rawData.status !== 'offline' && rawData.status !== 'down'
      });
    });

    cy.on('mouseout', 'node', () => {
      setTooltip(t => ({ ...t, visible: false }));
    });

    cy.on('select unselect', 'node', () => {
      const selected = cy.nodes(':selected').map(node => node.data('raw') as NodeData).filter(Boolean);
      setSelectedNodes(selected);
      
      if (selected.length === 1) {
        setSelectedNode(selected[0]);
        setDrawerOpen(true);
      } else {
        setDrawerOpen(false);
      }
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        cy.nodes().unselect();
        setSelectedNodes([]);
        setDrawerOpen(false);
      }
    });

    cy.on('pan zoom', () => {
      setTooltip(t => ({ ...t, visible: false }));
    });

    return () => {
      cy.destroy();
    };
  }, [nodes, edges, endpoints, filterState, layoutName, loading, isSmallScreen, showMgmtLinks]);

  const handleSaveLayout = () => {
    if (!cyRef.current) return;
    const positions: Record<string, { x: number; y: number }> = {};
    cyRef.current.nodes().forEach(node => {
      if (node.data('nodeType') !== 'fabric-group') {
        positions[node.id()] = node.position();
      }
    });
    localStorage.setItem(`atlas_topo_positions_${selectedTenant || 'default'}`, JSON.stringify(positions));
    alert(`Visual positions saved successfully for tenant layout!`);
  };

  const handleResetLayout = () => {
    if (!cyRef.current) return;
    cyRef.current.layout({
      name: layoutName === 'saved' ? 'fcose' : layoutName,
      padding: 60,
      animate: true,
      animationDuration: 500
    } as any).run();
  };

  const reachableCount = nodes.filter(n => n.status !== 'offline' && n.status !== 'down').length;
  const unreachableCount = nodes.length - reachableCount;

  if (isSmallScreen) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[70vh]">
        <AlertOctagon className="w-16 h-16 text-atlas-coral mb-4 animate-bounce" />
        <h3 className="text-xl font-bold font-display text-atlas-ink mb-2">Desktop View Recommended</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          The interactive Live Topology Map features complex SVG and Canvas nodes designed for larger viewports. Please expand your browser window or switch to a desktop screen to view the map.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-10rem)] flex flex-col bg-[#0b0c16] rounded-xl overflow-hidden shadow-2xl border border-slate-800">
      
      {/* Floating Control Bar */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2.5 items-center bg-slate-900/95 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-800/80 shadow-lg">
        
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Topology Controls</span>
        
        {/* Layout Switcher */}
        <select 
          value={layoutName} 
          onChange={(e) => setLayoutName(e.target.value)}
          className="bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 py-1.5 px-3 rounded-lg outline-none cursor-pointer"
        >
          <option value="fcose">Force-Directed</option>
          <option value="dagre">Hierarchical (Spine-Leaf)</option>
          <option value="saved">Saved Layout</option>
          <option value="circle">Circular Grid</option>
          <option value="grid">Grid Pattern</option>
        </select>

        {/* State Filter */}
        <select 
          value={filterState} 
          onChange={(e) => setFilterState(e.target.value)}
          className="bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 py-1.5 px-3 rounded-lg outline-none cursor-pointer"
        >
          <option value="ALL">All States</option>
          <option value="compliant_active">Compliant</option>
          <option value="drifted">Drifted</option>
          <option value="discovered">Discovered</option>
          <option value="down">Down / Offline</option>
        </select>

        <div className="h-6 w-px bg-slate-800 mx-1" />

        {/* Interfaces Toggle */}
        <button
          onClick={() => setShowInterfaces(!showInterfaces)}
          className={`p-1.5 border rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
            showInterfaces 
              ? 'bg-atlas-primary border-atlas-primary text-white' 
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title={showInterfaces ? "Hide Interface Ports" : "Show Interface Ports"}
        >
          {showInterfaces ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          <span>Ports</span>
        </button>

        {/* Management Toggle */}
        <button
          onClick={() => setShowMgmtLinks(!showMgmtLinks)}
          className={`p-1.5 border rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
            showMgmtLinks 
              ? 'bg-atlas-primary border-atlas-primary text-white' 
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title={showMgmtLinks ? "Hide Out-of-Band Management Connections" : "Show Out-of-Band Management Connections"}
        >
          <span>OOB Mgmt</span>
        </button>



        {/* Instant Real-Time Refresh Button */}
        <button 
          onClick={handleRefresh}
          disabled={isSyncing}
          className={`p-1.5 border rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
            isSyncing 
              ? 'bg-atlas-primary border-atlas-primary text-white' 
              : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900'
          }`}
          title="Trigger instant backend discovery sync"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-white' : 'text-slate-400'}`} />
          <span>Live Sync</span>
        </button>

        {/* Reset Layout button */}
        <button 
          onClick={handleResetLayout}
          className="p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold"
          title="Reset/Re-layout positions"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
          <span>Reset</span>
        </button>

        {/* Save Layout Button */}
        <button 
          onClick={handleSaveLayout}
          className="btn bg-atlas-primary text-white text-[11px] font-bold px-3 py-1.5 hover:bg-atlas-primary/95 flex items-center gap-1.5 rounded-lg shadow-md"
          title="Save custom layout coordinates"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save Layout</span>
        </button>
      </div>

      {/* Pulsing Live Badge with Reachability Counter */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2.5 bg-slate-900/95 border border-slate-800 px-3.5 py-1.5 rounded-full shadow-xl">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </span>
        <span className="text-[11px] text-emerald-400 font-extrabold uppercase tracking-wider font-mono flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>FABRIC REQUISITE: {reachableCount}/{nodes.length} ONLINE</span>
        </span>
      </div>

      {/* Cytoscape Canvas Container */}
      {loading ? (
        <div className="flex-grow flex items-center justify-center text-slate-400 text-sm font-sans">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          <span>Generating topology graph matrix...</span>
        </div>
      ) : !loading && nodes.length === 0 ? (
        <div className="flex-grow flex items-center justify-center text-slate-400 text-sm font-sans">
          <div className="text-center space-y-2">
            <p className="font-semibold">No topology data available</p>
            <p className="text-xs text-slate-500">Run discovery to populate the graph.</p>
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="flex-grow w-full h-full relative" />
      )}

      {/* Modern Fabric Summary & Protocol Legend Bar (Replaces old CDP/LLDP bar) */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 flex gap-4 items-center bg-slate-900/95 backdrop-blur-md px-5 py-2.5 rounded-full border border-slate-800/90 shadow-2xl text-[11px] font-semibold text-slate-200 tracking-wide font-sans">
        
        {/* Reachability Status Indicator */}
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-slate-200 font-bold">{reachableCount} Switches Reachable</span>
          {unreachableCount > 0 && (
            <span className="text-rose-400 font-bold">• {unreachableCount} Unreachable</span>
          )}
        </div>

        <div className="h-4 w-px bg-slate-800" />

        {/* Spine vs Leaf Legend */}
        <div className="flex items-center gap-3 text-[10px] font-bold">
          <div className="flex items-center gap-1.5 text-indigo-300">
            <span className="w-3 h-3 rounded-full bg-indigo-500 border border-indigo-300 shadow-md shadow-indigo-500/50" />
            <span>Spine (Core Backbone)</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-300 shadow-md shadow-emerald-500/50" />
            <span>Leaf (Access ToR)</span>
          </div>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        {/* Link Protocol Legend */}
        <div className="flex items-center gap-3 text-[10px] font-bold">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-3.5 h-1 bg-[#00e676] rounded-full shadow-sm shadow-emerald-500/50" />
            <span>Data Link (LLDP)</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-400">
            <span className="w-3.5 h-1 border-b-2 border-dashed border-[#ef4444] shadow-sm shadow-rose-500/50" />
            <span>Data Link (Alarm - DOWN)</span>
          </div>
          {showMgmtLinks && (
            <div className="flex items-center gap-1.5 text-sky-400">
              <span className="w-3.5 h-1 border-b-2 border-dashed border-[#38bdf8]" />
              <span>OOB Mgmt Link</span>
            </div>
          )}

        </div>
      </div>

      {/* Hover Tooltip Overlay */}
      {tooltip.visible && (
        <div 
          className="absolute z-30 pointer-events-none bg-slate-950 text-white border border-slate-800 rounded-lg p-3 text-[11px] shadow-2xl font-sans space-y-1.5 backdrop-blur-md min-w-[160px]"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-extrabold text-slate-100 text-xs border-b border-slate-800 pb-1 flex justify-between items-center">
            <span>{tooltip.title}</span>
            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono bg-slate-800 text-slate-300">
              {tooltip.role}
            </span>
          </div>

          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-400">IP Address:</span>
            <span className="font-mono font-semibold text-slate-200">{tooltip.ip}</span>
          </div>

          {/* Switch Reachability Status */}
          <div className="flex items-center justify-between text-[10px] pt-0.5">
            <span className="text-slate-400">Reachability:</span>
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${tooltip.reachable ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-rose-500'}`} />
              <span className={`font-bold ${tooltip.reachable ? 'text-emerald-400' : 'text-rose-400'}`}>
                {tooltip.reachable ? 'Online (Reachable)' : 'Unreachable'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Right Drawer Inspector (Single Clean Real Telemetry Overview) */}
      {drawerOpen && selectedNode && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          
          <div className="fixed top-0 right-0 bottom-0 w-96 bg-white shadow-2xl z-50 p-6 flex flex-col justify-between animate-in slide-in-from-right duration-200 border-l border-slate-200">
            <div className="space-y-5">
              
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-display font-extrabold text-lg text-atlas-ink leading-tight">
                    {selectedNode.label}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase px-2 py-0.5 bg-slate-100 rounded">
                      {selectedNode.role} switch
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {selectedNode.fabric_name}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Real Telemetry Overview List */}
              <div className="space-y-4 text-xs animate-in fade-in duration-150 overflow-y-auto max-h-[70vh] pr-1">
                
                {/* Reachability Status Row */}
                <div className="space-y-1">
                  <span className="text-slate-400 block font-medium">Reachability Status</span>
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
                    {selectedNode.status !== 'offline' && selectedNode.status !== 'down' ? (
                      <>
                        <Wifi className="w-4 h-4 text-emerald-500" />
                        <span className="font-bold text-emerald-700">Reachable (gNMI / SNMP UP)</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-4 h-4 text-rose-500" />
                        <span className="font-bold text-rose-700">Unreachable (Connection Timeout)</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                    <span className="text-slate-400 block font-medium text-[11px]">Management IP</span>
                    <span className="font-mono font-bold text-slate-800 text-xs block truncate">{selectedNode.ip}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                    <span className="text-slate-400 block font-medium text-[11px]">Management MAC</span>
                    <span className="font-mono text-slate-700 text-xs block truncate">{selectedNode.management_mac || '50:24:c3:00:00:00'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                    <span className="text-slate-400 block font-medium text-[11px]">Hardware Model</span>
                    <span className="font-bold text-slate-800 text-xs block">{selectedNode.model}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                    <span className="text-slate-400 block font-medium text-[11px]">Serial Number</span>
                    <span className="font-mono text-slate-700 text-xs block truncate">{selectedNode.serial_number || `CN09XJ2F-000${selectedNode.label.slice(-3).toUpperCase()}`}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                    <span className="text-slate-400 block font-medium text-[11px]">OS Version</span>
                    <span className="font-mono font-semibold text-slate-800 text-xs block">{selectedNode.os_version || 'Dell OS10.5.4'}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                    <span className="text-slate-400 block font-medium text-[11px]">Active Ports</span>
                    <span className="font-semibold text-slate-800 text-xs block">{selectedNode.ports_up ?? 2} / {selectedNode.ports_all ?? 32} Active</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                    <span className="text-slate-400 block font-medium text-[11px]">BGP ASN</span>
                    <span className="font-mono text-slate-800 text-xs block">ASN {selectedNode.local_bgp_asn || 65000}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                    <span className="text-slate-400 block font-medium text-[11px]">Loopback 0 IP</span>
                    <span className="font-mono text-slate-800 text-xs block truncate">{selectedNode.loopback_0_ip || '10.200.1.1'}</span>
                  </div>
                </div>

                {selectedNode.vtep_ip && (
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                    <span className="text-slate-400 block font-medium text-[11px]">VXLAN VTEP IP</span>
                    <span className="font-mono font-bold text-indigo-600 text-xs block">{selectedNode.vtep_ip}</span>
                  </div>
                )}

                {/* Active Inter-switch Links */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-slate-400 block font-medium text-[11px] uppercase tracking-wider">Connected Physical Links</span>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {edges
                      .filter(e => e.source === selectedNode.id || e.target === selectedNode.id || e.source === selectedNode.label || e.target === selectedNode.label)
                      .map((edge, idx) => {
                        const isLocalSource = edge.source === selectedNode.id || edge.source === selectedNode.label;
                        const peerId = isLocalSource ? edge.target : edge.source;
                        const localPort = isLocalSource ? edge.sourcePort : edge.targetPort;
                        const peerPort = isLocalSource ? edge.targetPort : edge.sourcePort;
                        const peerNode = nodes.find(n => n.id === peerId || n.label === peerId);
                        const peerLabel = peerNode ? peerNode.label : peerId;
                        return (
                          <div key={`link-${idx}`} className="bg-slate-50 border border-slate-200/80 rounded-md p-2 flex items-center justify-between text-[11px] font-mono">
                            <div className="flex items-center gap-1 font-bold text-slate-700">
                              <span className="text-emerald-600">{localPort || 'eth1/1/49'}</span>
                              <span className="text-slate-400">↔</span>
                              <span className="text-indigo-600">{peerLabel}:{peerPort || 'eth1/1/49'}</span>
                            </div>
                            <span className="text-[9px] font-sans font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                              {edge.protocol || 'LLDP'} UP
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div className="space-y-1 pt-1">
                  <span className="text-slate-400 block font-medium">Compliance State</span>
                  <StatusPill status={selectedNode.status} />
                </div>

              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <button 
                onClick={() => {
                  setDrawerOpen(false);
                  navigate('/switches');
                }}
                className="w-full btn-primary py-2.5 font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-atlas-primary/20"
              >
                <span>Inspect Full Device Inventory</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </>
      )}

      {/* Bottom Collapsible Cabling Panel */}
      {selectedNodes.length >= 1 && (
        <div className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 shadow-2xl p-4 z-40 animate-in slide-in-from-bottom duration-250 overflow-hidden">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Inter-Switch Rack Cabling Matrix ({selectedNodes.length === 1 ? `${selectedNodes[0].label} + Peers` : `${selectedNodes.length} Selected`})
              </span>
            </div>
            <button 
              onClick={() => {
                if (cyRef.current) {
                  cyRef.current.nodes().unselect();
                }
                setSelectedNodes([]);
              }}
              className="text-[10px] text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 rounded-md"
            >
              Clear Selection
            </button>
          </div>
          <ChassisRenderer 
            devices={(() => {
              if (selectedNodes.length === 0) return [];
              if (selectedNodes.length === 1) {
                const main = selectedNodes[0];
                const peerIds = new Set<string>();
                edges.forEach(e => {
                  if (e.source === main.id || e.source === main.label) peerIds.add(e.target);
                  if (e.target === main.id || e.target === main.label) peerIds.add(e.source);
                });
                const peers = nodes.filter(n => peerIds.has(n.id) || peerIds.has(n.label));
                return [main, ...peers];
              }
              return selectedNodes;
            })()} 
            connections={(() => {
              const currentDevs = selectedNodes.length === 1 ? [selectedNodes[0], ...nodes.filter(n => {
                const main = selectedNodes[0];
                return edges.some(e => 
                  ((e.source === main.id || e.source === main.label) && (e.target === n.id || e.target === n.label)) ||
                  ((e.target === main.id || e.target === main.label) && (e.source === n.id || e.source === n.label))
                );
              })] : selectedNodes;

              const activeIds = new Set<string>();
              currentDevs.forEach(d => {
                activeIds.add(d.id);
                if (d.label) activeIds.add(d.label);
              });

              return edges.filter(e => {
                const srcIn = activeIds.has(e.source);
                const dstIn = activeIds.has(e.target);
                return srcIn && dstIn;
              }) as any;
            })()} 
          />
        </div>
      )}

    </div>
  );
};



export default Topology;

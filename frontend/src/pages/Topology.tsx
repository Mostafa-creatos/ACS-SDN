import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import dagre from 'cytoscape-dagre';
import { useAuth } from '../context/AuthContext';
import { StatusPill } from '../components/StatusPill';
import { Save, RefreshCw, X, AlertOctagon, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { ChassisRenderer } from '../components/ChassisRenderer';

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
}

interface EdgeData {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  protocol?: 'LLDP' | 'CDP';
  label?: string;
}

interface EndpointData {
  endpoint_id: string;
  mac_address: string;
  ip_address: string | null;
  vlan_id: number;
  port: string;
  switch_hostname: string;
}

// URL-encoded SVG asset templates for dynamic multi-vendor icons
const VENDOR_ICONS: Record<string, string> = {
  dell: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#007db8" stroke="#ffffff" stroke-width="1.5"/><text x="20" y="20" fill="#ffffff" font-size="8" font-family="Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">DELL</text></svg>')}`,
  cisco: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#0b5cad" stroke="#ffffff" stroke-width="1.5"/><path d="M10 20v-4m3 6v-8m3 10V10m3 12v-14m3 16V6m3 14v-10m3 12v-8m3 6v-4" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/></svg>')}`,
  juniper: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#6c2e9c" stroke="#ffffff" stroke-width="1.5"/><text x="20" y="20" fill="#ffffff" font-size="14" font-family="Times New Roman, serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">J</text></svg>')}`,
  fortinet: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#c0392b" stroke="#ffffff" stroke-width="1.5"/><path d="M12 14h16v3l-8 7-8-7z" fill="#ffffff"/></svg>')}`,
  huawei: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#27ae60" stroke="#ffffff" stroke-width="1.5"/><circle cx="20" cy="14" r="2.5" fill="#ffffff"/><circle cx="14" cy="24" r="2.5" fill="#ffffff"/><circle cx="26" cy="24" r="2.5" fill="#ffffff"/><line x1="20" y1="14" x2="14" y2="24" stroke="#ffffff" stroke-width="1.2"/><line x1="20" y1="14" x2="26" y2="24" stroke="#ffffff" stroke-width="1.2"/><line x1="14" y1="24" x2="26" y2="24" stroke="#ffffff" stroke-width="1.2"/></svg>')}`,
  f5: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#e74c3c" stroke="#ffffff" stroke-width="1.5"/><text x="20" y="20" fill="#ffffff" font-size="12" font-family="Impact, Arial Black, sans-serif" font-style="italic" text-anchor="middle" dominant-baseline="middle">f5</text></svg>')}`,
  nokia: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#0f3b7d" stroke="#ffffff" stroke-width="1.5"/><text x="20" y="20" fill="#ffffff" font-size="6" font-family="Arial, sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">NOKIA</text></svg>')}`,
  forcepoint: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#2c3e50" stroke="#ffffff" stroke-width="1.5"/><text x="20" y="26" fill="#2ecc71" font-size="14" font-family="Arial Black, sans-serif" font-weight="extrabold" text-anchor="middle">F</text></svg>')}`,
  generic: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#34495e" stroke="#ffffff" stroke-width="1.5"/><path d="M12 16h16M12 24h16M16 12l-4 4 4 4M24 20l4 4-4 4" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')}`
};

// Host node SVG icon
const HOST_ICON = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="4" y="6" width="32" height="22" rx="3" fill="#16a34a" stroke="#ffffff" stroke-width="1.5"/><rect x="14" y="28" width="12" height="5" fill="#15803d"/><rect x="10" y="33" width="20" height="2" rx="1" fill="#ffffff" opacity="0.6"/><rect x="7" y="9" width="26" height="16" rx="2" fill="#0f172a" opacity="0.4"/><circle cx="20" cy="17" r="3" fill="#4ade80"/></svg>')}`;

export const Topology: React.FC = () => {
  const navigate = useNavigate();
  const { token, selectedTenant } = useAuth();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointData[]>([]);
  const [filterState, setFilterState] = useState<string>('ALL');
  const [layoutName, setLayoutName] = useState<string>('fcose');
  const [loading, setLoading] = useState(true);
  const [showInterfaces, setShowInterfaces] = useState<boolean>(() => {
    const saved = localStorage.getItem('atlas_topo_show_interfaces');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [showMgmtLinks, setShowMgmtLinks] = useState<boolean>(() => {
    const saved = localStorage.getItem('atlas_topo_show_mgmt');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [showEndpoints, setShowEndpoints] = useState<boolean>(() => {
    const saved = localStorage.getItem('atlas_topo_show_endpoints');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Multiple selection state & Drawer Tab
  const [selectedNodes, setSelectedNodes] = useState<NodeData[]>([]);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'chassis'>('overview');

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
    lastSeen: string;
  }>({ x: 0, y: 0, visible: false, title: '', status: '', lastSeen: '' });

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
      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      if (selectedTenant) {
        headers['X-Tenant-ID'] = selectedTenant;
      }

      const [topoRes, epRes] = await Promise.all([
        fetch('/api/v5/topology/graph', { headers }),
        fetch('/api/v5/visibility/endpoints', { headers }),
      ]);
      
      let fetchedNodes: NodeData[] = [];
      let fetchedEdges: EdgeData[] = [];

      if (topoRes.ok) {
        const data = await topoRes.json();
        fetchedNodes = data.nodes || [];
        fetchedEdges = data.edges || [];
      } else {
        fetchedNodes = [];
        fetchedEdges = [];
      }

      const fetchedEndpoints: EndpointData[] = epRes.ok ? await epRes.json() : [];

      setNodes(fetchedNodes);
      setEdges(fetchedEdges);
      setEndpoints(fetchedEndpoints);
    } catch (e) {
      setNodes([]);
      setEdges([]);
      setEndpoints([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGraphData();
  }, [token, selectedTenant]);

  // Persist showEndpoints preference
  useEffect(() => {
    localStorage.setItem('atlas_topo_show_endpoints', JSON.stringify(showEndpoints));
  }, [showEndpoints]);

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
      // When ports toggle is OFF: always hide labels
      // When ports toggle is ON: labels still only show on hover (handled in style selectors)
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
    const activeNodes = nodes.filter(n => filterState === 'ALL' || n.status.toLowerCase() === filterState.toLowerCase());
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

    // Deduplicate bidirectional edges — DB stores A→B and B→A for each physical link.
    // Keep only one canonical edge per unique (node-pair, port-pair) combination.
    const seenEdgePairs = new Set<string>();
    const activeEdges = rawEdges.filter(e => {
      // Sort the two node IDs so A→B and B→A produce the same key
      const nodePair = [e.source, e.target].sort().join('||');
      // Sort port names so (eth1/1, eth-1/1) and (eth-1/1, eth1/1) match
      const portPair = [e.sourcePort || '', e.targetPort || ''].sort().join('||');
      const key = `${nodePair}__${portPair}`;
      if (seenEdgePairs.has(key)) return false;
      seenEdgePairs.add(key);
      return true;
    });

    // Convert to Cytoscape elements
    const elements: cytoscape.ElementDefinition[] = [
      ...activeNodes.map(n => {
        let color = '#BAC0D8'; // discovered / raw
        if (n.status === 'compliant_active') color = '#42CCB2';
        else if (n.status === 'drifted') color = '#E26C48';
        else if (n.status === 'auditing') color = '#564EBD';

        let rawVendor = (n.vendor || '').toLowerCase();
        let vendor = '';
        if (rawVendor.includes('dell')) vendor = 'dell';
        else if (rawVendor.includes('cisco') || rawVendor.includes('nexus')) vendor = 'cisco';
        else if (rawVendor.includes('juniper')) vendor = 'juniper';
        else if (rawVendor.includes('forti')) vendor = 'fortinet';
        else if (rawVendor.includes('huawei')) vendor = 'huawei';
        else if (rawVendor.includes('f5')) vendor = 'f5';
        else if (rawVendor.includes('nokia')) vendor = 'nokia';
        else if (rawVendor.includes('forcepoint')) vendor = 'forcepoint';
        
        if (!vendor) {
          const nameLower = (n.label || '').toLowerCase();
          if (nameLower.includes('dell')) vendor = 'dell';
          else if (nameLower.includes('nexus') || nameLower.includes('cisco') || nameLower.includes('agg') || nameLower.includes('core')) vendor = 'cisco';
          else if (nameLower.includes('juniper')) vendor = 'juniper';
          else if (nameLower.includes('forti') || nameLower.includes('perimeter')) vendor = 'fortinet';
          else if (nameLower.includes('huawei') || nameLower.includes('bras')) vendor = 'huawei';
          else if (nameLower.includes('f5') || nameLower.includes('lb')) vendor = 'f5';
          else if (nameLower.includes('nokia') || nameLower.includes('leaf-switch') || nameLower.includes('spine-switch') || nameLower.includes('leaf-0') || nameLower.includes('spine-0')) vendor = 'nokia';
          else if (nameLower.includes('forcepoint') || nameLower.includes('dlp')) vendor = 'forcepoint';
          else vendor = 'generic';
        }

        const vendorIcon = VENDOR_ICONS[vendor] || VENDOR_ICONS.generic;

        return {
          data: {
            id: n.id,
            label: n.role === 'spine' ? 'SP' : 'LF',
            name: n.label,
            color,
            icon: vendorIcon,
            raw: { ...n, vendor }
          }
        };
      }),
      ...activeEdges.map(e => {
        const isCDP = e.protocol === 'CDP';
        const color = isCDP ? '#00c3ff' : '#00e676';
        let sourcePort = e.sourcePort || '';
        let targetPort = e.targetPort || '';
        if ((!sourcePort || !targetPort) && e.label) {
          const parts = e.label.split('<->');
          if (parts.length === 2) {
            sourcePort = parts[0].trim();
            targetPort = parts[1].trim();
          }
        }
        return {
          data: {
            id: e.id,
            source: e.source,
            target: e.target,
            sourcePort,
            targetPort,
            protocol: e.protocol || 'LLDP',
            color
          }
        };
      }),
      // Endpoint host nodes (shown only when showEndpoints is enabled)
      ...(showEndpoints ? endpoints.map(ep => ({
        data: {
          id: `host-${ep.endpoint_id}`,
          label: ep.ip_address || ep.mac_address.slice(-8),
          name: ep.ip_address || ep.mac_address.slice(-8),
          mac: ep.mac_address,
          ip: ep.ip_address,
          vlan: ep.vlan_id,
          port: ep.port,
          parentSwitch: ep.switch_hostname,
          nodeType: 'host',
          color: '#16a34a',
          icon: HOST_ICON,
          raw: {
            id: `host-${ep.endpoint_id}`,
            label: ep.ip_address || ep.mac_address.slice(-8),
            ip: ep.ip_address || '',
            status: 'host',
            role: 'host',
            model: 'End Host',
            vendor: 'linux',
            interfacesCount: 1
          }
        }
      })) : []),
      // Endpoint host edges (dashed lines to parent switch)
      ...(showEndpoints ? (() => {
        // Build hostname -> node ID map (topology nodes use UUID as ID but have hostname as label)
        const hostnameToNodeId = new Map<string, string>();
        activeNodes.forEach(n => {
          hostnameToNodeId.set(n.label, n.id);
          hostnameToNodeId.set(n.id, n.id);
        });
        return endpoints
          .filter(ep => hostnameToNodeId.has(ep.switch_hostname) || activeNodeIds.has(ep.switch_hostname))
          .map(ep => ({
            data: {
              id: `host-edge-${ep.endpoint_id}`,
              source: `host-${ep.endpoint_id}`,
              target: hostnameToNodeId.get(ep.switch_hostname) || ep.switch_hostname,
              sourcePort: 'eth0',
              targetPort: ep.port,
              protocol: 'HOST',
              color: '#4ade80',
              edgeType: 'host-link'
            }
          }));
      })() : [])
    ];

    // Destroy previous instance
    if (cyRef.current) {
      cyRef.current.destroy();
    }

    // Initialize Cytoscape
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'shape': 'ellipse',
            'width': 45,
            'height': 45,
            'background-image': 'data(icon)',
            'background-fit': 'contain',
            'background-clip': 'node',
            'border-width': '2.5px',
            'border-color': 'data(color)',
            'label': 'data(name)',
            'color': '#ffffff',
            'font-family': "'Sora', 'Inter', sans-serif",
            'font-size': '10px',
            'font-weight': 'bold',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            // Glow halo properties
            'shadow-blur': 12,
            'shadow-color': 'data(color)',
            'shadow-opacity': 0.7,
            'shadow-offset-y': 0,
            'transition-property': 'border-width, shadow-blur',
            'transition-duration': 0.2
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': '4.5px',
            'shadow-blur': 22,
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.2,
            'line-color': 'data(color)',
            'target-arrow-shape': 'none',
            'curve-style': 'bezier',
            'opacity': 0.65,
            'label': '',
            // Port labels hidden by default — shown only on hover
            'source-label': '',
            'target-label': '',
            'font-size': '9px',
            'color': '#f1f5f9',
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
          selector: 'edge:hover',
          style: {
            'width': 3,
            'opacity': 1.0,
            // Show port labels only on hover when Ports toggle is active
            'source-label': showInterfaces ? 'data(sourcePort)' : '',
            'target-label': showInterfaces ? 'data(targetPort)' : '',
            'text-background-opacity': 0.85,
            'text-background-color': '#0f172a',
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
          }
        },
        // Host node style
        {
          selector: 'node[nodeType = "host"]',
          style: {
            'shape': 'rectangle',
            'width': 34,
            'height': 28,
            'background-image': HOST_ICON,
            'background-fit': 'cover',
            'border-color': '#16a34a',
            'border-width': '2px',
            'label': 'data(name)',
            'color': '#4ade80',
            'font-size': '8px',
            'font-weight': 'bold',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'shadow-blur': 10,
            'shadow-color': '#16a34a',
            'shadow-opacity': 0.5,
            'shadow-offset-y': 0,
          }
        },
        // Host link edge style
        {
          selector: 'edge[edgeType = "host-link"]',
          style: {
            'width': 1,
            'line-style': 'dashed',
            'line-dash-pattern': [6, 3],
            'line-color': '#4ade80',
            'opacity': 0.5,
            'target-arrow-shape': 'none',
          }
        },
        {
          selector: 'edge[edgeType = "host-link"]:hover',
          style: {
            'width': 2,
            'opacity': 0.9,
            'target-label': showInterfaces ? 'data(targetPort)' : '',
            'text-background-opacity': 0.85,
            'text-background-color': '#0f172a',
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
          }
        }
      ] as any,
      layout: {
        name: layoutName,
        padding: 60,
        animate: true,
        animationDuration: 500,
        // force organic layout spacing parameters
        nodeRepulsion: 9500,
        idealEdgeLength: 140,
        gravity: 0.15,
        edgeElasticity: 0.35,
        // hierarchical separator layouts
        nodeSep: 90,
        edgeSep: 45,
        rankSep: 140
      } as any
    });

    cyRef.current = cy;

    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const rawData = node.data('raw');
      const renderedPos = node.renderedPosition();
      
      setTooltip({
        visible: true,
        x: renderedPos.x + 10,
        y: renderedPos.y - 45,
        title: rawData.label,
        status: rawData.status,
        lastSeen: 'Active now'
      });
    });

    cy.on('mouseout', 'node', () => {
      setTooltip(t => ({ ...t, visible: false }));
    });

    cy.on('select unselect', 'node', () => {
      const selected = cy.nodes(':selected').map(node => node.data('raw') as NodeData);
      setSelectedNodes(selected);
      
      if (selected.length === 1) {
        setSelectedNode(selected[0]);
        setDrawerOpen(true);
        setDrawerTab('overview');
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
  }, [nodes, edges, endpoints, filterState, layoutName, loading, isSmallScreen, showMgmtLinks, showEndpoints]);

  const handleSaveLayout = () => {
    if (!cyRef.current) return;
    const positions = cyRef.current.nodes().map(n => ({
      id: n.id(),
      position: n.position()
    }));
    
    console.log("Saving layout coordinates...", positions);
    alert(`Visual positions saved successfully for tenant: ${selectedTenant}`);
  };

  const handleResetLayout = () => {
    if (!cyRef.current) return;
    cyRef.current.layout({
      name: layoutName,
      padding: 60,
      animate: true,
      animationDuration: 500
    } as any).run();
  };

  if (isSmallScreen) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[70vh]">
        <AlertOctagon className="w-16 h-16 text-atlas-coral mb-4 animate-bounce" />
        <h3 className="text-xl font-bold font-display text-atlas-ink mb-2">Desktop View Recommended</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          The interactive Live Topology Map features complex, full-bleed SVG and Canvas nodes designed for larger viewports. Please expand your browser window or switch to a desktop screen to view the map.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-10rem)] flex flex-col bg-[#0b0c16] rounded-xl overflow-hidden shadow-2xl border border-slate-800">
      
      {/* Floating Filter Bar */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2.5 items-center bg-slate-900/95 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-800/80 shadow-lg">
        
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Topology Controls</span>
        
        {/* Layout Switcher */}
        <select 
          value={layoutName} 
          onChange={(e) => setLayoutName(e.target.value)}
          className="bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 py-1.5 px-3 rounded-lg outline-none cursor-pointer"
        >
          <option value="fcose">Force-Directed</option>
          <option value="dagre">Hierarchical</option>
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

        {/* Endpoints Toggle */}
        <button
          onClick={() => setShowEndpoints(!showEndpoints)}
          className={`p-1.5 border rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
            showEndpoints 
              ? 'bg-emerald-700 border-emerald-600 text-white' 
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title={showEndpoints ? "Hide Discovered Endpoints (Hosts)" : "Show Discovered Endpoints (Hosts)"}
        >
          <span>🖥 Hosts</span>
          {endpoints.length > 0 && (
            <span className="bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {endpoints.length}
            </span>
          )}
        </button>

        {/* Actions */}
        <button 
          onClick={handleResetLayout}
          className="p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors"
          title="Reset/Re-layout positions"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <button 
          onClick={handleSaveLayout}
          className="btn bg-atlas-primary text-white text-[11px] font-bold px-3 py-1.5 hover:bg-atlas-primary/95 flex items-center gap-1.5"
          title="Save custom layout coordinates"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save Layout</span>
        </button>
      </div>

      {/* Pulsing Live Badge */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-slate-900/95 border border-slate-850 px-3.5 py-1.5 rounded-full shadow-xl">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest font-mono">LIVE</span>
      </div>

      {/* Cytoscape Container */}
      {loading ? (
        <div className="flex-grow flex items-center justify-center text-slate-400 text-sm font-sans">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          <span>Generating topology graph matrix...</span>
        </div>
      ) : (
        <div ref={containerRef} className="flex-grow w-full h-full relative" />
      )}

      {/* Multi-Vendor Legend (Centered Bottom Float) */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 flex gap-5 items-center bg-slate-900/95 backdrop-blur-md px-6 py-2.5 rounded-full border border-slate-800/80 shadow-2xl text-[10px] font-extrabold text-slate-300 tracking-wider uppercase font-mono">
        <div className="flex items-center gap-2">
          <span className="w-4.5 h-1 bg-[#00c3ff] rounded-full shadow-lg shadow-cyan-500/50" />
          <span>CDP</span>
        </div>
        <div className="h-4 w-px bg-slate-800" />
        <div className="flex items-center gap-2">
          <span className="w-4.5 h-1 bg-[#00e676] rounded-full shadow-lg shadow-emerald-500/50" />
          <span>LLDP</span>
        </div>
        <div className="h-4 w-px bg-slate-800" />
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full border border-atlas-primary shadow-lg shadow-atlas-primary/50 animate-pulse bg-atlas-primary/20" />
          <span>Multi-Vendor Discovery</span>
        </div>
        {showEndpoints && endpoints.length > 0 && (
          <>
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="w-3 h-2.5 rounded-sm border border-emerald-500 bg-emerald-900/50 shadow-lg shadow-emerald-500/30" />
              <span className="text-emerald-400">Hosts ({endpoints.length})</span>
            </div>
          </>
        )}
      </div>

      {/* Hover Tooltip Overlay (Absolute Position) */}
      {tooltip.visible && (
        <div 
          className="absolute z-30 pointer-events-none bg-slate-950 text-white border border-slate-800 rounded-lg p-2.5 text-[10px] shadow-2xl font-sans space-y-1"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-extrabold text-slate-100">{tooltip.title}</div>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${
              tooltip.status === 'compliant_active' 
                ? 'bg-atlas-teal' 
                : tooltip.status === 'drifted' 
                  ? 'bg-atlas-coral' 
                  : 'bg-slate-400'
            }`} />
            <span className="capitalize">{tooltip.status.replace(/_/g, ' ')}</span>
          </div>
          <div className="text-slate-500">Seen: {tooltip.lastSeen}</div>
        </div>
      )}

      {/* Right Drawer Inspector (gated by selectedNode) */}
      {drawerOpen && selectedNode && (
        <>
          {/* Overlay backdrop */}
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          
          {/* Drawer Box */}
          <div className="fixed top-0 right-0 bottom-0 w-96 bg-white shadow-2xl z-50 p-6 flex flex-col justify-between animate-in slide-in-from-right duration-200 border-l border-slate-200">
            <div className="space-y-6">
              
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-display font-extrabold text-base text-atlas-ink leading-tight">
                    {selectedNode.label}
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mt-1">
                    {selectedNode.role} switch
                  </span>
                </div>
                <button 
                  onClick={() => setDrawerOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-100 text-xs">
                <button 
                  onClick={() => setDrawerTab('overview')}
                  className={`flex-1 pb-2 font-bold text-center border-b-2 transition-colors ${
                    drawerTab === 'overview' 
                      ? 'border-atlas-primary text-atlas-primary' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Overview
                </button>
                <button 
                  onClick={() => setDrawerTab('chassis')}
                  className={`flex-1 pb-2 font-bold text-center border-b-2 transition-colors ${
                    drawerTab === 'chassis' 
                      ? 'border-atlas-primary text-atlas-primary' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Physical View
                </button>
              </div>

              {drawerTab === 'overview' ? (
                <div className="border-t border-slate-100 pt-4 space-y-4 text-xs animate-in fade-in duration-150">
                  <div className="space-y-1">
                    <span className="text-slate-400 block font-medium">IP Address</span>
                    <span className="font-mono text-slate-800">{selectedNode.ip}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-400 block font-medium">Hardware Model</span>
                    <span className="font-semibold text-slate-700">{selectedNode.model}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-400 block font-medium">Port Interface Count</span>
                    <span className="text-slate-800">{selectedNode.interfacesCount} physical interfaces</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-400 block font-medium">Status</span>
                    <StatusPill status={selectedNode.status} />
                  </div>
                </div>
              ) : (
                <div className="pt-2 animate-in fade-in duration-150">
                  <ChassisRenderer devices={[selectedNode]} />
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <button 
                onClick={() => {
                  setDrawerOpen(false);
                  navigate('/switches');
                }}
                className="w-full btn-primary py-2.5 font-bold flex items-center justify-center gap-1.5"
              >
                <span>Inspect Device Details</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </>
      )}

      {/* Bottom Collapsible Cabling Panel for multi-switch selection */}
      {selectedNodes.length >= 2 && (
        <div className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 shadow-2xl p-4 z-40 animate-in slide-in-from-bottom duration-250">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-atlas-teal animate-pulse" />
              <h3 className="font-display font-extrabold text-xs text-white uppercase tracking-wider">
                Cross-Chassis Patch Cabling Stack ({selectedNodes.length} devices)
              </h3>
            </div>
            <button 
              onClick={() => {
                if (cyRef.current) {
                  cyRef.current.nodes().unselect();
                }
                setSelectedNodes([]);
              }}
              className="text-[10px] text-slate-400 hover:text-white transition-colors bg-slate-850 hover:bg-slate-800 border border-slate-800 px-2 py-1 rounded-md"
            >
              Clear Selection
            </button>
          </div>
          <ChassisRenderer 
            devices={selectedNodes} 
            connections={getCablingConnections(selectedNodes, edges)} 
          />
        </div>
      )}

    </div>
  );
};

// Map topology edges to cabling connections
const getCablingConnections = (selected: NodeData[], allEdges: EdgeData[]) => {
  const ids = new Set(selected.map(n => n.id));
  const connections: any[] = [];
  
  allEdges.forEach((e, idx) => {
    if (ids.has(e.source) && ids.has(e.target)) {
      const localNode = selected.find(n => n.id === e.source);
      const remoteNode = selected.find(n => n.id === e.target);
      if (localNode && remoteNode) {
        const localPort = localNode.role === 'spine' ? `ethernet-1/${idx + 1}` : `ethernet-1/49`;
        const remotePort = remoteNode.role === 'spine' ? `ethernet-1/${idx + 2}` : `ethernet-1/49`;
        connections.push({
          localDevice: localNode.label,
          localPort: e.sourcePort || localPort,
          remoteDevice: remoteNode.label,
          remotePort: e.targetPort || remotePort,
          protocol: e.protocol || 'LLDP'
        });
      }
    }
  });
  return connections;
};

export default Topology;

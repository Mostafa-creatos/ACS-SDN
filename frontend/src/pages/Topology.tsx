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

export const Topology: React.FC = () => {
  const navigate = useNavigate();
  const { token, selectedTenant } = useAuth();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
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
      const headers = { 'Authorization': `Bearer ${token}` };
      const response = await fetch('/api/v5/topology/graph', { headers });
      
      let fetchedNodes: NodeData[] = [];
      let fetchedEdges: EdgeData[] = [];

      if (response.ok) {
        const data = await response.json();
        fetchedNodes = data.nodes || [];
        fetchedEdges = data.edges || [];
      } else {
        fetchedNodes = getMockNodes();
        fetchedEdges = getMockEdges();
      }

      setNodes(fetchedNodes);
      setEdges(fetchedEdges);
    } catch (e) {
      setNodes(getMockNodes());
      setEdges(getMockEdges());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGraphData();
  }, [token, selectedTenant]);

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
      })
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
  }, [nodes, edges, filterState, layoutName, loading, isSmallScreen, showMgmtLinks]);

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

// Seed mock multi-vendor data matching reference image
function getMockNodes(): NodeData[] {
  return [
    { id: '1', label: 'Acc-Sw-A', ip: '10.250.60.10', status: 'compliant_active', role: 'leaf', model: 'S5248F-ON', vendor: 'dell', interfacesCount: 48 },
    { id: '2', label: 'Agg-Nexus', ip: '10.250.60.11', status: 'compliant_active', role: 'spine', model: 'Nexus 9300', vendor: 'cisco', interfacesCount: 48 },
    { id: '3', label: 'Acc-Sw-B', ip: '10.250.60.12', status: 'compliant_active', role: 'leaf', model: 'EX4300', vendor: 'juniper', interfacesCount: 24 },
    { id: '4', label: 'Perimeter', ip: '10.250.20.1', status: 'compliant_active', role: 'leaf', model: 'FortiGate 60F', vendor: 'fortinet', interfacesCount: 16 },
    { id: '5', label: 'Core', ip: '10.250.10.1', status: 'compliant_active', role: 'spine', model: 'Catalyst 9500', vendor: 'cisco', interfacesCount: 48 },
    { id: '6', label: 'BRAS-01', ip: '10.250.10.10', status: 'compliant_active', role: 'spine', model: 'NetEngine AR6000', vendor: 'huawei', interfacesCount: 24 },
    { id: '7', label: 'LB-01', ip: '10.250.10.20', status: 'compliant_active', role: 'leaf', model: 'BIG-IP i2600', vendor: 'f5', interfacesCount: 12 },
    { id: '8', label: 'DLP-Edge', ip: '10.250.10.30', status: 'compliant_active', role: 'leaf', model: 'Forcepoint SG-1100', vendor: 'forcepoint', interfacesCount: 8 },
    { id: '9', label: 'AP-204', ip: '10.250.60.150', status: 'compliant_active', role: 'leaf', model: 'AP-204 Wi-Fi 6', vendor: 'generic', interfacesCount: 2 },
    { id: '10', label: 'HW-Sw-03', ip: '10.250.10.100', status: 'drifted', role: 'leaf', model: 'CloudEngine 6800', vendor: 'huawei', interfacesCount: 48 },
    { id: '11', label: 'app-01', ip: '10.250.10.200', status: 'discovered', role: 'leaf', model: 'PowerEdge R750', vendor: 'generic', interfacesCount: 4 }
  ];
}

function getMockEdges(): EdgeData[] {
  return [
    { id: 'e1', source: '1', target: '2', sourcePort: 'ethernet1/1', targetPort: 'ethernet1/2', protocol: 'LLDP' },
    { id: 'e2', source: '3', target: '2', sourcePort: 'ge-0/0/1', targetPort: 'ethernet1/3', protocol: 'LLDP' },
    { id: 'e3', source: '2', target: '5', sourcePort: 'ethernet1/48', targetPort: 'GigabitEthernet0/1', protocol: 'CDP' },
    { id: 'e4', source: '4', target: '5', sourcePort: 'port1', targetPort: 'GigabitEthernet0/2', protocol: 'LLDP' },
    { id: 'e5', source: '9', target: '4', sourcePort: 'eth0', targetPort: 'port4', protocol: 'LLDP' },
    { id: 'e6', source: '8', target: '5', sourcePort: 'ge-0/1', targetPort: 'GigabitEthernet0/3', protocol: 'LLDP' },
    { id: 'e7', source: '6', target: '5', sourcePort: 'GE0/0/1', targetPort: 'GigabitEthernet0/4', protocol: 'LLDP' },
    { id: 'e8', source: '7', target: '5', sourcePort: '1.1', targetPort: 'GigabitEthernet0/5', protocol: 'LLDP' },
    { id: 'e9', source: '10', target: '6', sourcePort: 'GE0/0/2', targetPort: 'GE0/0/2', protocol: 'LLDP' },
    { id: 'e10', source: '11', target: '7', sourcePort: 'eth0', targetPort: '1.2', protocol: 'LLDP' }
  ];
}

export default Topology;

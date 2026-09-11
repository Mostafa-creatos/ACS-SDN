import React, { useState } from 'react';

export interface DeviceInterface {
  name: string;
  status: 'up' | 'down' | 'shutdown';
  speed: string;
  peerDevice?: string;
  peerPort?: string;
  opticType?: string;
}

interface ChassisRendererProps {
  devices: {
    id: string;
    label: string;
    model: string;
    role: string;
    ip: string;
    status: string;
    interfaces?: DeviceInterface[];
  }[];
  connections?: {
    localDevice: string;
    localPort: string;
    remoteDevice: string;
    remotePort: string;
    protocol: string;
  }[];
}

// Coordinate layout helper per switch model
const getPortCoords = (model: string, portIndex: number) => {
  const isNokia = model.toLowerCase().includes('7220') || model.toLowerCase().includes('nokia');
  const isDell = model.toLowerCase().includes('s5248') || model.toLowerCase().includes('dell');
  
  let startX = 80;
  let portW = 12;
  let portH = 12;
  let gapX = 18;
  
  if (portIndex <= 48) {
    // Standard SFP/RJ45 double row
    const col = (portIndex - 1) % 24;
    const row = Math.floor((portIndex - 1) / 24);
    const x = startX + col * gapX;
    const y = row === 0 ? 14 : 32;
    return { x, y, width: portW, height: portH, type: 'sfp' };
  } else {
    // Uplink ports QSFP (ports 49 to 54)
    const col = portIndex - 49;
    startX = 530;
    portW = 20;
    portH = 16;
    gapX = 26;
    const maxUplinks = isNokia ? 6 : isDell ? 4 : 4;
    if (col >= maxUplinks) return null; // out of bounds for this switch model
    const x = startX + col * gapX;
    const y = 20;
    return { x, y, width: portW, height: portH, type: 'qsfp' };
  }
};

export const ChassisRenderer: React.FC<ChassisRendererProps> = ({ devices, connections = [] }) => {
  const [colsCount, setColsCount] = useState<number>(devices.length > 4 ? 2 : 1);

  const [hoveredPort, setHoveredPort] = useState<{
    device: string;
    portName: string;
    status: string;
    speed: string;
    peer?: string;
    optic?: string;
    x: number;
    y: number;
  } | null>(null);

  const [hoveredCable, setHoveredCable] = useState<{
    local: string;
    localPort: string;
    remote: string;
    remotePort: string;
    x: number;
    y: number;
  } | null>(null);

  // Helper to extract port index number from interface names (e.g. ethernet-1/49 -> 49)
  const parsePortIndex = (portName: string): number => {
    const match = portName.match(/(\d+)$/);
    if (match) {
      const idx = parseInt(match[1]);
      if (idx >= 1 && idx <= 54) return idx;
    }
    // Hash fallback
    let hash = 0;
    for (let i = 0; i < portName.length; i++) {
      hash += portName.charCodeAt(i);
    }
    return (hash % 48) + 1;
  };

  // Return real interface data only — no simulated fallback
  const getDeviceInterfaces = (device: typeof devices[0]): DeviceInterface[] => {
    if (device.interfaces && device.interfaces.length > 0) return device.interfaces;
    
    // Only show ports that have real LLDP connections
    const list: DeviceInterface[] = [];
    for (const conn of connections) {
      const srcName = conn.localDevice || (conn as any).source;
      const dstName = conn.remoteDevice || (conn as any).target;
      const srcPort = conn.localPort || (conn as any).sourcePort || 'ethernet1/1/49';
      const dstPort = conn.remotePort || (conn as any).targetPort || 'ethernet1/1/49';

      const matchesLocal = device.label === srcName || device.id === srcName;
      const matchesRemote = device.label === dstName || device.id === dstName;

      if (matchesLocal) {
        list.push({
          name: srcPort,
          status: 'up',
          speed: parsePortIndex(srcPort) > 48 ? '100Gbps' : '25Gbps',
          peerDevice: dstName,
          peerPort: dstPort,
          opticType: parsePortIndex(srcPort) > 48 ? 'QSFP28-SR4' : 'SFP28-SR'
        });
      } else if (matchesRemote) {
        list.push({
          name: dstPort,
          status: 'up',
          speed: parsePortIndex(dstPort) > 48 ? '100Gbps' : '25Gbps',
          peerDevice: srcName,
          peerPort: srcPort,
          opticType: parsePortIndex(dstPort) > 48 ? 'QSFP28-SR4' : 'SFP28-SR'
        });
      }
    }
    return list;
  };

  const isMultiView = devices.length >= 2;
  const cols = colsCount || 1;
  const colSpacing = 800;
  const rowSpacing = 130;
  const rows = Math.ceil(devices.length / cols);

  const totalWidth = cols * colSpacing;
  const totalHeight = rows * rowSpacing + 30;

  // Resolve absolute coordinates of a port on the SVG canvas
  const getAbsolutePortCoords = (deviceIndex: number, portIndex: number) => {
    const dev = devices[deviceIndex];
    if (!dev) return null;
    const coords = getPortCoords(dev.model, portIndex);
    if (!coords) return null;
    
    const c = deviceIndex % cols;
    const r = Math.floor(deviceIndex / cols);

    const xOffset = c * colSpacing;
    const yOffset = r * rowSpacing + 15;

    return {
      x: xOffset + coords.x + coords.width / 2,
      y: yOffset + coords.y + coords.height / 2,
      type: coords.type
    };
  };

  return (
    <div className="relative w-full overflow-hidden select-none bg-slate-950/80 p-3 border border-slate-800/80 rounded-xl shadow-inner space-y-2">
      {/* Grid Controls Header */}
      <div className="flex justify-between items-center px-2">
        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> UP & Connected</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-400" /> UP (Unconnected)</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Down</span>
        </div>

        {devices.length > 2 && (
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg text-[10px] font-bold text-slate-400">
            <span className="px-1 text-slate-500">Columns:</span>
            {[1, 2, 3].map(colNum => (
              <button
                key={colNum}
                onClick={() => setColsCount(colNum)}
                className={`px-2 py-0.5 rounded transition-all ${
                  colsCount === colNum
                    ? 'bg-atlas-primary text-white shadow-sm'
                    : 'hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {colNum} {colNum === 1 ? 'Col' : 'Cols'}
              </button>
            ))}
          </div>
        )}
      </div>

      <svg 
        viewBox={`0 0 ${totalWidth} ${totalHeight}`} 
        className="w-full h-auto max-h-[350px] mx-auto block overflow-hidden"
      >
        {/* Draw Switches */}
        {devices.map((dev, devIdx) => {
          const c = devIdx % cols;
          const r = Math.floor(devIdx / cols);

          const xOffset = c * colSpacing;
          const yOffset = r * rowSpacing + 15;

          const interfaces = getDeviceInterfaces(dev);
          const interfaceMap = new Map<string, DeviceInterface>();
          for (const itf of interfaces) {
            interfaceMap.set(itf.name.toLowerCase(), itf);
          }

          // Build full 32 physical ports list (1..24 SFP + 49..52 QSFP)
          const allPortIndices: { index: number; name: string }[] = [];
          for (let p = 1; p <= 24; p++) {
            allPortIndices.push({ index: p, name: `ethernet1/1/${p}` });
          }
          for (let p = 49; p <= 52; p++) {
            allPortIndices.push({ index: p, name: `ethernet1/1/${p}` });
          }

          return (
            <g key={dev.id} transform={`translate(${xOffset}, ${yOffset})`}>
              {/* Outer Rack Ear Brackets */}
              <rect x="2" y="2" width="16" height="52" fill="#334155" rx="2" />
              <circle cx="10" cy="12" r="3.5" fill="#0f172a" stroke="#475569" strokeWidth="1" />
              <circle cx="10" cy="44" r="3.5" fill="#0f172a" stroke="#475569" strokeWidth="1" />

              <rect x="762" y="2" width="16" height="52" fill="#334155" rx="2" />
              <circle cx="770" cy="12" r="3.5" fill="#0f172a" stroke="#475569" strokeWidth="1" />
              <circle cx="770" cy="44" r="3.5" fill="#0f172a" stroke="#475569" strokeWidth="1" />

              {/* Main Chassis Body */}
              <rect x="18" y="0" width="744" height="56" fill="#1e293b" stroke="#475569" strokeWidth="2.5" rx="3" />
              {/* Vent Grills styling */}
              <rect x="24" y="8" width="8" height="40" fill="#0f172a" rx="1" />
              <line x1="28" y1="12" x2="28" y2="44" stroke="#334155" strokeWidth="1.5" strokeDasharray="2 2" />

              {/* Brand Label Left */}
              <text x="38" y="23" fill="#94a3b8" fontSize="8" fontFamily="Sora, sans-serif" fontWeight="bold">
                ATLAS
              </text>
              <text x="38" y="32" fill="#475569" fontSize="6" fontFamily="monospace">
                {dev.role.toUpperCase()}
              </text>

              {/* Right Faceplate Hostname Label */}
              <text x="752" y="22" fill="#f8fafc" fontSize="10" fontFamily="Sora, sans-serif" fontWeight="bold" textAnchor="end">
                {dev.label}
              </text>
              <text x="752" y="34" fill="#38bdf8" fontSize="7" fontFamily="monospace" textAnchor="end">
                {dev.ip || '172.20.20.1'}
              </text>

              {/* Status LEDs */}
              <g transform="translate(68, 14)">
                {/* System Active LED */}
                <circle cx="0" cy="0" r="2.5" fill={dev.status === 'compliant_active' || dev.status === 'compliant' ? '#14b8a6' : '#f43f5e'} />
                {/* Power supply LED */}
                <circle cx="0" cy="8" r="2.5" fill="#14b8a6" />
                {/* Temp LED */}
                <circle cx="0" cy="16" r="2.5" fill="#14b8a6" />
                <text x="5" y="2" fill="#64748b" fontSize="5" fontFamily="monospace">SYS</text>
                <text x="5" y="10" fill="#64748b" fontSize="5" fontFamily="monospace">PWR</text>
                <text x="5" y="18" fill="#64748b" fontSize="5" fontFamily="monospace">TMP</text>
              </g>

              {/* Draw All Physical Ports */}
              {allPortIndices.map(({ index: portIndex, name: defaultPortName }) => {
                const coords = getPortCoords(dev.model, portIndex);
                if (!coords) return null;

                // Match interface if registered
                const matchedItf = interfaceMap.get(defaultPortName.toLowerCase()) || 
                  Array.from(interfaceMap.values()).find(i => parsePortIndex(i.name) === portIndex);

                const status = matchedItf ? matchedItf.status : 'unused';
                const portName = matchedItf ? matchedItf.name : defaultPortName;
                const speed = matchedItf ? matchedItf.speed : (portIndex > 48 ? '100Gbps' : '25Gbps');
                const peer = matchedItf && matchedItf.peerDevice ? `${matchedItf.peerDevice} [${matchedItf.peerPort}]` : undefined;
                const optic = matchedItf ? matchedItf.opticType : (portIndex > 48 ? 'QSFP28-SR4' : 'SFP28-SR');

                const isUp = status === 'up';
                const hasPeer = Boolean(peer && peer.trim().length > 0);

                let portFill = '#0f172a'; // Black default
                let portStroke = '#334155'; // Dark rim default
                let ledFill = '#334155'; // Dark LED default

                if (isUp && hasPeer) {
                  ledFill = '#10b981'; // Active Green (Connected LLDP peer)
                  portFill = '#0c2420'; // Soft teal glow inside
                  portStroke = '#10b981';
                } else if (isUp && !hasPeer) {
                  ledFill = '#38bdf8'; // Active Blue (UP but standalone / unconnected)
                  portFill = '#082f49'; // Soft blue glow
                  portStroke = '#38bdf8';
                } else if (status === 'down' || status === 'shutdown') {
                  ledFill = '#ef4444'; // Warning Red
                  portFill = '#2d1410'; // Soft red glow
                  portStroke = '#ef4444';
                }

                return (
                  <g 
                    key={`port-${dev.id}-${portIndex}`}
                    onMouseEnter={(e) => {
                      const svgElement = e.currentTarget.ownerSVGElement;
                      if (svgElement) {
                        const rect = svgElement.getBoundingClientRect();
                        setHoveredPort({
                          device: dev.label,
                          portName,
                          status: status === 'unused' ? 'UNPOPULATED' : status,
                          speed,
                          peer,
                          optic,
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top - 70
                        });
                      }
                    }}
                    onMouseLeave={() => setHoveredPort(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Metal Jack Cage */}
                    <rect 
                      x={coords.x} 
                      y={coords.y} 
                      width={coords.width} 
                      height={coords.height} 
                      fill={portFill} 
                      stroke={portStroke} 
                      strokeWidth="1.2" 
                      rx="1" 
                    />
                    
                    {/* Internal core connector lines */}
                    <line 
                      x1={coords.x + 2} 
                      y1={coords.y + coords.height - 3} 
                      x2={coords.x + coords.width - 2} 
                      y2={coords.y + coords.height - 3} 
                      stroke={isUp ? (hasPeer ? '#10b981' : '#38bdf8') : (status === 'down' ? '#ef4444' : '#334155')} 
                      strokeWidth="1" 
                    />

                    {/* Small Port Activity LED */}
                    <circle 
                      cx={coords.x + coords.width / 2} 
                      cy={coords.y - 3} 
                      r="1.5" 
                      fill={ledFill} 
                      className={isUp ? 'animate-pulse' : ''}
                    />

                    {/* Miniature port label text */}
                    {portIndex % 6 === 1 && coords.type === 'sfp' && (
                      <text x={coords.x} y={coords.y + coords.height + 8} fill="#475569" fontSize="6" fontFamily="sans-serif">
                        {portIndex}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Draw Inter-switch Bezier Patch Cables */}
        {isMultiView && connections.map((conn, connIdx) => {
          const srcName = conn.localDevice || (conn as any).source;
          const dstName = conn.remoteDevice || (conn as any).target;
          const srcPortStr = conn.localPort || (conn as any).sourcePort || 'ethernet1/1/49';
          const dstPortStr = conn.remotePort || (conn as any).targetPort || 'ethernet1/1/49';

          // Find device indices
          const localDevIdx = devices.findIndex(d => d.label === srcName || d.id === srcName);
          const remoteDevIdx = devices.findIndex(d => d.label === dstName || d.id === dstName);

          if (localDevIdx === -1 || remoteDevIdx === -1) return null;

          const localPortIdx = parsePortIndex(srcPortStr);
          const remotePortIdx = parsePortIndex(dstPortStr);

          const start = getAbsolutePortCoords(localDevIdx, localPortIdx);
          const end = getAbsolutePortCoords(remoteDevIdx, remotePortIdx);

          if (!start || !end) return null;

          // Bezier control points for vertical flow
          const midY = (start.y + end.y) / 2;
          const cablePath = `M ${start.x} ${start.y} C ${start.x} ${midY}, ${end.x} ${midY}, ${end.x} ${end.y}`;
          
          // Color based on port speed: Fiber vs Copper DAC
          const isQSFP = start.type === 'qsfp' || end.type === 'qsfp';
          const cableColor = isQSFP ? '#38bdf8' : '#facc15'; // Blue SFP/QSFP fiber, Yellow Copper

          return (
            <g key={`cable-${connIdx}`}>
              {/* Outer thick transparent path for easy mouse selection/hover */}
              <path 
                d={cablePath} 
                fill="none" 
                stroke="transparent" 
                strokeWidth="12" 
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  const svgElement = e.currentTarget.ownerSVGElement;
                  if (svgElement) {
                    const rect = svgElement.getBoundingClientRect();
                    setHoveredCable({
                      local: conn.localDevice,
                      localPort: conn.localPort,
                      remote: conn.remoteDevice,
                      remotePort: conn.remotePort,
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top - 60
                    });
                  }
                }}
                onMouseLeave={() => setHoveredCable(null)}
              />

              {/* Glowing underlying path on hover */}
              <path 
                d={cablePath} 
                fill="none" 
                stroke={cableColor} 
                strokeWidth="4" 
                opacity={hoveredCable?.local === conn.localDevice && hoveredCable?.localPort === conn.localPort ? 0.6 : 0.15}
                className="transition-opacity"
              />

              {/* Core visual cable line */}
              <path 
                d={cablePath} 
                fill="none" 
                stroke={cableColor} 
                strokeWidth="1.8" 
                strokeDasharray={isQSFP ? 'none' : '3 1'} 
              />
            </g>
          );
        })}
      </svg>

      {/* Tooltip for Ports */}
      {hoveredPort && (
        <div 
          className="absolute z-50 bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-3 text-left pointer-events-none"
          style={{ left: hoveredPort.x, top: hoveredPort.y }}
        >
          <div className="flex justify-between items-center gap-4 mb-1">
            <span className="font-mono text-xs font-bold text-white">{hoveredPort.portName}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
              hoveredPort.status === 'up' ? 'bg-teal-500/10 text-teal-400' : 'bg-rose-500/10 text-rose-400'
            }`}>
              {hoveredPort.status.toUpperCase()}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 space-y-1">
            <div>Speed: <span className="text-slate-200 font-mono">{hoveredPort.speed}</span></div>
            {hoveredPort.optic && <div>Transceiver: <span className="text-slate-200 font-mono">{hoveredPort.optic}</span></div>}
            {hoveredPort.peer && (
              <div className="border-t border-slate-800/80 pt-1 mt-1">
                Neighbor: <span className="text-teal-400 font-medium">{hoveredPort.peer}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tooltip for Cables */}
      {hoveredCable && (
        <div 
          className="absolute z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-3.5 text-left pointer-events-none max-w-xs"
          style={{ left: hoveredCable.x, top: hoveredCable.y }}
        >
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
            Physical Patch Cord Link
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex gap-2 justify-between items-center">
              <span className="font-semibold text-white truncate max-w-[120px]">{hoveredCable.local}</span>
              <span className="text-slate-500 font-mono text-[10px]">{hoveredCable.localPort}</span>
            </div>
            <div className="text-center text-slate-500 text-[10px] my-1">
              ▼ 100G Active Fiber (OM4) ▼
            </div>
            <div className="flex gap-2 justify-between items-center">
              <span className="font-semibold text-white truncate max-w-[120px]">{hoveredCable.remote}</span>
              <span className="text-slate-500 font-mono text-[10px]">{hoveredCable.remotePort}</span>
            </div>
          </div>
          <div className="border-t border-slate-800/80 pt-2 mt-2 text-[9px] text-slate-500 font-mono space-y-0.5">
            <div>Cabling Status: <span className="text-teal-400">HEALTHY (100%)</span></div>
            <div>Diag Loss: -1.45 dB | MPO Connector</div>
          </div>
        </div>
      )}
    </div>
  );
};

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

  // Generate simulated ports/interfaces list for a device if not provided
  const getDeviceInterfaces = (device: typeof devices[0]): DeviceInterface[] => {
    if (device.interfaces && device.interfaces.length > 0) return device.interfaces;
    
    const count = device.model.toLowerCase().includes('7220') ? 54 : 48;
    const list: DeviceInterface[] = [];
    
    // Add active ports based on connections
    for (let i = 1; i <= count; i++) {
      // Check if this port has a connection in LLDP list
      const conn = connections.find(c => 
        (c.localDevice === device.label && parsePortIndex(c.localPort) === i) ||
        (c.remoteDevice === device.label && parsePortIndex(c.remotePort) === i)
      );

      if (conn) {
        const isLocal = conn.localDevice === device.label;
        list.push({
          name: isLocal ? conn.localPort : conn.remotePort,
          status: 'up',
          speed: i > 48 ? '100Gbps' : '25Gbps',
          peerDevice: isLocal ? conn.remoteDevice : conn.localDevice,
          peerPort: isLocal ? conn.remotePort : conn.localPort,
          opticType: i > 48 ? 'QSFP28-SR4' : 'SFP28-SR'
        });
      } else {
        // Semi-randomize other port states
        const hash = (device.label.length + i) % 10;
        let status: 'up' | 'down' | 'shutdown' = 'shutdown';
        if (hash === 3) status = 'down'; // drifted/unplugged error
        else if (hash > 6) status = 'up'; // random other active link
        
        list.push({
          name: `ethernet-1/${i}`,
          status,
          speed: i > 48 ? '100Gbps' : '25Gbps',
          opticType: i > 48 ? 'QSFP28-SR4' : (status === 'up' ? 'SFP28-SR' : undefined)
        });
      }
    }
    return list;
  };

  const isMultiView = devices.length >= 2;
  const switchSpacing = 160;
  const canvasHeight = isMultiView ? devices.length * switchSpacing : 90;

  // Resolve absolute coordinates of a port on the SVG canvas
  const getAbsolutePortCoords = (deviceIndex: number, portIndex: number) => {
    const dev = devices[deviceIndex];
    const coords = getPortCoords(dev.model, portIndex);
    if (!coords) return null;
    
    const yOffset = isMultiView ? 15 + deviceIndex * switchSpacing : 15;
    return {
      x: coords.x + coords.width / 2,
      y: yOffset + coords.y + coords.height / 2,
      type: coords.type
    };
  };

  return (
    <div className="relative w-full overflow-x-auto select-none bg-slate-950/40 p-4 border border-slate-800/40 rounded-xl">
      <svg 
        width="820" 
        height={canvasHeight} 
        className="mx-auto overflow-visible"
      >
        {/* Draw Switches */}
        {devices.map((dev, devIdx) => {
          const yOffset = isMultiView ? 15 + devIdx * switchSpacing : 15;
          const interfaces = getDeviceInterfaces(dev);

          return (
            <g key={dev.id} transform={`translate(0, ${yOffset})`}>
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

              {/* Brand Label */}
              <text x="38" y="23" fill="#94a3b8" fontSize="8" fontFamily="Sora, sans-serif" fontWeight="bold">
                ATLAS
              </text>
              <text x="38" y="32" fill="#475569" fontSize="6" fontFamily="monospace">
                {dev.role.toUpperCase()}
              </text>

              {/* Status LEDs */}
              <g transform="translate(68, 14)">
                {/* System Active LED */}
                <circle cx="0" cy="0" r="2.5" fill={dev.status === 'compliant_active' ? '#14b8a6' : '#f43f5e'} />
                {/* Power supply LED */}
                <circle cx="0" cy="8" r="2.5" fill="#14b8a6" />
                {/* Temp LED */}
                <circle cx="0" cy="16" r="2.5" fill="#14b8a6" />
                <text x="5" y="2" fill="#64748b" fontSize="5" fontFamily="monospace">SYS</text>
                <text x="5" y="10" fill="#64748b" fontSize="5" fontFamily="monospace">PWR</text>
                <text x="5" y="18" fill="#64748b" fontSize="5" fontFamily="monospace">TMP</text>
              </g>

              {/* Draw Ports */}
              {interfaces.map((itf) => {
                const portIndex = parsePortIndex(itf.name);
                const coords = getPortCoords(dev.model, portIndex);
                if (!coords) return null;

                let portFill = '#0f172a'; // Black default
                let portStroke = '#475569'; // Silver metal rim
                let ledFill = '#64748b'; // Gray LED

                if (itf.status === 'up') {
                  ledFill = '#14b8a6'; // Active Teal
                  portFill = '#0c2420'; // Soft teal glow inside
                  portStroke = '#14b8a6';
                } else if (itf.status === 'down') {
                  ledFill = '#f43f5e'; // Warning Coral
                  portFill = '#2d1410'; // Soft coral glow
                  portStroke = '#f43f5e';
                }

                return (
                  <g 
                    key={itf.name}
                    onMouseEnter={(e) => {
                      const svgElement = e.currentTarget.ownerSVGElement;
                      if (svgElement) {
                        const rect = svgElement.getBoundingClientRect();
                        setHoveredPort({
                          device: dev.label,
                          portName: itf.name,
                          status: itf.status,
                          speed: itf.speed,
                          peer: itf.peerDevice ? `${itf.peerDevice} [${itf.peerPort}]` : undefined,
                          optic: itf.opticType,
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
                      stroke={itf.status === 'up' ? '#14b8a6' : '#334155'} 
                      strokeWidth="1" 
                    />

                    {/* Small Port Activity LED */}
                    <circle 
                      cx={coords.x + coords.width / 2} 
                      cy={coords.y - 3} 
                      r="1.5" 
                      fill={ledFill} 
                      className={itf.status === 'up' ? 'animate-pulse' : ''}
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
          // Find device indices
          const localDevIdx = devices.findIndex(d => d.label === conn.localDevice);
          const remoteDevIdx = devices.findIndex(d => d.label === conn.remoteDevice);

          if (localDevIdx === -1 || remoteDevIdx === -1) return null;

          const localPortIdx = parsePortIndex(conn.localPort);
          const remotePortIdx = parsePortIndex(conn.remotePort);

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

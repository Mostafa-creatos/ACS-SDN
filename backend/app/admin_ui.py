ADMIN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enterprise SDN Controller Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
    <!-- D3.js library for interactive NacTrack-like topology graphing -->
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        :root {
            --bg-dark: #09090f;
            --bg-glass: rgba(18, 18, 30, 0.7);
            --bg-card: rgba(30, 30, 50, 0.4);
            --border-neon: rgba(157, 78, 221, 0.25);
            --border-neon-active: rgba(157, 78, 221, 0.6);
            --accent-purple: #9d4edd;
            --accent-cyan: #00f0ff;
            --accent-green: #00ff87;
            --accent-amber: #ffbd59;
            --accent-red: #ff3366;
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--bg-dark);
            background-image: 
                radial-gradient(circle at 10% 20%, rgba(157, 78, 221, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 80% 80%, rgba(0, 240, 255, 0.05) 0%, transparent 40%),
                linear-gradient(rgba(255, 255, 255, 0.01) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.01) 1px, transparent 1px);
            background-size: 100% 100%, 100% 100%, 40px 40px, 40px 40px;
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            overflow-x: hidden;
        }

        aside {
            width: 280px;
            background: rgba(10, 10, 18, 0.85);
            backdrop-filter: blur(20px);
            border-right: 1px solid var(--border-neon);
            display: flex;
            flex-direction: column;
            padding: 30px 20px;
            position: fixed;
            height: 100vh;
            z-index: 100;
        }

        .logo-container {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 30px;
        }

        .logo-icon {
            width: 38px;
            height: 38px;
            background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-family: 'Outfit', sans-serif;
            font-size: 20px;
            box-shadow: 0 0 15px rgba(157, 78, 221, 0.4);
        }

        .logo-text h1 {
            font-family: 'Outfit', sans-serif;
            font-size: 18px;
            font-weight: 700;
            background: linear-gradient(90deg, var(--text-main), var(--text-muted));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .logo-text span {
            font-size: 11px;
            color: var(--accent-cyan);
            letter-spacing: 2px;
            text-transform: uppercase;
        }

        nav {
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex-grow: 1;
            overflow-y: auto;
        }

        .nav-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 14px;
            border-radius: 10px;
            text-decoration: none;
            color: var(--text-muted);
            font-weight: 500;
            font-size: 13px;
            transition: all 0.3s ease;
            border: 1px solid transparent;
            cursor: pointer;
        }

        .nav-item:hover {
            color: var(--text-main);
            background: rgba(255, 255, 255, 0.03);
            border-color: rgba(255, 255, 255, 0.05);
        }

        .nav-item.active {
            color: var(--text-main);
            background: rgba(157, 78, 221, 0.15);
            border-color: var(--border-neon-active);
            box-shadow: inset 0 0 10px rgba(157, 78, 221, 0.1);
        }

        .sidebar-footer {
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            padding-top: 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .sync-badge {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11px;
            color: var(--text-muted);
        }

        .sync-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--accent-green);
            box-shadow: 0 0 8px var(--accent-green);
        }

        .sync-btn {
            background: linear-gradient(135deg, rgba(157, 78, 221, 0.2), rgba(0, 240, 255, 0.2));
            border: 1px solid var(--border-neon);
            border-radius: 10px;
            color: var(--text-main);
            padding: 10px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .sync-btn:hover {
            border-color: var(--accent-cyan);
            box-shadow: 0 0 15px rgba(0, 240, 255, 0.25);
        }

        main {
            margin-left: 280px;
            flex-grow: 1;
            padding: 40px;
            max-width: calc(100vw - 280px);
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
        }

        header h2 {
            font-family: 'Outfit', sans-serif;
            font-size: 26px;
            font-weight: 700;
            background: linear-gradient(90deg, #fff, #a7a9be);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        header p {
            color: var(--text-muted);
            font-size: 13px;
            margin-top: 4px;
        }

        .btn-primary {
            background: linear-gradient(135deg, var(--accent-purple), #7b2cbf);
            color: #fff;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(157, 78, 221, 0.3);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 18px rgba(157, 78, 221, 0.5);
        }

        .btn-secondary {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: var(--text-main);
            padding: 10px 20px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.2);
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: var(--bg-glass);
            backdrop-filter: blur(10px);
            border: 1px solid var(--border-neon);
            border-radius: 16px;
            padding: 20px;
            transition: all 0.3s ease;
            cursor: pointer;
        }

        .stat-card:hover {
            border-color: var(--accent-purple);
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(157, 78, 221, 0.15);
        }

        .stat-card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .stat-card-title {
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .stat-card-icon {
            width: 32px;
            height: 32px;
            border-radius: 6px;
            background: rgba(157, 78, 221, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--accent-purple);
        }

        .stat-card-value {
            font-family: 'Outfit', sans-serif;
            font-size: 28px;
            font-weight: 700;
            color: #fff;
        }

        .glass-panel {
            background: var(--bg-glass);
            backdrop-filter: blur(10px);
            border: 1px solid var(--border-neon);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 30px;
        }

        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .panel-title h3 {
            font-family: 'Outfit', sans-serif;
            font-size: 18px;
            font-weight: 600;
        }

        .panel-title p {
            color: var(--text-muted);
            font-size: 12px;
            margin-top: 2px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }

        th {
            padding: 12px 16px;
            font-size: 11px;
            text-transform: uppercase;
            font-weight: 600;
            color: var(--text-muted);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        td {
            padding: 14px 16px;
            font-size: 13px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.03);
            color: var(--text-main);
        }

        tr:hover td {
            background: rgba(255, 255, 255, 0.02);
        }

        .badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .badge-success { background: rgba(0, 255, 135, 0.1); color: var(--accent-green); border: 1px solid rgba(0, 255, 135, 0.2); }
        .badge-warning { background: rgba(255, 189, 89, 0.1); color: var(--accent-amber); border: 1px solid rgba(255, 189, 89, 0.2); }
        .badge-danger { background: rgba(255, 51, 102, 0.1); color: var(--accent-red); border: 1px solid rgba(255, 51, 102, 0.2); }
        .badge-cyan { background: rgba(0, 240, 255, 0.1); color: var(--accent-cyan); border: 1px solid rgba(0, 240, 255, 0.2); }

        .tab-view {
            display: none;
            animation: fadeIn 0.4s ease;
        }

        .tab-view.active {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .topology-container {
            width: 100%;
            height: 400px;
            background: rgba(10, 10, 15, 0.6);
            border-radius: 12px;
            position: relative;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .topo-svg {
            width: 100%;
            height: 100%;
        }

        .link-line {
            stroke-dasharray: 6;
            animation: dash 25s linear infinite;
        }

        @keyframes dash {
            to { stroke-dashoffset: -1000; }
        }

        .node-g { cursor: pointer; }
        .node-circle { transition: all 0.3s ease; }
        .node-g:hover .node-circle { r: 24px; filter: drop-shadow(0 0 10px currentColor); }
        .node-text { font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: 600; fill: #fff; text-anchor: middle; pointer-events: none; }
        .node-subtext { font-size: 9px; fill: var(--text-muted); text-anchor: middle; pointer-events: none; }

        .form-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .form-group label { font-size: 12px; font-weight: 500; color: var(--text-muted); }
        .form-control {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border-neon);
            border-radius: 8px;
            padding: 10px 14px;
            color: #fff;
            font-size: 13px;
            transition: all 0.3s ease;
        }

        .form-control:focus {
            outline: none;
            border-color: var(--accent-cyan);
            box-shadow: 0 0 8px rgba(0, 240, 255, 0.2);
        }

        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(5, 5, 8, 0.8);
            backdrop-filter: blur(6px);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }

        .modal-overlay.active { opacity: 1; pointer-events: auto; }
        .modal-content {
            background: #0f1016;
            border: 1px solid var(--border-neon-active);
            border-radius: 16px;
            width: 100%;
            max-width: 600px;
            padding: 30px;
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.6);
            transform: scale(0.95);
            transition: transform 0.3s ease;
        }

        .modal-overlay.active .modal-content { transform: scale(1); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .modal-header h3 { font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 600; }
        .close-btn { background: transparent; border: none; color: var(--text-muted); font-size: 22px; cursor: pointer; }
        .close-btn:hover { color: #fff; }

        .toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 2000; display: flex; flex-direction: column; gap: 10px; }
        .toast {
            background: rgba(15, 15, 25, 0.95);
            border-left: 4px solid var(--accent-purple);
            border-radius: 6px;
            padding: 12px 20px;
            color: #fff;
            font-size: 13px;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
            transform: translateX(120%);
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .toast.show { transform: translateX(0); }
        .toast-success { border-left-color: var(--accent-green); }
        .toast-warning { border-left-color: var(--accent-amber); }
        .toast-danger { border-left-color: var(--accent-red); }

        .loader-spinner {
            width: 20px;
            height: 20px;
            border: 2.5px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            border-top-color: var(--accent-cyan);
            animation: spin 1s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .chart-bar-container {
            display: flex;
            align-items: flex-end;
            gap: 10px;
            height: 120px;
            padding-top: 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .chart-bar {
            flex-grow: 1;
            background: linear-gradient(to top, var(--accent-purple), var(--accent-cyan));
            border-radius: 4px 4px 0 0;
            position: relative;
            transition: height 0.5s ease;
        }

        .chart-bar-label {
            position: absolute;
            bottom: -20px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 9px;
            color: var(--text-muted);
            white-space: nowrap;
        }
    </style>
</head>
<body>

    <aside>
        <div class="logo-container">
            <div class="logo-icon">Ω</div>
            <div class="logo-text">
                <h1>SDN Controller</h1>
                <span>Native gNMI Platform</span>
            </div>
        </div>

        <nav>
            <a class="nav-item active" data-tab="dashboard">Overview</a>
            <a class="nav-item" data-tab="switches">Switches</a>
            <a class="nav-item" data-tab="endpoints">Discovered Endpoints</a>
            <a class="nav-item" data-tab="ztp">ZTP Discovery</a>
            <a class="nav-item" data-tab="subnets">Subnets & IPAM</a>
            <a class="nav-item" data-tab="enforcer">Policy Enforcer</a>
            <a class="nav-item" data-tab="snapshots">Config Snapshots</a>
            <a class="nav-item" data-tab="compliance">Compliance Checker</a>
            <a class="nav-item" data-tab="telemetry">Telemetry Metrics</a>
            <a class="nav-item" data-tab="topology">Topology Map</a>
        </nav>

        <div style="margin-top: 15px; margin-bottom: 15px; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 15px;">
            <label style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 8px;">Active RBAC Session</label>
            <select id="select-role-session" style="width: 100%; background: #12121e; border: 1px solid var(--border-neon); color: var(--text-main); border-radius: 8px; padding: 8px; font-size: 12px; outline: none; transition: border 0.3s; margin-bottom: 8px;" onchange="changeRoleSession(this.value)">
                <option value="mock-token-admin">Platform Admin</option>
                <option value="mock-token-operator-11111111-1111-1111-1111-11111111111a">Tenant Operator (Acme)</option>
                <option value="mock-token-auditor-11111111-1111-1111-1111-11111111111a">Tenant Auditor (Acme)</option>
                <option value="logged_out">No Active Session</option>
            </select>
            <button onclick="logoutSession()" style="width: 100%; background: rgba(255, 51, 102, 0.1); border: 1px solid rgba(255, 51, 102, 0.3); color: var(--accent-red); padding: 8px; border-radius: 8px; font-size: 12px; cursor: pointer; font-weight: 600; transition: all 0.3s;" onmouseover="this.style.background='rgba(255, 51, 102, 0.25)'" onmouseout="this.style.background='rgba(255, 51, 102, 0.1)'">
                Logout Session
            </button>
        </div>


        <div class="sidebar-footer">
            <div class="sync-badge">
                <span>gNMI Discovery</span>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span id="sync-status-text">Active</span>
                    <div class="sync-dot"></div>
                </div>
            </div>
            <button class="sync-btn" id="btn-sync-netdisco">
                Sync Network
            </button>
        </div>

    </aside>

    <main>
        <div class="toast-container" id="toast-box"></div>

        <!-- 1. DASHBOARD OVERVIEW -->
        <section class="tab-view active" id="view-dashboard">
            <header>
                <div class="header-title">
                    <h2>Fabric Operations</h2>
                    <p>Overview of active tenants, configurations, and discovery pool metrics.</p>
                </div>
                <button class="btn-primary" onclick="switchTab('enforcer')">+ Deploy Policy</button>
            </header>

            <div class="stats-grid">
                <div class="stat-card" onclick="switchTab('switches')">
                    <div class="stat-card-header">
                        <span class="stat-card-title">Switches</span>
                        <div class="stat-card-icon">🖧</div>
                    </div>
                    <div class="stat-card-value" id="stat-switches">-</div>
                </div>
                <div class="stat-card" onclick="switchTab('ztp')">
                    <div class="stat-card-header">
                        <span class="stat-card-title">ZTP Pool</span>
                        <div class="stat-card-icon" style="color:var(--accent-amber)">⚡</div>
                    </div>
                    <div class="stat-card-value" id="stat-ztp">-</div>
                </div>
                <div class="stat-card" onclick="switchTab('subnets')">
                    <div class="stat-card-header">
                        <span class="stat-card-title">Subnets</span>
                        <div class="stat-card-icon" style="color:var(--accent-cyan)">🗺️</div>
                    </div>
                    <div class="stat-card-value" id="stat-subnets">-</div>
                </div>
                <div class="stat-card" onclick="switchTab('endpoints')">
                    <div class="stat-card-header">
                        <span class="stat-card-title">Endpoints</span>
                        <div class="stat-card-icon" style="color:var(--accent-green)">🏢</div>
                    </div>
                    <div class="stat-card-value" id="stat-tenants">-</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 3fr 2fr; gap: 20px;">
                <div class="glass-panel" style="margin-bottom: 0;">
                    <div class="panel-header">
                        <div class="panel-title">
                            <h3>Discovered Fabric Map</h3>
                            <p>Live physical node relationships parsed from LLDP mappings.</p>
                        </div>
                        <button class="btn-secondary" onclick="switchTab('topology')" style="padding: 6px 12px; font-size: 12px;">Fullscreen</button>
                    </div>
                    <div class="topology-container" style="height: 250px;">
                        <svg class="topo-svg" id="dashboard-topo-svg"></svg>
                    </div>
                </div>

                <div class="glass-panel" style="margin-bottom: 0; display: flex; flex-direction: column;">
                    <div class="panel-header">
                        <div class="panel-title">
                            <h3>Quick Discover</h3>
                            <p>Manually trigger LLDP/gNMI Discovery on a specific device IP.</p>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:16px; flex-grow:1; justify-content:center;">
                        <div class="form-group">
                            <label for="quick-discover-ip">Device IP Address</label>
                            <input class="form-control" type="text" id="quick-discover-ip" placeholder="e.g. 172.20.20.11">
                        </div>
                        <button class="btn-primary" id="btn-quick-discover" style="justify-content:center;">
                            Trigger Discover Job
                        </button>
                    </div>
                </div>
            </div>
        </section>

        <!-- 2. SWITCH INVENTORY -->
        <section class="tab-view" id="view-switches">
            <header>
                <div class="header-title">
                    <h2>Switch Inventory</h2>
                    <p>Provisioned switches operating in active fabric topologies.</p>
                </div>
            </header>
            <div class="glass-panel">
                <table id="table-switches">
                    <thead>
                        <tr>
                            <th>Hostname</th>
                            <th>Management IP</th>
                            <th>Vendor</th>
                            <th>Role</th>
                            <th>Local BGP ASN</th>
                            <th>Loopback 0 IP</th>
                            <th>VTEP IP</th>
                            <th>Lifecycle Status</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </section>

        <!-- 3. DISCOVERED ENDPOINTS -->
        <section class="tab-view" id="view-endpoints">
            <header>
                <div class="header-title">
                    <h2>Discovered Endpoints</h2>
                    <p>Dynamic MAC/IP allocations learned from switch forward routing tables.</p>
                </div>
            </header>
            <div class="glass-panel">
                <table id="table-endpoints">
                    <thead>
                        <tr>
                            <th>MAC Address</th>
                            <th>IP Address</th>
                            <th>VLAN ID</th>
                            <th>Switch</th>
                            <th>Port</th>
                            <th>Last Seen</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </section>

        <!-- 4. ZTP DISCOVERY -->
        <section class="tab-view" id="view-ztp">
            <header>
                <div class="header-title">
                    <h2>Zero Touch Provisioning Pool</h2>
                    <p>Bare-metal switches awaiting registration.</p>
                </div>
            </header>
            <div class="glass-panel">
                <table id="table-ztp">
                    <thead>
                        <tr>
                            <th>Serial Number</th>
                            <th>MAC Address</th>
                            <th>Hardware Vendor</th>
                            <th>Hardware Model</th>
                            <th>Current DHCP IP</th>
                            <th>Base OS Version</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </section>

        <!-- 5. SUBNETS & IPAM -->
        <section class="tab-view" id="view-subnets">
            <header>
                <div class="header-title">
                    <h2>Subnets & IPAM</h2>
                    <p>Active multi-tenant IP prefixes allocated within Virtual Routing (VRF) fabrics.</p>
                </div>
            </header>
            <div class="glass-panel">
                <table id="table-subnets">
                    <thead>
                        <tr>
                            <th>Subnet CIDR</th>
                            <th>VLAN ID</th>
                            <th>L2 VNI</th>
                            <th>L3 VNI</th>
                            <th>Anycast Gateway</th>
                            <th>Parent VRF</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </section>

        <!-- 6. POLICY ENFORCER -->
        <section class="tab-view" id="view-enforcer">
            <header>
                <div class="header-title">
                    <h2>Policy Intent Enforcer</h2>
                    <p>Define dynamic tenant network subnets to provision fabric configurations.</p>
                </div>
            </header>
            <div class="glass-panel">
                <form id="enforcer-form" onsubmit="event.preventDefault();">
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="policy-tenant">Tenant ID</label>
                            <select class="form-control" id="policy-tenant"></select>
                        </div>
                        <div class="form-group">
                            <label for="policy-vrf">VRF Name</label>
                            <input class="form-control" type="text" id="policy-vrf" value="VRF-A" required>
                        </div>
                        <div class="form-group">
                            <label for="policy-cidr">Subnet CIDR</label>
                            <input class="form-control" type="text" id="policy-cidr" value="10.0.1.0/24" required>
                        </div>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label for="policy-vlan">VLAN ID</label>
                            <input class="form-control" type="number" id="policy-vlan" value="100" required>
                        </div>
                        <div class="form-group">
                            <label for="policy-l2vni">Layer 2 VNI</label>
                            <input class="form-control" type="number" id="policy-l2vni" value="10001" required>
                        </div>
                        <div class="form-group">
                            <label for="policy-l3vni">Layer 3 VNI</label>
                            <input class="form-control" type="number" id="policy-l3vni" value="5001" required>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 24px;">
                        <label>Target Switches</label>
                        <div id="switches-checkboxes-container" style="display:flex; gap:20px; flex-wrap:wrap; margin-top:6px;"></div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <input type="checkbox" id="policy-dryrun" checked>
                            <label for="policy-dryrun" style="font-size: 13px; color: var(--text-muted);">Dry Run Evaluation</label>
                        </div>
                        <button class="btn-primary" type="button" id="btn-enforce-submit">Execute Intent</button>
                    </div>
                </form>

                <div id="enforce-diff-container" style="display: none; margin-top: 20px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div class="glass-panel" style="background:#09090f; border-color:rgba(255,255,255,0.05);">
                            <h4 style="margin-bottom:10px; font-size:13px; color:var(--accent-cyan);">XML Payload (Dell)</h4>
                            <pre id="diff-dell" style="font-family:monospace; font-size:11px; color:#a7a9be; white-space:pre-wrap;"></pre>
                        </div>
                        <div class="glass-panel" style="background:#09090f; border-color:rgba(255,255,255,0.05);">
                            <h4 style="margin-bottom:10px; font-size:13px; color:var(--accent-purple);">CLI Syntax (Arista)</h4>
                            <pre id="diff-arista" style="font-family:monospace; font-size:11px; color:#a7a9be; white-space:pre-wrap;"></pre>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:15px;">
                        <button class="btn-secondary" onclick="document.getElementById('enforce-diff-container').style.display='none'">Clear</button>
                        <button class="btn-primary" id="btn-diff-commit">Commit Payload</button>
                    </div>
                </div>
            </div>
        </section>

        <!-- 7. CONFIG SNAPSHOTS -->
        <section class="tab-view" id="view-snapshots">
            <header>
                <div class="header-title">
                    <h2>Configuration Snapshots</h2>
                    <p>Append-only immutable configuration backups, rollback engines, and diff analyzers.</p>
                </div>
            </header>

            <div class="glass-panel">
                <div class="panel-header">
                    <div class="panel-title">
                        <h3>Backups Registry</h3>
                        <p>Lists stored snapshots per switch node.</p>
                    </div>
                </div>
                <table id="table-snapshots">
                    <thead>
                        <tr>
                            <th>Taken At</th>
                            <th>Switch Hostname</th>
                            <th>Taken By</th>
                            <th>Config Hash</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </section>

        <!-- 8. COMPLIANCE CHECKER -->
        <section class="tab-view" id="view-compliance">
            <header>
                <div class="header-title">
                    <h2>Golden Compliance Auditor</h2>
                    <p>Validate switch configurations against required templates (AAA, DNS, NTP).</p>
                </div>
                <button class="btn-primary" id="btn-run-compliance">Run Compliance Audit</button>
            </header>

            <div class="glass-panel">
                <div class="panel-header">
                    <div class="panel-title">
                        <h3>Audit Results</h3>
                        <p id="compliance-summary-text">No compliance run recorded yet.</p>
                    </div>
                </div>
                <table id="table-compliance">
                    <thead>
                        <tr>
                            <th>Switch</th>
                            <th>Rule Checked</th>
                            <th>Severity</th>
                            <th>Detail Status</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </section>

        <!-- 9. TELEMETRY METRICS -->
        <section class="tab-view" id="view-telemetry">
            <header>
                <div class="header-title">
                    <h2>Telemetry Metrics</h2>
                    <p>Real-time operational hardware metrics and port bandwidth usage stream.</p>
                </div>
            </header>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;">
                <div class="glass-panel">
                    <h3>Switch CPU Load (%)</h3>
                    <div class="chart-bar-container" id="cpu-chart-container"></div>
                </div>
                <div class="glass-panel">
                    <h3>Temperature Metrics (°C)</h3>
                    <div class="chart-bar-container" id="temp-chart-container"></div>
                </div>
            </div>

            <div class="glass-panel">
                <h3>Live Metrics Stream Log</h3>
                <table id="table-metrics" style="margin-top:15px;">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Switch</th>
                            <th>Metric Variable</th>
                            <th>Value</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </section>

        <!-- 10. TOPOLOGY MAP -->
        <section class="tab-view" id="view-topology">
            <header>
                <div class="header-title">
                    <h2>Live Topology Map</h2>
                    <p>Interactive graph reading active fabric adjacencies from gNMI push events.</p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="font-size:12px; color:var(--text-muted);">Overlay:</label>
                        <select class="form-control" id="topo-overlay-select" style="padding: 6px 12px; font-size:12px;" onchange="updateTopologySettings()">
                            <option value="ALL">All Links</option>
                            <option value="LLDP">Physical (LLDP)</option>
                            <option value="BGP">Logical (BGP EVPN)</option>
                        </select>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="font-size:12px; color:var(--text-muted);">Layout:</label>
                        <select class="form-control" id="topo-layout-select" style="padding: 6px 12px; font-size:12px;" onchange="updateTopologySettings()">
                            <option value="force">Force-Directed Layout</option>
                            <option value="hierarchy">Hierarchical Leaf-Spine</option>
                        </select>
                    </div>
                </div>
            </header>
            <div class="glass-panel" style="position: relative;">
                <div class="topology-container" style="height: 520px; background: rgba(5, 5, 8, 0.7);">
                    <svg class="topo-svg" id="full-topo-svg"></svg>
                </div>
                <div style="position: absolute; bottom: 40px; left: 40px; display: flex; flex-direction: column; gap: 8px; font-size: 11px; background: rgba(10, 10, 15, 0.85); padding: 12px; border-radius: 8px; border: 1px solid var(--border-neon); pointer-events: none; z-index: 10;">
                    <div style="display: flex; align-items: center; gap: 8px;"><div style="width: 12px; height: 12px; border-radius: 50%; background: var(--accent-purple); box-shadow: 0 0 6px var(--accent-purple);"></div><span>Spine Switches</span></div>
                    <div style="display: flex; align-items: center; gap: 8px;"><div style="width: 12px; height: 12px; border-radius: 50%; background: var(--accent-cyan); box-shadow: 0 0 6px var(--accent-cyan);"></div><span>Leaf Switches</span></div>
                    <div style="display: flex; align-items: center; gap: 8px;"><div style="width: 20px; height: 3px; background: rgba(0, 240, 255, 0.75);"></div><span>Physical Links (LLDP)</span></div>
                    <div style="display: flex; align-items: center; gap: 8px;"><div style="width: 20px; height: 3px; border-top: 2px dashed #9d4edd;"></div><span>Logical Peers (BGP EVPN)</span></div>
                </div>
            </div>
        </section>
    </main>

    <!-- PROVISION MODAL -->
    <div class="modal-overlay" id="onboard-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Onboard Switch</h3>
                <button class="close-btn" onclick="toggleModal(false)">&times;</button>
            </div>
            <form id="onboard-form" onsubmit="event.preventDefault();">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Serial Number</label>
                        <input class="form-control" type="text" id="onboard-serial" readonly>
                    </div>
                    <div class="form-group">
                        <label>MAC Address</label>
                        <input class="form-control" type="text" id="onboard-mac" readonly>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Vendor</label>
                        <input class="form-control" type="text" id="onboard-vendor" readonly>
                    </div>
                    <div class="form-group">
                        <label>Model</label>
                        <input class="form-control" type="text" id="onboard-model" readonly>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Hostname</label>
                        <input class="form-control" type="text" id="onboard-hostname" required>
                    </div>
                    <div class="form-group">
                        <label>Management IP</label>
                        <input class="form-control" type="text" id="onboard-mgmt" required>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Role</label>
                        <select class="form-control" id="onboard-role">
                            <option value="leaf">Leaf</option>
                            <option value="spine">Spine</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>BGP ASN</label>
                        <input class="form-control" type="number" id="onboard-asn" value="65001" required>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Loopback 0 IP</label>
                        <input class="form-control" type="text" id="onboard-loopback" required>
                    </div>
                    <div class="form-group">
                        <label>VTEP IP</label>
                        <input class="form-control" type="text" id="onboard-vtep">
                    </div>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                    <button class="btn-secondary" type="button" onclick="toggleModal(false)">Cancel</button>
                    <button class="btn-primary" type="button" id="btn-onboard-submit">Provision</button>
                </div>
            </form>
        </div>
    </div>

    <!-- VIEW CONFIG MODAL -->
    <div class="modal-overlay" id="config-modal">
        <div class="modal-content" style="max-width: 750px;">
            <div class="modal-header">
                <h3 id="config-modal-title">View Configuration</h3>
                <button class="close-btn" onclick="toggleConfigModal(false)">&times;</button>
            </div>
            <pre id="config-modal-body" style="background:#09090f; padding:15px; border-radius:8px; overflow-x:auto; font-family:monospace; font-size:12px; max-height:400px; color:#a7a9be; border:1px solid var(--border-neon);"></pre>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                <button class="btn-secondary" onclick="toggleConfigModal(false)">Close</button>
                <button class="btn-primary" id="btn-modal-rollback" style="background:var(--accent-red); box-shadow:none;">Rollback to Snapshot</button>
            </div>
        </div>
    </div>

    <script>
        // Setup global fetch interceptor to append authorization token
        const originalFetch = window.fetch;
        window.fetch = function(url, options) {
            options = options || {};
            options.headers = options.headers || {};
            let token = localStorage.getItem("sdn_token");
            if (token === null) {
                token = "mock-token-admin";
                localStorage.setItem("sdn_token", token);
            }
            if (token && token !== "logged_out" && !options.headers['Authorization']) {
                options.headers['Authorization'] = 'Bearer ' + token;
            }
            return originalFetch(url, options);
        };

        function changeRoleSession(token) {
            localStorage.setItem("sdn_token", token);
            showToast("Session role updated!", "success");
            // Refresh stats
            fetchDashboardStats();
            // Refresh current active tab
            const activeItem = document.querySelector('.nav-item.active');
            if (activeItem) {
                const target = activeItem.getAttribute('data-tab');
                switchTab(target);
            }
        }

        function logoutSession() {
            localStorage.setItem("sdn_token", "logged_out");
            showToast("Logged out successfully!", "warning");
            document.getElementById('select-role-session').value = "logged_out";
            // Refresh stats
            fetchDashboardStats();
            // Refresh current active tab
            const activeItem = document.querySelector('.nav-item.active');
            if (activeItem) {
                const target = activeItem.getAttribute('data-tab');
                switchTab(target);
            }
        }

        let currentOpenSnapshotId = null;

        // Routing
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const target = item.getAttribute('data-tab');
                switchTab(target);
            });
        });

        function switchTab(tabId) {
            document.querySelectorAll('.nav-item').forEach(item => {
                if (item.getAttribute('data-tab') === tabId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            document.querySelectorAll('.tab-view').forEach(view => {
                view.classList.remove('active');
            });

            const targetView = document.getElementById('view-' + tabId);
            if (targetView) {
                targetView.classList.add('active');
            }

            if (tabId === 'topology') {
                loadTopologyGraph('full-topo-svg');
            } else if (tabId === 'dashboard') {
                loadTopologyGraph('dashboard-topo-svg');
                fetchDashboardStats();
            } else if (tabId === 'switches') {
                loadSwitchesTable();
            } else if (tabId === 'endpoints') {
                loadEndpointsTable();
            } else if (tabId === 'ztp') {
                loadZtpTable();
            } else if (tabId === 'subnets') {
                loadSubnetsTable();
            } else if (tabId === 'enforcer') {
                loadEnforcerFormInfo();
            } else if (tabId === 'snapshots') {
                loadSnapshotsTable();
            } else if (tabId === 'compliance') {
                loadComplianceResults();
            } else if (tabId === 'telemetry') {
                loadTelemetryData();
            }
        }

        // Toasts
        function showToast(message, type = 'success') {
            const container = document.getElementById('toast-box');
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerText = message;
            container.appendChild(toast);
            setTimeout(() => { toast.classList.add('show'); }, 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => { toast.remove(); }, 300);
            }, 3500);
        }

        // Modals
        function toggleModal(show, device = null) {
            const modal = document.getElementById('onboard-modal');
            if (show && device) {
                modal.classList.add('active');
                document.getElementById('onboard-serial').value = device.serial_number;
                document.getElementById('onboard-mac').value = device.mac_address;
                document.getElementById('onboard-vendor').value = device.hardware_vendor;
                document.getElementById('onboard-model').value = device.hardware_model;
                document.getElementById('onboard-hostname').value = `SW-LEAF-${device.serial_number.slice(-3)}`;
                document.getElementById('onboard-mgmt').value = device.current_dhcp_ip;
            } else {
                modal.classList.remove('active');
            }
        }

        function toggleConfigModal(show, snapshot = null) {
            const modal = document.getElementById('config-modal');
            if (show && snapshot) {
                currentOpenSnapshotId = snapshot.snapshot_id;
                modal.classList.add('active');
                document.getElementById('config-modal-title').innerText = `Configuration Snapshot - ${snapshot.switch_hostname}`;
                document.getElementById('config-modal-body').innerText = snapshot.raw_config;
            } else {
                modal.classList.remove('active');
                currentOpenSnapshotId = null;
            }
        }

        // API Requests
        async function fetchDashboardStats() {
            try {
                const res = await fetch('/api/v5/admin/stats');
                if (res.status !== 200) {
                    document.getElementById('stat-switches').innerText = "N/A";
                    document.getElementById('stat-ztp').innerText = "N/A";
                    document.getElementById('stat-subnets').innerText = "N/A";
                    document.getElementById('stat-tenants').innerText = "N/A";
                    return;
                }
                const data = await res.json();
                document.getElementById('stat-switches').innerText = data.switches_count;
                document.getElementById('stat-ztp').innerText = data.ztp_pool_count;
                document.getElementById('stat-subnets').innerText = data.subnets_count;
                document.getElementById('stat-tenants').innerText = data.tenants_count;
            } catch (err) {
                showToast("Failed to fetch dashboard stats", "danger");
            }
        }

        async function loadSwitchesTable() {
            const tbody = document.querySelector('#table-switches tbody');
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading...</td></tr>';
            try {
                const res = await fetch('/api/v5/admin/switches');
                if (res.status !== 200) {
                    const errData = await res.json();
                    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--accent-red);">${errData.detail || 'Access Denied'}</td></tr>`;
                    return;
                }
                const switches = await res.json();
                tbody.innerHTML = '';
                switches.forEach(s => {
                    const row = document.createElement('tr');
                    let statusClass = s.lifecycle_status === 'compliant_active' ? 'badge-success' : 'badge-warning';
                    row.innerHTML = `
                        <td><strong>${s.hostname}</strong></td>
                        <td>${s.management_ip}</td>
                        <td><span class="badge badge-cyan">${s.vendor}</span></td>
                        <td>${s.role}</td>
                        <td>${s.local_bgp_asn}</td>
                        <td>${s.loopback_0_ip}</td>
                        <td>${s.vtep_ip || 'N/A'}</td>
                        <td><span class="badge ${statusClass}">${s.lifecycle_status}</span></td>
                    `;
                    tbody.appendChild(row);
                });
            } catch (err) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--accent-red);">Load failed</td></tr>';
            }
        }

        async function loadEndpointsTable() {
            const tbody = document.querySelector('#table-endpoints tbody');
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';
            try {
                const res = await fetch('/api/v5/visibility/endpoints');
                if (res.status !== 200) {
                    const errData = await res.json();
                    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--accent-red);">${errData.detail || 'Access Denied'}</td></tr>`;
                    return;
                }
                const data = await res.json();
                tbody.innerHTML = '';
                if (data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No discovered endpoints</td></tr>';
                    return;
                }
                data.forEach(ep => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td><strong>${ep.mac_address}</strong></td>
                        <td>${ep.ip_address || 'N/A'}</td>
                        <td><span class="badge badge-cyan">Vlan ${ep.vlan_id}</span></td>
                        <td>${ep.switch_hostname}</td>
                        <td>${ep.port}</td>
                        <td>${new Date(ep.last_seen).toLocaleTimeString()}</td>
                    `;
                    tbody.appendChild(row);
                });
            } catch (err) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--accent-red);">Load failed</td></tr>';
            }
        }

        async function loadZtpTable() {
            const tbody = document.querySelector('#table-ztp tbody');
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';
            try {
                const res = await fetch('/api/v5/admin/ztp-pool');
                if (res.status !== 200) {
                    const errData = await res.json();
                    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--accent-red);">${errData.detail || 'Access Denied'}</td></tr>`;
                    return;
                }
                const ztpList = await res.json();
                tbody.innerHTML = '';
                if (ztpList.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">ZTP pool is empty</td></tr>';
                    return;
                }
                ztpList.forEach(dev => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td><strong>${dev.serial_number}</strong></td>
                        <td>${dev.mac_address}</td>
                        <td><span class="badge badge-cyan">${dev.hardware_vendor}</span></td>
                        <td>${dev.hardware_model}</td>
                        <td>${dev.current_dhcp_ip}</td>
                        <td>${dev.base_os_version}</td>
                        <td>
                            <button class="btn-primary" style="padding:4px 8px; font-size:11px;" onclick='toggleModal(true, ${JSON.stringify(dev)})'>Onboard</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            } catch (err) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--accent-red);">Load failed</td></tr>';
            }
        }

        async function loadSubnetsTable() {
            const tbody = document.querySelector('#table-subnets tbody');
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';
            try {
                const res = await fetch('/api/v5/admin/subnets');
                if (res.status !== 200) {
                    const errData = await res.json();
                    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--accent-red);">${errData.detail || 'Access Denied'}</td></tr>`;
                    return;
                }
                const subnets = await res.json();
                tbody.innerHTML = '';
                if (subnets.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No active subnets</td></tr>';
                    return;
                }
                subnets.forEach(sub => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td><strong>${sub.subnet_cidr}</strong></td>
                        <td>${sub.vlan_id}</td>
                        <td>${sub.layer2_vni}</td>
                        <td>${sub.layer3_vni}</td>
                        <td>${sub.anycast_gateway_ip}</td>
                        <td><span class="badge badge-cyan">${sub.vrf_name}</span></td>
                        <td>
                            <button class="btn-secondary" style="padding:4px 8px; font-size:11px; border-color:var(--accent-red); color:var(--accent-red);" onclick="deallocateSubnet('${sub.tenant_id}', '${sub.vrf_name}', '${sub.subnet_cidr}')">Deallocate</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            } catch (err) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--accent-red);">Load failed</td></tr>';
            }
        }

        async function loadEnforcerFormInfo() {
            const tenantSelect = document.getElementById('policy-tenant');
            tenantSelect.innerHTML = '<option>Loading...</option>';
            try {
                const res = await fetch('/api/v5/admin/tenants');
                const tenants = await res.json();
                tenantSelect.innerHTML = '';
                tenants.forEach(t => {
                    tenantSelect.innerHTML += `<option value="${t.tenant_id}">${t.tenant_name}</option>`;
                });
            } catch (err) {
                tenantSelect.innerHTML = '<option>Error loading tenants</option>';
            }

            const swContainer = document.getElementById('switches-checkboxes-container');
            swContainer.innerHTML = 'Loading switches...';
            try {
                const res = await fetch('/api/v5/admin/switches');
                const switches = await res.json();
                swContainer.innerHTML = '';
                switches.forEach(sw => {
                    swContainer.innerHTML += `
                        <label style="display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" name="target_switches" value="${sw.hostname}" checked>
                            <span>${sw.hostname}</span>
                        </label>
                    `;
                });
            } catch (err) {
                swContainer.innerHTML = 'Error loading switches';
            }
        }

        document.getElementById('btn-enforce-submit').addEventListener('click', async () => {
            const payload = {
                tenant_id: document.getElementById('policy-tenant').value,
                vrf_name: document.getElementById('policy-vrf').value,
                requested_cidr: document.getElementById('policy-cidr').value,
                vlan_id: parseInt(document.getElementById('policy-vlan').value),
                l2_vni: parseInt(document.getElementById('policy-l2vni').value),
                l3_vni: parseInt(document.getElementById('policy-l3vni').value),
                target_switch_serials: Array.from(document.querySelectorAll('input[name="target_switches"]:checked')).map(cb => cb.value),
                dry_run: document.getElementById('policy-dryrun').checked
            };

            const btn = document.getElementById('btn-enforce-submit');
            btn.innerHTML = '<div class="loader-spinner"></div>';
            btn.disabled = true;

            try {
                const res = await fetch('/api/v5/orchestrator/policy-enforcement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer mock-token-admin' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.status === 202) {
                    showToast(payload.dry_run ? "Dry-run successful! Payload generated." : "Intent successfully committed!", "success");
                    if (payload.dry_run && data.diff_matrix) {
                        document.getElementById('enforce-diff-container').style.display = 'block';
                        let dell = "", arista = "";
                        data.diff_matrix.forEach(diff => {
                            if (diff.vendor === 'dell_os10') dell += `${diff.generated_payload}\n`;
                            else arista += `${diff.generated_payload}\n`;
                        });
                        document.getElementById('diff-dell').innerText = dell || "No Dell configurations generated.";
                        document.getElementById('diff-arista').innerText = arista || "No Arista configurations generated.";
                    } else {
                        document.getElementById('enforce-diff-container').style.display = 'none';
                    }
                } else {
                    showToast(data.detail || "Error committing intent", "danger");
                }
            } catch (err) {
                showToast("Request failed", "danger");
            } finally {
                btn.innerText = "Execute Intent";
                btn.disabled = false;
            }
        });

        document.getElementById('btn-diff-commit').addEventListener('click', () => {
            document.getElementById('policy-dryrun').checked = false;
            document.getElementById('btn-enforce-submit').click();
        });

        async function deallocateSubnet(tenant_id, vrf_name, subnet_cidr) {
            if (!confirm(`Confirm deallocation of subnet ${subnet_cidr}?`)) return;
            try {
                const res = await fetch('/api/v5/orchestrator/policy-reconciliation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer mock-token-admin' },
                    body: JSON.stringify({ tenant_id, vrf_name, subnet_cidr })
                });
                if (res.status === 200) {
                    showToast("Subnet deallocated and configuration rollback generated!", "success");
                    loadSubnetsTable();
                } else {
                    showToast("Failed to deallocate subnet", "danger");
                }
            } catch (err) {
                showToast("Deallocate request failed", "danger");
            }
        }

        async function loadSnapshotsTable() {
            const tbody = document.querySelector('#table-snapshots tbody');
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';
            try {
                const res = await fetch('/api/v5/visibility/snapshots');
                if (res.status !== 200) {
                    const errData = await res.json();
                    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--accent-red);">${errData.detail || 'Access Denied'}</td></tr>`;
                    return;
                }
                const snaps = await res.json();
                tbody.innerHTML = '';
                if (snaps.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No snapshots stored</td></tr>';
                    return;
                }
                snaps.forEach(snap => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${new Date(snap.taken_at).toLocaleString()}</td>
                        <td><strong>${snap.switch_hostname}</strong></td>
                        <td>${snap.taken_by}</td>
                        <td><code style="color:var(--accent-cyan); font-size:11px;">${snap.config_hash.slice(0, 16)}...</code></td>
                        <td>
                            <button class="btn-primary" style="padding:4px 8px; font-size:11px;" onclick='toggleConfigModal(true, ${JSON.stringify(snap)})'>Analyze</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            } catch (err) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--accent-red);">Load failed</td></tr>';
            }
        }

        document.getElementById('btn-modal-rollback').addEventListener('click', async () => {
            if (!currentOpenSnapshotId) return;
            if (!confirm("Restoring this snapshot will rollback configuration. Continue?")) return;
            
            try {
                const res = await fetch('/api/v5/visibility/rollback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer mock-token-admin' },
                    body: JSON.stringify({ snapshot_id: currentOpenSnapshotId, dry_run: false })
                });
                const data = await res.json();
                if (res.status === 200) {
                    showToast("Rollback configuration applied successfully!", "success");
                    toggleConfigModal(false);
                    switchTab('snapshots');
                } else {
                    showToast(data.detail || "Rollback failed", "danger");
                }
            } catch (err) {
                showToast("Connection to rollback endpoint failed", "danger");
            }
        });

        async function loadComplianceResults() {
            const tbody = document.querySelector('#table-compliance tbody');
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';
            try {
                const res = await fetch('/api/v5/visibility/compliance/latest');
                if (res.status !== 200) {
                    const errData = await res.json();
                    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--accent-red);">${errData.detail || 'Access Denied'}</td></tr>`;
                    document.getElementById('compliance-summary-text').innerText = "Load failed.";
                    return;
                }
                const data = await res.json();
                tbody.innerHTML = '';
                if (data.status === 'NO_RUNS_EVALUATED') {
                    document.getElementById('compliance-summary-text').innerText = "No audits have been executed.";
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Please run compliance audit</td></tr>';
                    return;
                }
                
                document.getElementById('compliance-summary-text').innerText = `Latest audit run at ${new Date(data.started_at).toLocaleTimeString()}. Compliance Score: ${data.summary.compliance_score_pct}% (${data.summary.passed_checks}/${data.summary.total_checks} checks passed).`;
                
                if (data.findings.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--accent-green);">✓ All switches compliant! No issues found.</td></tr>';
                    return;
                }
                
                data.findings.forEach(f => {
                    const row = document.createElement('tr');
                    let badge = 'badge-success';
                    if (f.severity === 'warning') badge = 'badge-warning';
                    else if (f.severity === 'critical') badge = 'badge-danger';
                    
                    row.innerHTML = `
                        <td><strong>${f.switch_hostname}</strong></td>
                        <td>${f.rule_name}</td>
                        <td><span class="badge ${badge}">${f.severity}</span></td>
                        <td>${f.detail}</td>
                    `;
                    tbody.appendChild(row);
                });
            } catch (err) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--accent-red);">Load failed</td></tr>';
            }
        }

        document.getElementById('btn-run-compliance').addEventListener('click', async () => {
            const btn = document.getElementById('btn-run-compliance');
            btn.innerText = "Auditing...";
            btn.disabled = true;
            try {
                const res = await fetch('/api/v5/visibility/compliance/run', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer mock-token-admin' }
                });
                if (res.status === 200) {
                    showToast("Compliance run completed successfully!", "success");
                    loadComplianceResults();
                } else {
                    showToast("Failed to run compliance check", "danger");
                }
            } catch (err) {
                showToast("Request failed", "danger");
            } finally {
                btn.innerText = "Run Compliance Audit";
                btn.disabled = false;
            }
        });

        async function loadTelemetryData() {
            const tbody = document.querySelector('#table-metrics tbody');
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';
            try {
                const res = await fetch('/api/v5/visibility/telemetry');
                if (res.status !== 200) {
                    const errData = await res.json();
                    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--accent-red);">${errData.detail || 'Access Denied'}</td></tr>`;
                    return;
                }
                const data = await res.json();
                tbody.innerHTML = '';
                if (data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No metrics collected yet.</td></tr>';
                    return;
                }
                
                // Draw CPU & Temp charts
                const cpuCont = document.getElementById('cpu-chart-container');
                const tempCont = document.getElementById('temp-chart-container');
                cpuCont.innerHTML = '';
                tempCont.innerHTML = '';
                
                const cpus = data.filter(m => m.metric_name === 'system.cpu_utilization').slice(0, 5);
                const temps = data.filter(m => m.metric_name === 'system.temperature').slice(0, 5);
                
                cpus.forEach(m => {
                    const pct = Math.min(100, parseFloat(m.metric_value));
                    const bar = document.createElement('div');
                    bar.className = 'chart-bar';
                    bar.style.height = `${pct}%`;
                    bar.innerHTML = `<span class="chart-bar-label">${m.switch_hostname} (${pct}%)</span>`;
                    cpuCont.appendChild(bar);
                });
                
                temps.forEach(m => {
                    const temp = parseFloat(m.metric_value);
                    const pct = Math.min(100, (temp / 80) * 100);
                    const bar = document.createElement('div');
                    bar.className = 'chart-bar';
                    bar.style.height = `${pct}%`;
                    bar.style.background = 'linear-gradient(to top, var(--accent-amber), var(--accent-red))';
                    bar.innerHTML = `<span class="chart-bar-label">${m.switch_hostname} (${temp}°C)</span>`;
                    tempCont.appendChild(bar);
                });
                
                // Load metrics table
                data.slice(0, 30).forEach(m => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${new Date(m.timestamp).toLocaleTimeString()}</td>
                        <td><strong>${m.switch_hostname}</strong></td>
                        <td><code>${m.metric_name}</code></td>
                        <td>${m.metric_value}</td>
                    `;
                    tbody.appendChild(row);
                });
            } catch (err) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--accent-red);">Load failed</td></tr>';
            }
        }

        // Quick Discover
        document.getElementById('btn-quick-discover').addEventListener('click', async () => {
            const ip = document.getElementById('quick-discover-ip').value;
            if (!ip) { showToast("Please input IP", "warning"); return; }
            const btn = document.getElementById('btn-quick-discover');
            btn.innerHTML = '<div class="loader-spinner"></div>';
            btn.disabled = true;
            try {
                const res = await fetch('/api/v5/admin/trigger-discover', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip })
                });
                if (res.status === 200) {
                    showToast("Discovery trigger successfully enqueued!", "success");
                    fetchDashboardStats();
                } else {
                    showToast("Discovery trigger failed", "danger");
                }
            } catch (err) {
                showToast("Request error", "danger");
            } finally {
                btn.innerText = "Trigger Discover Job";
                btn.disabled = false;
            }
        });

        // Sync Network
        document.getElementById('btn-sync-netdisco').addEventListener('click', async () => {
            const btn = document.getElementById('btn-sync-netdisco');
            btn.innerText = "Syncing...";
            btn.disabled = true;
            try {
                const res = await fetch('/api/v5/admin/sync-gnmi', { method: 'POST' });
                if (res.status === 200) {
                    showToast("Fabric discovery completed successfully!", "success");
                    fetchDashboardStats();
                } else {
                    showToast("Sync failed", "danger");
                }
            } catch (err) {
                showToast("Sync connection error", "danger");
            } finally {
                btn.innerText = "Sync Network";
                btn.disabled = false;
            }
        });

        // Onboard provision submit
        document.getElementById('btn-onboard-submit').addEventListener('click', async () => {
            const payload = {
                serial_number: document.getElementById('onboard-serial').value,
                mac_address: document.getElementById('onboard-mac').value,
                hardware_vendor: document.getElementById('onboard-vendor').value,
                hardware_model: document.getElementById('onboard-model').value,
                base_os_version: 'SRLinux'
            };
            try {
                const res = await fetch('/api/v5/discovery/on-boarding-ingestion', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.status === 202) {
                    showToast("Switch registered to fabric!", "success");
                    toggleModal(false);
                    loadZtpTable();
                    fetchDashboardStats();
                } else {
                    showToast("Failed to onboard switch", "danger");
                }
            } catch (err) {
                showToast("Request error", "danger");
            }
        });

        // Global variables to store configuration settings for the D3 topology
        let topoLayoutType = 'force'; // 'force' or 'hierarchy'
        let topoOverlayProtocol = 'ALL'; // 'ALL', 'LLDP', or 'BGP'
        let lastLoadedSvgId = 'dashboard-topo-svg';

        function updateTopologySettings() {
            topoOverlayProtocol = document.getElementById('topo-overlay-select')?.value || 'ALL';
            topoLayoutType = document.getElementById('topo-layout-select')?.value || 'force';
            loadTopologyGraph('full-topo-svg');
        }

        // Load Topology Graph with D3.js (NacTrack-like interactive layout)
        async function loadTopologyGraph(svgId) {
            lastLoadedSvgId = svgId;
            const svgSelection = d3.select('#' + svgId);
            svgSelection.selectAll("*").remove(); // Clear previous rendering
            
            const svgNode = svgSelection.node();
            const width = svgNode.getBoundingClientRect().width || 800;
            const height = svgNode.getBoundingClientRect().height || 480;

            // Render loader text in SVG
            const loaderText = svgSelection.append("text")
                .attr("x", "50%")
                .attr("y", "50%")
                .attr("fill", "var(--text-muted)")
                .attr("text-anchor", "middle")
                .attr("font-size", "14px")
                .text("Streaming live topology data...");

            try {
                const [swRes, topoRes] = await Promise.all([
                    fetch('/api/v5/admin/switches'),
                    fetch('/api/v5/admin/topology')
                ]);
                
                if (swRes.status !== 200 || topoRes.status !== 200) {
                    loaderText.attr("fill", "var(--accent-red)").text("Access Denied: Check authorization role.");
                    return;
                }

                const switches = await swRes.json();
                const rawLinks = await topoRes.json();
                loaderText.remove();

                if (switches.length === 0) {
                    svgSelection.append("text")
                        .attr("x", "50%")
                        .attr("y", "50%")
                        .attr("fill", "var(--accent-amber)")
                        .attr("text-anchor", "middle")
                        .text("No active switch elements in registry.");
                    return;
                }

                // Node definitions
                const nodes = switches.map(s => ({
                    id: s.management_ip,
                    name: s.hostname,
                    ip: s.management_ip,
                    role: s.role,
                    vendor: s.vendor,
                    status: s.lifecycle_status
                }));

                const nodeMap = new Map(nodes.map(n => [n.id, n]));

                // Link definitions
                const links = [];
                rawLinks.forEach(link => {
                    const src = link.ip;
                    const dst = link.remote_ip;
                    if (nodeMap.has(src) && nodeMap.has(dst)) {
                        // Apply filter settings based on the current overlay selection
                        const linkProto = link.protocol || 'LLDP';
                        if (topoOverlayProtocol !== 'ALL' && topoOverlayProtocol !== linkProto) {
                            return;
                        }

                        const key = [src, dst, linkProto].sort().join('-');
                        if (!links.some(l => l.key === key)) {
                            links.push({
                                source: src,
                                target: dst,
                                key,
                                srcPort: link.port,
                                dstPort: link.remote_port,
                                protocol: linkProto,
                                state: link.state || 'up'
                            });
                        }
                    }
                });

                // Establish base container for Zoom and Pan
                const zoomGroup = svgSelection.append("g").attr("class", "zoom-container-g");
                
                const zoomBehavior = d3.zoom()
                    .scaleExtent([0.2, 4])
                    .on("zoom", (event) => {
                        zoomGroup.attr("transform", event.transform);
                    });
                
                svgSelection.call(zoomBehavior);

                // Set default layout positions for hierarchical layout
                const spines = nodes.filter(n => n.role === 'spine');
                const leafs = nodes.filter(n => n.role === 'leaf');

                nodes.forEach(n => {
                    if (n.role === 'spine') {
                        const idx = spines.indexOf(n);
                        n.hierarchyX = spines.length > 1 ? 150 + idx * (width - 300) / (spines.length - 1) : width / 2;
                        n.hierarchyY = height * 0.2;
                    } else {
                        const idx = leafs.indexOf(n);
                        n.hierarchyX = leafs.length > 1 ? 100 + idx * (width - 200) / (leafs.length - 1) : width / 2;
                        n.hierarchyY = height * 0.75;
                    }
                });

                // Layout implementation (Force-directed vs Hierarchical)
                let simulation = null;
                const isForce = topoLayoutType === 'force' || svgId === 'dashboard-topo-svg';
                if (isForce) {
                    // Initialize D3 Force Simulation
                    simulation = d3.forceSimulation(nodes)
                        .force("link", d3.forceLink(links).id(d => d.id).distance(180))
                        .force("charge", d3.forceManyBody().strength(-400))
                        .force("center", d3.forceCenter(width / 2, height / 2))
                        .force("collision", d3.forceCollide().radius(60));
                } else {
                    // Lock nodes to fixed Leaf-Spine hierarchy positions
                    nodes.forEach(n => {
                        n.x = n.hierarchyX;
                        n.y = n.hierarchyY;
                    });
                }

                // Render link lines
                const linkElements = zoomGroup.append("g")
                    .attr("class", "links-g")
                    .selectAll("line")
                    .data(links)
                    .enter().append("line")
                    .attr("stroke", d => d.protocol === 'BGP' ? '#9d4edd' : 'rgba(0, 240, 255, 0.55)')
                    .attr("stroke-width", d => d.protocol === 'BGP' ? '2' : '2.5')
                    .attr("stroke-dasharray", d => d.protocol === 'BGP' ? '5,5' : 'none')
                    .attr("opacity", d => d.state === 'down' ? '0.2' : '1')
                    .style("cursor", "pointer")
                    .on("mouseover", function(event, d) {
                        d3.select(this).attr("stroke-width", d.protocol === 'BGP' ? '4' : '4.5');
                    })
                    .on("mouseout", function(event, d) {
                        d3.select(this).attr("stroke-width", d.protocol === 'BGP' ? '2' : '2.5');
                    });

                // Render link port labels (midpoints)
                const linkLabels = zoomGroup.append("g")
                    .attr("class", "link-labels-g")
                    .selectAll("g")
                    .data(links)
                    .enter().append("g")
                    .attr("pointer-events", "none");

                linkLabels.append("rect")
                    .attr("fill", "rgba(9, 9, 15, 0.85)")
                    .attr("rx", 3)
                    .attr("ry", 3);

                linkLabels.append("text")
                    .attr("fill", "rgba(255, 255, 255, 0.75)")
                    .attr("font-size", "8px")
                    .attr("font-weight", "500")
                    .attr("text-anchor", "middle")
                    .text(d => d.protocol === 'BGP' ? `BGP Session` : `${d.srcPort} ⬌ ${d.dstPort}`);

                // Render nodes
                const nodeElements = zoomGroup.append("g")
                    .attr("class", "nodes-g")
                    .selectAll("g")
                    .data(nodes)
                    .enter().append("g")
                    .style("cursor", "pointer")
                    .call(isForce ? d3.drag()
                        .on("start", dragstarted)
                        .on("drag", dragged)
                        .on("end", dragended) : () => {});

                // Draw node outer glow & circle
                nodeElements.append("circle")
                    .attr("r", 20)
                    .attr("fill", "#10111a")
                    .attr("stroke", d => d.role === 'spine' ? 'var(--accent-purple)' : 'var(--accent-cyan)')
                    .attr("stroke-width", "2.5")
                    .attr("class", "node-circle")
                    .style("filter", d => d.status === 'compliant_active' ? 'drop-shadow(0 0 4px rgba(0, 255, 135, 0.15))' : 'none');

                // Draw central icon character inside the node
                nodeElements.append("text")
                    .attr("text-anchor", "middle")
                    .attr("dy", ".3em")
                    .attr("fill", d => d.role === 'spine' ? 'var(--accent-purple)' : 'var(--accent-cyan)')
                    .attr("font-size", "12px")
                    .attr("font-weight", "700")
                    .text(d => d.role === 'spine' ? 'S' : 'L');

                // Draw Hostname label below node
                nodeElements.append("text")
                    .attr("y", 32)
                    .attr("class", "node-text")
                    .attr("text-anchor", "middle")
                    .text(d => d.name);

                // Draw IP address sub-label
                nodeElements.append("text")
                    .attr("y", 44)
                    .attr("class", "node-subtext")
                    .attr("text-anchor", "middle")
                    .text(d => d.ip);

                // Setup layout tick handler for D3 Force simulation
                if (isForce) {
                    simulation.on("tick", () => {
                        linkElements
                            .attr("x1", d => d.source.x)
                            .attr("y1", d => d.source.y)
                            .attr("x2", d => d.target.x)
                            .attr("y2", d => d.target.y);

                        nodeElements.attr("transform", d => `translate(${d.x},${d.y})`);

                        linkLabels.attr("transform", d => {
                            const x = (d.source.x + d.target.x) / 2;
                            const y = (d.source.y + d.target.y) / 2;
                            return `translate(${x},${y})`;
                        });

                        // Position background box behind port label text
                        linkLabels.selectAll("text").each(function(d) {
                            const bbox = this.getBBox();
                            const rect = d3.select(this.parentNode).select("rect");
                            rect.attr("x", bbox.x - 4)
                                .attr("y", bbox.y - 2)
                                .attr("width", bbox.width + 8)
                                .attr("height", bbox.height + 4);
                        });
                    });
                } else {
                    // Update static positions immediately
                    linkElements
                        .attr("x1", d => nodeMap.get(d.source).x)
                        .attr("y1", d => nodeMap.get(d.source).y)
                        .attr("x2", d => nodeMap.get(d.target).x)
                        .attr("y2", d => nodeMap.get(d.target).y);

                    nodeElements.attr("transform", d => `translate(${d.x},${d.y})`);

                    linkLabels.attr("transform", d => {
                        const src = nodeMap.get(d.source);
                        const dst = nodeMap.get(d.target);
                        const x = (src.x + dst.x) / 2;
                        const y = (src.y + dst.y) / 2;
                        return `translate(${x},${y})`;
                    });

                    // Position background boxes
                    linkLabels.selectAll("text").each(function(d) {
                        const bbox = this.getBBox();
                        const rect = d3.select(this.parentNode).select("rect");
                        rect.attr("x", bbox.x - 4)
                            .attr("y", bbox.y - 2)
                            .attr("width", bbox.width + 8)
                            .attr("height", bbox.height + 4);
                    });
                }

                // Force Simulation drag event callbacks
                function dragstarted(event, d) {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                }

                function dragged(event, d) {
                    d.fx = event.x;
                    d.fy = event.y;
                }

                function dragended(event, d) {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }

            } catch (err) {
                console.error(err);
                svgSelection.append("text")
                    .attr("x", "50%")
                    .attr("y", "50%")
                    .attr("fill", "var(--accent-red)")
                    .attr("text-anchor", "middle")
                    .text("An error occurred during topology data rendering.");
            }
        }

        // Init
        const savedToken = localStorage.getItem("sdn_token") || "mock-token-admin";
        document.getElementById('select-role-session').value = savedToken;
        fetchDashboardStats();
        loadTopologyGraph('dashboard-topo-svg');
    </script>
</body>
</html>
"""

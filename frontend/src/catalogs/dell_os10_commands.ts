import type { DellOS10Catalog } from '../types/config-push-types';

export const DELL_OS10_CATALOG: DellOS10Catalog = {
  categories: [
    { id: 'interface', label: 'Interface', icon: 'ethernet', templates: [
      'interface-ethernet', 'interface-loopback', 'interface-port-channel', 'interface-mgmt'
    ]},
    { id: 'vlan', label: 'VLAN', icon: 'layout', templates: [
      'vlan-create', 'vlan-name', 'vlan-tagged', 'vlan-untagged'
    ]},
    { id: 'system', label: 'System', icon: 'settings', templates: [
      'system-hostname', 'system-ntp', 'system-dns', 'system-syslog', 'system-snmp', 'system-banner'
    ]},
    { id: 'aaa', label: 'AAA', icon: 'shield', templates: [
      'aaa-username', 'aaa-enable', 'aaa-authentication', 'aaa-ssh'
    ]},
    { id: 'vrf', label: 'VRF', icon: 'git-branch', templates: [
      'vrf-create', 'vrf-interface', 'vrf-evpn'
    ]},
    { id: 'bgp', label: 'BGP', icon: 'globe', templates: [
      'bgp-router', 'bgp-neighbor', 'bgp-network', 'bgp-address-family'
    ]},
    { id: 'static_route', label: 'Static Route', icon: 'arrow-right', templates: [
      'ip-route', 'ip-default-route'
    ]},
    { id: 'lag', label: 'LAG', icon: 'columns', templates: [
      'lag-port-channel', 'lag-lacp-config'
    ]},
    { id: 'stp', label: 'STP', icon: 'shield-off', templates: [
      'stp-mode', 'stp-port-edge', 'stp-bpduguard'
    ]},
    { id: 'qos', label: 'QoS & ACL', icon: 'filter', templates: [
      'ip-access-list', 'prefix-list', 'qos-class-map', 'qos-policy-map'
    ]},
  ],
  templates: {
    // ==================== INTERFACE ====================
    'interface-ethernet': {
      id: 'interface-ethernet',
      label: 'Ethernet Interface',
      category: 'interface',
      modes: ['global'],
      generates: [
        { line: 'interface {port}', args: [{ name: 'port', label: 'Port', type: 'string', optional: false, placeholder: 'ethernet1/1/1' }], optional: false },
        { line: 'description {desc}', args: [{ name: 'desc', label: 'Description', type: 'string', optional: true, default: 'UPLINK-CONNECTION' }], optional: true },
        { line: 'mtu {mtu}', args: [{ name: 'mtu', label: 'MTU', type: 'integer', optional: true, default: 9216, min: 576, max: 9216 }], optional: true },
        { line: 'switchport mode {mode}', args: [{ name: 'mode', label: 'Switchport Mode', type: 'select', optional: false, options: [
          { label: 'Access', value: 'access' }, { label: 'Trunk', value: 'trunk' }
        ]}], optional: false },
        { line: 'switchport access vlan {vlan_id}', args: [{ name: 'vlan_id', label: 'Access VLAN', type: 'integer', optional: true, min: 2, max: 4094, default: 100 }], optional: true },
        { line: 'switchport trunk allowed vlan {vlan_list}', args: [{ name: 'vlan_list', label: 'Trunk VLAN(s)', type: 'vlan_range', optional: true, default: '100-200', placeholder: '100,200,300-400' }], optional: true },
        { line: 'no switchport', args: [], optional: true },
        { line: 'ip address {ip_cidr}', args: [{ name: 'ip_cidr', label: 'IP Address/CIDR', type: 'cidr', optional: true, default: '10.100.1.1/24' }], optional: true },
        { line: 'ip vrf forwarding {vrf}', args: [{ name: 'vrf', label: 'VRF Name', type: 'string', optional: true }], optional: true },
        { line: 'flowcontrol {fc}', args: [{ name: 'fc', label: 'Flow Control', type: 'select', optional: true, options: [
          { label: 'Receive', value: 'receive' }, { label: 'Send', value: 'send' }, { label: 'Both', value: 'both' }, { label: 'None', value: 'none' }
        ]}], optional: true },
        { line: 'spanning-tree port type edge', args: [], optional: true },
        { line: '{admin}', args: [{ name: 'admin', label: 'Admin State', type: 'select', optional: false, options: [
          { label: 'Enable (no shutdown)', value: 'no shutdown' }, { label: 'Disable (shutdown)', value: 'shutdown' }
        ]}], optional: false },
      ],
      dependencies: ['vlan-create', 'vrf-create'],
    },
    'interface-loopback': {
      id: 'interface-loopback',
      label: 'Loopback Interface',
      category: 'interface',
      modes: ['global'],
      generates: [
        { line: 'interface loopback {id}', args: [{ name: 'id', label: 'Loopback ID', type: 'integer', optional: false, min: 0, max: 1023, default: 0 }], optional: false },
        { line: 'description {desc}', args: [{ name: 'desc', label: 'Description', type: 'string', optional: true, default: 'LOOPBACK' }], optional: true },
        { line: 'ip address {ip_cidr}', args: [{ name: 'ip_cidr', label: 'IP Address/CIDR', type: 'cidr', optional: false, default: '10.0.0.1/32' }], optional: false },
        { line: 'ip vrf forwarding {vrf}', args: [{ name: 'vrf', label: 'VRF Name', type: 'string', optional: true }], optional: true },
      ],
    },
    'interface-port-channel': {
      id: 'interface-port-channel',
      label: 'Port-Channel (LAG)',
      category: 'interface',
      modes: ['global'],
      generates: [
        { line: 'interface port-channel {id}', args: [{ name: 'id', label: 'Port-Channel ID', type: 'integer', optional: false, min: 1, max: 4096, default: 1 }], optional: false },
        { line: 'description {desc}', args: [{ name: 'desc', label: 'Description', type: 'string', optional: true, default: 'LAG' }], optional: true },
        { line: 'switchport mode {mode}', args: [{ name: 'mode', label: 'Switchport Mode', type: 'select', optional: false, options: [
          { label: 'Access', value: 'access' }, { label: 'Trunk', value: 'trunk' }
        ]}], optional: false },
        { line: 'switchport access vlan {vlan_id}', args: [{ name: 'vlan_id', label: 'Access VLAN', type: 'integer', optional: true, min: 2, max: 4094 }], optional: true },
        { line: 'switchport trunk allowed vlan {vlan_list}', args: [{ name: 'vlan_list', label: 'Trunk VLAN(s)', type: 'vlan_range', optional: true }], optional: true },
        { line: 'no shutdown', args: [], optional: false },
      ],
    },
    'interface-mgmt': {
      id: 'interface-mgmt',
      label: 'Management Interface',
      category: 'interface',
      modes: ['global'],
      generates: [
        { line: 'interface mgmt {id}', args: [{ name: 'id', label: 'Mgmt ID', type: 'integer', optional: false, default: 0, min: 0, max: 1 }], optional: false },
        { line: 'description {desc}', args: [{ name: 'desc', label: 'Description', type: 'string', optional: true, default: 'MANAGEMENT' }], optional: true },
        { line: 'ip address {ip_cidr}', args: [{ name: 'ip_cidr', label: 'IP Address/CIDR', type: 'cidr', optional: false, default: '172.20.20.10/24' }], optional: false },
        { line: 'no shutdown', args: [], optional: false },
      ],
    },

    // ==================== VLAN ====================
    'vlan-create': {
      id: 'vlan-create',
      label: 'Create VLAN',
      category: 'vlan',
      modes: ['global'],
      generates: [
        { line: 'interface vlan {vlan_id}', args: [{ name: 'vlan_id', label: 'VLAN ID', type: 'integer', optional: false, min: 2, max: 4094, default: 100 }], optional: false },
        { line: 'description {name}', args: [{ name: 'name', label: 'VLAN Name', type: 'string', optional: true, default: 'APP-VLAN' }], optional: true },
        { line: 'no shutdown', args: [], optional: false },
      ],
    },
    'vlan-name': {
      id: 'vlan-name',
      label: 'Name Existing VLAN',
      category: 'vlan',
      modes: ['global'],
      generates: [
        { line: 'interface vlan {vlan_id}', args: [{ name: 'vlan_id', label: 'VLAN ID', type: 'integer', optional: false, min: 2, max: 4094 }], optional: false },
        { line: 'description {name}', args: [{ name: 'name', label: 'VLAN Name', type: 'string', optional: false, default: 'EXISTING-VLAN' }], optional: false },
      ],
    },
    'vlan-tagged': {
      id: 'vlan-tagged',
      label: 'Tagged Ports on VLAN',
      category: 'vlan',
      modes: ['global'],
      generates: [
        { line: 'interface {port}', args: [{ name: 'port', label: 'Port', type: 'string', optional: false, placeholder: 'ethernet1/1/1' }], optional: false },
        { line: 'switchport mode trunk', args: [], optional: false },
        { line: 'switchport trunk allowed vlan {vlan_list}', args: [{ name: 'vlan_list', label: 'VLAN(s)', type: 'vlan_range', optional: false, placeholder: '100,200-300' }], optional: false },
        { line: 'no shutdown', args: [], optional: false },
      ],
    },
    'vlan-untagged': {
      id: 'vlan-untagged',
      label: 'Untagged Ports on VLAN',
      category: 'vlan',
      modes: ['global'],
      generates: [
        { line: 'interface {port}', args: [{ name: 'port', label: 'Port', type: 'string', optional: false, placeholder: 'ethernet1/1/1' }], optional: false },
        { line: 'switchport mode access', args: [], optional: false },
        { line: 'switchport access vlan {vlan_id}', args: [{ name: 'vlan_id', label: 'VLAN ID', type: 'integer', optional: false, min: 2, max: 4094 }], optional: false },
        { line: 'no shutdown', args: [], optional: false },
      ],
    },

    // ==================== SYSTEM ====================
    'system-hostname': {
      id: 'system-hostname',
      label: 'Hostname',
      category: 'system',
      modes: ['global'],
      generates: [
        { line: 'hostname {name}', args: [{ name: 'name', label: 'Hostname', type: 'string', optional: false, placeholder: 'switch-name' }], optional: false },
      ],
    },
    'system-ntp': {
      id: 'system-ntp',
      label: 'NTP Server',
      category: 'system',
      modes: ['global'],
      generates: [
        { line: 'ntp server {server1}', args: [{ name: 'server1', label: 'Primary NTP', type: 'ip', optional: false, default: '192.168.100.1' }], optional: false },
        { line: 'ntp server {server2}', args: [{ name: 'server2', label: 'Secondary NTP', type: 'ip', optional: true, default: '192.168.100.2' }], optional: true },
        { line: 'ntp server {server3}', args: [{ name: 'server3', label: 'Tertiary NTP', type: 'ip', optional: true }], optional: true },
      ],
    },
    'system-dns': {
      id: 'system-dns',
      label: 'DNS Server',
      category: 'system',
      modes: ['global'],
      generates: [
        { line: 'ip name-server {dns1}', args: [{ name: 'dns1', label: 'Primary DNS', type: 'ip', optional: false, default: '8.8.8.8' }], optional: false },
        { line: 'ip name-server {dns2}', args: [{ name: 'dns2', label: 'Secondary DNS', type: 'ip', optional: true, default: '8.8.4.4' }], optional: true },
        { line: 'ip name-server {dns3}', args: [{ name: 'dns3', label: 'Tertiary DNS', type: 'ip', optional: true }], optional: true },
      ],
    },
    'system-syslog': {
      id: 'system-syslog',
      label: 'Syslog Server',
      category: 'system',
      modes: ['global'],
      generates: [
        { line: 'logging server {ip} port {port} severity {severity}', args: [
          { name: 'ip', label: 'Server IP', type: 'ip', optional: false, default: '10.10.100.5' },
          { name: 'port', label: 'Port', type: 'integer', optional: true, default: 514, min: 1, max: 65535 },
          { name: 'severity', label: 'Severity', type: 'select', optional: true, options: [
            { label: 'Emergency (0)', value: 'emergency' },
            { label: 'Alert (1)', value: 'alert' },
            { label: 'Critical (2)', value: 'critical' },
            { label: 'Error (3)', value: 'error' },
            { label: 'Warning (4)', value: 'warning' },
            { label: 'Notice (5)', value: 'notice' },
            { label: 'Info (6)', value: 'info' },
            { label: 'Debug (7)', value: 'debug' },
          ]},
        ], optional: false },
      ],
    },
    'system-snmp': {
      id: 'system-snmp',
      label: 'SNMP',
      category: 'system',
      modes: ['global'],
      generates: [
        { line: 'snmp-server community {community} {access}', args: [
          { name: 'community', label: 'Community String', type: 'string', optional: false, default: 'public' },
          { name: 'access', label: 'Access', type: 'select', optional: false, options: [
            { label: 'Read-Only', value: 'ro' }, { label: 'Read-Write', value: 'rw' }
          ]},
        ], optional: false },
        { line: 'snmp-server contact {contact}', args: [{ name: 'contact', label: 'Contact', type: 'string', optional: true, default: 'admin@domain.com' }], optional: true },
        { line: 'snmp-server location {location}', args: [{ name: 'location', label: 'Location', type: 'string', optional: true, default: 'DataCenter' }], optional: true },
        { line: 'snmp-server host {trap_host} version 2c {community}', args: [
          { name: 'trap_host', label: 'Trap Host', type: 'ip', optional: true },
          { name: 'community', label: 'Trap Community', type: 'string', optional: true, default: 'public' },
        ], optional: true },
      ],
    },
    'system-banner': {
      id: 'system-banner',
      label: 'Banner / MOTD',
      category: 'system',
      modes: ['global'],
      generates: [
        { line: 'banner {type} {delimiter}{text}{delimiter}', args: [
          { name: 'type', label: 'Banner Type', type: 'select', optional: false, options: [
            { label: 'Exec (login)', value: 'exec' }, { label: 'MOTD', value: 'motd' }
          ]},
          { name: 'text', label: 'Banner Text', type: 'string', optional: false, default: 'AUTHORIZED USERS ONLY' },
          { name: 'delimiter', label: 'Delimiter', type: 'string', optional: true, default: '#' },
        ], optional: false },
      ],
    },

    // ==================== AAA ====================
    'aaa-username': {
      id: 'aaa-username',
      label: 'Create User',
      category: 'aaa',
      modes: ['global'],
      generates: [
        { line: 'username {username} password {password} role {role} privilege {privilege}', args: [
          { name: 'username', label: 'Username', type: 'string', optional: false, default: 'operator_admin' },
          { name: 'password', label: 'Password', type: 'string', optional: false, default: 'SecurePass123!' },
          { name: 'role', label: 'Role', type: 'select', optional: false, options: [
            { label: 'sysadmin (Full)', value: 'sysadmin' },
            { label: 'netadmin (Network)', value: 'netadmin' },
            { label: 'secadmin (Security)', value: 'secadmin' },
            { label: 'operator (Read)', value: 'operator' },
          ]},
          { name: 'privilege', label: 'Privilege Level', type: 'select', optional: false, options: [
            { label: '15 (Admin)', value: '15' },
            { label: '1 (Read)', value: '1' },
          ]},
        ], optional: false },
      ],
    },
    'aaa-enable': {
      id: 'aaa-enable',
      label: 'Enable Password',
      category: 'aaa',
      modes: ['global'],
      generates: [
        { line: 'enable password {password} level {level}', args: [
          { name: 'password', label: 'Enable Password', type: 'string', optional: false, default: 'EnablePass123!' },
          { name: 'level', label: 'Level', type: 'select', optional: true, options: [
            { label: '15 (Full)', value: '15' }, { label: '7 (Operator)', value: '7' }
          ]},
        ], optional: false },
      ],
    },
    'aaa-authentication': {
      id: 'aaa-authentication',
      label: 'Authentication Method',
      category: 'aaa',
      modes: ['global'],
      generates: [
        { line: 'aaa authentication login {method_list}', args: [
          { name: 'method_list', label: 'Auth Methods (space-separated)', type: 'string', optional: false, default: 'local' },
        ], optional: false },
      ],
    },
    'aaa-ssh': {
      id: 'aaa-ssh',
      label: 'SSH Server',
      category: 'aaa',
      modes: ['global'],
      generates: [
        { line: 'ip ssh server {enable}', args: [{ name: 'enable', label: 'Enable SSH', type: 'select', optional: false, options: [
          { label: 'Enable', value: 'enable' }, { label: 'Disable', value: 'disable' }
        ]}], optional: false },
        { line: 'ip ssh port {port}', args: [{ name: 'port', label: 'SSH Port', type: 'integer', optional: true, default: 22, min: 1, max: 65535 }], optional: true },
        { line: 'ip ssh version {version}', args: [{ name: 'version', label: 'SSH Version', type: 'select', optional: true, options: [
          { label: '2', value: '2' }, { label: '1', value: '1' }
        ]}], optional: true },
        { line: 'ip ssh time-out {timeout}', args: [{ name: 'timeout', label: 'Timeout (seconds)', type: 'integer', optional: true, default: 60, min: 10, max: 600 }], optional: true },
        { line: 'ip ssh authentication-retries {retries}', args: [{ name: 'retries', label: 'Auth Retries', type: 'integer', optional: true, default: 3, min: 1, max: 5 }], optional: true },
      ],
    },

    // ==================== VRF ====================
    'vrf-create': {
      id: 'vrf-create',
      label: 'Create VRF',
      category: 'vrf',
      modes: ['global'],
      generates: [
        { line: 'ip vrf {name}', args: [{ name: 'name', label: 'VRF Name', type: 'string', optional: false, default: 'VRF1' }], optional: false },
        { line: 'description {desc}', args: [{ name: 'desc', label: 'Description', type: 'string', optional: true, default: 'CUSTOMER-VRF' }], optional: true },
      ],
    },
    'vrf-interface': {
      id: 'vrf-interface',
      label: 'Assign VRF to Interface',
      category: 'vrf',
      modes: ['global'],
      generates: [
        { line: 'interface {port}', args: [{ name: 'port', label: 'Interface', type: 'string', optional: false, placeholder: 'ethernet1/1/1' }], optional: false },
        { line: 'ip vrf forwarding {vrf}', args: [{ name: 'vrf', label: 'VRF Name', type: 'string', optional: false }], optional: false },
        { line: 'ip address {ip_cidr}', args: [{ name: 'ip_cidr', label: 'IP Address', type: 'cidr', optional: false }], optional: false },
      ],
      dependencies: ['vrf-create'],
    },
    'vrf-evpn': {
      id: 'vrf-evpn',
      label: 'EVPN VRF (VXLAN)',
      category: 'vrf',
      modes: ['global'],
      generates: [
        { line: 'ip vrf {name}', args: [{ name: 'name', label: 'VRF Name', type: 'string', optional: false, default: 'EVPN-VRF' }], optional: false },
        { line: 'vni {vni}', args: [{ name: 'vni', label: 'VNI ID', type: 'integer', optional: true, default: 10000, min: 1, max: 16777215 }], optional: true },
        { line: 'rd {rd}', args: [{ name: 'rd', label: 'Route Distinguisher', type: 'string', optional: true, placeholder: '1.1.1.1:100' }], optional: true },
        { line: 'route-target both {rt}', args: [{ name: 'rt', label: 'Route Target', type: 'string', optional: true, placeholder: '1.1.1.1:100' }], optional: true },
      ],
    },

    // ==================== BGP ====================
    'bgp-router': {
      id: 'bgp-router',
      label: 'BGP Router',
      category: 'bgp',
      modes: ['global'],
      generates: [
        { line: 'router bgp {asn}', args: [{ name: 'asn', label: 'Local ASN', type: 'integer', optional: false, default: 65000, min: 1, max: 65535 }], optional: false },
        { line: 'bgp router-id {router_id}', args: [{ name: 'router_id', label: 'Router-ID', type: 'ip', optional: false, default: '10.0.0.1' }], optional: false },
        { line: 'maximum-paths {ebgp} {ibgp}', args: [
          { name: 'ebgp', label: 'eBGP Paths', type: 'integer', optional: true, default: 8, min: 1, max: 64 },
          { name: 'ibgp', label: 'iBGP Paths', type: 'integer', optional: true, default: 8, min: 1, max: 64 },
        ], optional: true },
      ],
    },
    'bgp-neighbor': {
      id: 'bgp-neighbor',
      label: 'BGP Neighbor',
      category: 'bgp',
      modes: ['bgp'],
      generates: [
        { line: 'neighbor {ip} remote-as {remote_asn}', args: [
          { name: 'ip', label: 'Neighbor IP', type: 'ip', optional: false, default: '10.0.0.2' },
          { name: 'remote_asn', label: 'Remote ASN', type: 'integer', optional: false, default: 65001, min: 1, max: 65535 },
        ], optional: false },
        { line: 'neighbor {ip} update-source loopback {lo}', args: [
          { name: 'ip', label: 'Neighbor IP', type: 'ip', optional: false },
          { name: 'lo', label: 'Loopback ID', type: 'integer', optional: true, default: 0 },
        ], optional: true },
        { line: 'neighbor {ip} ebgp-multihop {hop}', args: [
          { name: 'ip', label: 'Neighbor IP', type: 'ip', optional: false },
          { name: 'hop', label: 'TTL', type: 'integer', optional: true, default: 2, min: 1, max: 255 },
        ], optional: true },
        { line: 'neighbor {ip} password {bgp_pass}', args: [
          { name: 'ip', label: 'Neighbor IP', type: 'ip', optional: false },
          { name: 'bgp_pass', label: 'MD5 Password', type: 'string', optional: true },
        ], optional: true },
      ],
      dependencies: ['bgp-router'],
    },
    'bgp-network': {
      id: 'bgp-network',
      label: 'BGP Network',
      category: 'bgp',
      modes: ['bgp'],
      generates: [
        { line: 'network {prefix} mask {mask}', args: [
          { name: 'prefix', label: 'Prefix', type: 'ip', optional: false },
          { name: 'mask', label: 'Subnet Mask', type: 'ip', optional: false, default: '255.255.255.0' },
        ], optional: false },
      ],
      dependencies: ['bgp-router'],
    },
    'bgp-address-family': {
      id: 'bgp-address-family',
      label: 'BGP Address Family',
      category: 'bgp',
      modes: ['bgp'],
      generates: [
        { line: 'address-family {afi} {safi}', args: [
          { name: 'afi', label: 'AFI', type: 'select', optional: false, options: [
            { label: 'IPv4', value: 'ipv4' }, { label: 'IPv6', value: 'ipv6' }, { label: 'L2VPN', value: 'l2vpn' }
          ]},
          { name: 'safi', label: 'SAFI', type: 'select', optional: false, options: [
            { label: 'Unicast', value: 'unicast' }, { label: 'Multicast', value: 'multicast' },
            { label: 'EVPN', value: 'evpn' }, { label: 'VPN-IPv4', value: 'vpn' }
          ]},
        ], optional: false },
        { line: 'neighbor {ip} activate', args: [{ name: 'ip', label: 'Neighbor IP', type: 'ip', optional: true }], optional: true },
      ],
      dependencies: ['bgp-router'],
    },

    // ==================== STATIC ROUTE ====================
    'ip-route': {
      id: 'ip-route',
      label: 'Static Route',
      category: 'static_route',
      modes: ['global'],
      generates: [
        { line: 'ip route {network} {mask} {next_hop} {distance}', args: [
          { name: 'network', label: 'Network', type: 'ip', optional: false, default: '10.0.0.0' },
          { name: 'mask', label: 'Subnet Mask', type: 'ip', optional: false, default: '255.255.255.0' },
          { name: 'next_hop', label: 'Next Hop', type: 'ip', optional: false, default: '10.0.0.1' },
          { name: 'distance', label: 'Admin Distance', type: 'integer', optional: true, default: 1, min: 1, max: 255 },
        ], optional: false },
      ],
    },
    'ip-default-route': {
      id: 'ip-default-route',
      label: 'Default Route',
      category: 'static_route',
      modes: ['global'],
      generates: [
        { line: 'ip route 0.0.0.0 0.0.0.0 {next_hop} {distance}', args: [
          { name: 'next_hop', label: 'Next Hop', type: 'ip', optional: false, default: '10.0.0.1' },
          { name: 'distance', label: 'Admin Distance', type: 'integer', optional: true, default: 1, min: 1, max: 255 },
        ], optional: false },
      ],
    },

    // ==================== LAG ====================
    'lag-port-channel': {
      id: 'lag-port-channel',
      label: 'Create Port-Channel',
      category: 'lag',
      modes: ['global'],
      generates: [
        { line: 'interface port-channel {id}', args: [{ name: 'id', label: 'Port-Channel ID', type: 'integer', optional: false, min: 1, max: 4096, default: 1 }], optional: false },
        { line: 'description {desc}', args: [{ name: 'desc', label: 'Description', type: 'string', optional: true, default: 'LAG-GROUP' }], optional: true },
        { line: 'switchport mode {mode}', args: [{ name: 'mode', label: 'Switchport Mode', type: 'select', optional: false, options: [
          { label: 'Trunk', value: 'trunk' }, { label: 'Access', value: 'access' }
        ]}], optional: false },
        { line: 'no shutdown', args: [], optional: false },
      ],
    },
    'lag-lacp-config': {
      id: 'lag-lacp-config',
      label: 'LACP Config',
      category: 'lag',
      modes: ['global'],
      generates: [
        { line: 'interface {port}', args: [{ name: 'port', label: 'Member Port', type: 'string', optional: false, placeholder: 'ethernet1/1/1' }], optional: false },
        { line: 'channel-group {id} mode {mode}', args: [
          { name: 'id', label: 'Port-Channel ID', type: 'integer', optional: false, min: 1, max: 4096 },
          { name: 'mode', label: 'LACP Mode', type: 'select', optional: false, options: [
            { label: 'Active', value: 'active' }, { label: 'Passive', value: 'passive' }, { label: 'On (static)', value: 'on' }
          ]},
        ], optional: false },
        { line: 'no shutdown', args: [], optional: false },
      ],
      dependencies: ['lag-port-channel'],
    },

    // ==================== STP ====================
    'stp-mode': {
      id: 'stp-mode',
      label: 'STP Mode & Priority',
      category: 'stp',
      modes: ['global'],
      generates: [
        { line: 'spanning-tree mode {mode}', args: [{ name: 'mode', label: 'STP Mode', type: 'select', optional: false, options: [
          { label: 'RSTP', value: 'rstp' }, { label: 'MST', value: 'mst' }, { label: 'PVST', value: 'pvst' }
        ]}], optional: false },
        { line: 'spanning-tree priority {priority}', args: [{ name: 'priority', label: 'Bridge Priority', type: 'integer', optional: true, default: 32768, min: 0, max: 61440 }], optional: true },
        { line: 'spanning-tree hello-time {hello}', args: [{ name: 'hello', label: 'Hello Time (s)', type: 'integer', optional: true, default: 2, min: 1, max: 10 }], optional: true },
        { line: 'spanning-tree max-age {max_age}', args: [{ name: 'max_age', label: 'Max Age (s)', type: 'integer', optional: true, default: 20, min: 6, max: 40 }], optional: true },
        { line: 'spanning-tree forward-delay {fwd_delay}', args: [{ name: 'fwd_delay', label: 'Forward Delay (s)', type: 'integer', optional: true, default: 15, min: 4, max: 30 }], optional: true },
      ],
    },
    'stp-port-edge': {
      id: 'stp-port-edge',
      label: 'Port Edge / PortFast',
      category: 'stp',
      modes: ['global'],
      generates: [
        { line: 'interface {port}', args: [{ name: 'port', label: 'Port', type: 'string', optional: false, placeholder: 'ethernet1/1/1' }], optional: false },
        { line: 'spanning-tree port type edge', args: [], optional: false },
        { line: 'spanning-tree bpduguard {guard}', args: [{ name: 'guard', label: 'BPDU Guard', type: 'select', optional: true, options: [
          { label: 'Enable', value: 'enable' }, { label: 'Disable', value: 'disable' }
        ]}], optional: true },
      ],
    },
    'stp-bpduguard': {
      id: 'stp-bpduguard',
      label: 'Global BPDU Guard',
      category: 'stp',
      modes: ['global'],
      generates: [
        { line: 'spanning-tree bpduguard {default_state}', args: [{ name: 'default_state', label: 'Default State', type: 'select', optional: false, options: [
          { label: 'Enable', value: 'enable' }, { label: 'Disable', value: 'disable' }
        ]}], optional: false },
      ],
    },

    // ==================== QoS & ACL ====================
    'ip-access-list': {
      id: 'ip-access-list',
      label: 'IP Access-List',
      category: 'qos',
      modes: ['global'],
      generates: [
        { line: 'ip access-list {name} {action}', args: [
          { name: 'name', label: 'ACL Name', type: 'string', optional: false, default: 'ACL-1' },
          { name: 'action', label: 'Default Action', type: 'select', optional: true, options: [
            { label: 'Deny (default)', value: 'deny' }, { label: 'Permit (default)', value: 'permit' }
          ]},
        ], optional: false },
        { line: 'seq {seq} {action} {src} {src_mask} any', args: [
          { name: 'seq', label: 'Sequence', type: 'integer', optional: false, default: 10, min: 1, max: 65535 },
          { name: 'action', label: 'Action', type: 'select', optional: false, options: [
            { label: 'Permit', value: 'permit' }, { label: 'Deny', value: 'deny' }
          ]},
          { name: 'src', label: 'Source IP', type: 'ip', optional: false, default: '10.0.0.0' },
          { name: 'src_mask', label: 'Source Wildcard Mask', type: 'ip', optional: false, default: '0.255.255.255' },
        ], optional: false },
      ],
    },
    'prefix-list': {
      id: 'prefix-list',
      label: 'Prefix-List',
      category: 'qos',
      modes: ['global'],
      generates: [
        { line: 'ip prefix-list {name} {action} {prefix} {ge} {le}', args: [
          { name: 'name', label: 'Prefix-List Name', type: 'string', optional: false, default: 'PL-1' },
          { name: 'action', label: 'Action', type: 'select', optional: false, options: [
            { label: 'Permit', value: 'permit' }, { label: 'Deny', value: 'deny' }
          ]},
          { name: 'prefix', label: 'Prefix (CIDR)', type: 'cidr', optional: false, default: '10.0.0.0/8' },
          { name: 'ge', label: 'GE (min prefix length)', type: 'integer', optional: true, min: 0, max: 32 },
          { name: 'le', label: 'LE (max prefix length)', type: 'integer', optional: true, min: 0, max: 32 },
        ], optional: false },
      ],
    },
    'qos-class-map': {
      id: 'qos-class-map',
      label: 'Class Map',
      category: 'qos',
      modes: ['global'],
      generates: [
        { line: 'class-map match-any {name}', args: [{ name: 'name', label: 'Class-Map Name', type: 'string', optional: false, default: 'CM-1' }], optional: false },
        { line: 'match ip dscp {dscp}', args: [{ name: 'dscp', label: 'DSCP Value', type: 'integer', optional: false, default: 46, min: 0, max: 63 }], optional: false },
      ],
    },
    'qos-policy-map': {
      id: 'qos-policy-map',
      label: 'Policy Map',
      category: 'qos',
      modes: ['global'],
      generates: [
        { line: 'policy-map type qos {name}', args: [{ name: 'name', label: 'Policy-Map Name', type: 'string', optional: false, default: 'PM-1' }], optional: false },
        { line: 'class {class_name}', args: [{ name: 'class_name', label: 'Class Name', type: 'string', optional: false }], optional: false },
        { line: 'set dscp {dscp}', args: [{ name: 'dscp', label: 'DSCP Value', type: 'integer', optional: true, default: 46, min: 0, max: 63 }], optional: true },
        { line: 'police {cir} {cbs}', args: [
          { name: 'cir', label: 'CIR (bps)', type: 'integer', optional: true, default: 10000000 },
          { name: 'cbs', label: 'CBS (bytes)', type: 'integer', optional: true, default: 10000 },
        ], optional: true },
      ],
      dependencies: ['qos-class-map'],
    },
  },
};

export function getTemplateById(id: string) {
  return DELL_OS10_CATALOG.templates[id];
}

export function getTemplatesByCategory(categoryId: string) {
  const cat = DELL_OS10_CATALOG.categories.find(c => c.id === categoryId);
  if (!cat) return [];
  return cat.templates.map(id => DELL_OS10_CATALOG.templates[id]).filter(Boolean);
}

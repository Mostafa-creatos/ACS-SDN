import re
from typing import List, Tuple

IP_RX = r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}'
CIDR_RX = IP_RX + r'/\d{1,2}'

OS10_PATTERNS: List[re.Pattern] = [
    # --- System ---
    re.compile(r'^hostname [\w.-]+$'),
    re.compile(r'^banner (exec|motd) .+$'),
    re.compile(r'^ntp server ' + IP_RX + r'$'),
    re.compile(r'^ip name-server ' + IP_RX + r'$'),
    re.compile(r'^logging server ' + IP_RX + r'( port \d+)?( severity \w+)?$'),
    re.compile(r'^snmp-server community \S+ (ro|rw)$'),
    re.compile(r'^snmp-server contact .+$'),
    re.compile(r'^snmp-server location .+$'),
    re.compile(r'^snmp-server host ' + IP_RX + r' version 2c \S+$'),
    # --- AAA ---
    re.compile(r'^username \S+ password \S+( role \w+)?( privilege \d+)?$'),
    re.compile(r'^enable password \S+( level \d+)?$'),
    re.compile(r'^aaa authentication login .+$'),
    re.compile(r'^ip ssh server (enable|disable)$'),
    re.compile(r'^ip ssh port \d+$'),
    re.compile(r'^ip ssh version (1|2)$'),
    re.compile(r'^ip ssh time-out \d+$'),
    re.compile(r'^ip ssh authentication-retries \d+$'),
    # --- Interface context ---
    re.compile(r'^interface (ethernet\s*[\d/]+|loopback\s*\d+|port-channel\s*\d+|mgmt\s*\d+|vlan\s*\d+)$'),
    # --- Interface subcommands (leading space optional) ---
    re.compile(r'^ ?description .+$'),
    re.compile(r'^ ?mtu \d+$'),
    re.compile(r'^ ?switchport mode (access|trunk)$'),
    re.compile(r'^ ?switchport access vlan \d+$'),
    re.compile(r'^ ?switchport trunk allowed vlan [\d,\-]+$'),
    re.compile(r'^ ?no switchport$'),
    re.compile(r'^ ?ip address ' + CIDR_RX + r'$'),
    re.compile(r'^ ?ip vrf forwarding \S+$'),
    re.compile(r'^ ?flowcontrol (receive|send|both|none)$'),
    re.compile(r'^ ?spanning-tree port type edge$'),
    re.compile(r'^ ?channel-group \d+ mode (active|passive|on)$'),
    re.compile(r'^ ?no shutdown$'),
    re.compile(r'^ ?shutdown$'),
    # --- VRF ---
    re.compile(r'^ip vrf \S+$'),
    re.compile(r'^ ?vni \d+$'),
    re.compile(r'^ ?rd \S+$'),
    re.compile(r'^ ?route-target both \S+$'),
    re.compile(r'^ ?ip vrf forwarding \S+$'),
    # --- BGP ---
    re.compile(r'^router bgp \d+$'),
    re.compile(r'^ ?bgp router-id ' + IP_RX + r'$'),
    re.compile(r'^ ?maximum-paths \d+( \d+)?$'),
    re.compile(r'^ ?neighbor ' + IP_RX + r' remote-as \d+$'),
    re.compile(r'^ ?neighbor ' + IP_RX + r' update-source loopback \d+$'),
    re.compile(r'^ ?neighbor ' + IP_RX + r' ebgp-multihop \d+$'),
    re.compile(r'^ ?neighbor ' + IP_RX + r' password \S+$'),
    re.compile(r'^ ?network ' + IP_RX + r' mask \S+$'),
    re.compile(r'^ ?address-family (ipv4|ipv6|l2vpn) (unicast|multicast|evpn|vpn)$'),
    re.compile(r'^ ?neighbor ' + IP_RX + r' activate$'),
    # --- Static routes ---
    re.compile(r'^ip route ' + IP_RX + r' \S+ \S+( \d+)?$'),
    # --- STP ---
    re.compile(r'^spanning-tree mode (rstp|mst|pvst)$'),
    re.compile(r'^spanning-tree priority \d+$'),
    re.compile(r'^spanning-tree hello-time \d+$'),
    re.compile(r'^spanning-tree max-age \d+$'),
    re.compile(r'^spanning-tree forward-delay \d+$'),
    re.compile(r'^spanning-tree bpduguard (enable|disable)$'),
    # --- LAG ---
    re.compile(r'^interface port-channel \s*\d+$'),
    re.compile(r'^ ?channel-group \d+ mode (active|passive|on)$'),
    # --- QoS / ACL ---
    re.compile(r'^ip access-list \S+( deny| permit)?$'),
    re.compile(r'^ ?seq \d+ (permit|deny) \S+ \S+ any$'),
    re.compile(r'^ip prefix-list \S+ (permit|deny) \S+( ge \d+)?( le \d+)?$'),
    re.compile(r'^class-map match-any \S+$'),
    re.compile(r'^ ?match ip dscp \d+$'),
    re.compile(r'^policy-map type qos \S+$'),
    re.compile(r'^ ?class \S+$'),
    re.compile(r'^ ?set dscp \d+$'),
    re.compile(r'^ ?police \d+( \d+)?$'),
    # --- VLT ---
    re.compile(r'^vlt-domain \d+$'),
    re.compile(r'^ ?primary$'),
    re.compile(r'^ ?secondary$'),
    re.compile(r'^ ?discovery-interface [\w/,]+$'),
    re.compile(r'^ ?vlt-mac [0-9a-fA-F:\.]+$'),
    re.compile(r'^ ?vlt-port-channel \d+$'),
    re.compile(r'^ ?backup destination ' + IP_RX + r'$'),
    # --- Session markers ---
    re.compile(r'^configure terminal$'),
    re.compile(r'^end$'),
    re.compile(r'^exit$'),
    re.compile(r'^copy running-config startup-config$'),
]


def validate_os10_syntax(config_payload: str) -> List[Tuple[int, str]]:
    if not config_payload.strip():
        return [(0, "Config payload is empty")]

    errors: List[Tuple[int, str]] = []
    lines = config_payload.splitlines()

    # Stateful context tracker
    # Contexts can be: 'global', 'interface', 'vrf', 'bgp', 'bgp-af', 'qos', 'qos-class'
    context = 'global'
    context_line = 0
    context_cmd = ""

    for i, raw in enumerate(lines):
        line = raw.strip()
        if not line or line.startswith('!'):
            continue

        matched = any(p.match(line) for p in OS10_PATTERNS)
        if not matched:
            errors.append((i + 1, f"Unrecognized OS10 command: '{line}'"))
            continue

        # 1. State/Context transitions
        if line.startswith('interface ') and not ('breakout' in line):
            if context != 'global':
                errors.append((i + 1, f"Context violation: Entered interface mode '{line}' while still in '{context}' mode (entered at line {context_line}: '{context_cmd}'). Did you forget to 'exit'?"))
            context = 'interface'
            context_line = i + 1
            context_cmd = line
            continue

        elif line.startswith('ip vrf ') and not ('forwarding' in line):
            if context != 'global':
                errors.append((i + 1, f"Context violation: Entered VRF mode '{line}' while still in '{context}' mode (entered at line {context_line}: '{context_cmd}'). Did you forget to 'exit'?"))
            context = 'vrf'
            context_line = i + 1
            context_cmd = line
            continue

        elif line.startswith('router bgp '):
            if context != 'global':
                errors.append((i + 1, f"Context violation: Entered BGP mode '{line}' while still in '{context}' mode (entered at line {context_line}: '{context_cmd}'). Did you forget to 'exit'?"))
            context = 'bgp'
            context_line = i + 1
            context_cmd = line
            continue

        elif line.startswith('address-family '):
            if context != 'bgp':
                errors.append((i + 1, f"Context violation: Entered address-family mode '{line}' but not in BGP mode (current context is '{context}')."))
            context = 'bgp-af'
            context_line = i + 1
            context_cmd = line
            continue

        elif line.startswith('vlt-domain '):
            if context != 'global':
                errors.append((i + 1, f"Context violation: Entered VLT mode '{line}' while still in '{context}' mode (entered at line {context_line}: '{context_cmd}'). Did you forget to 'exit'?"))
            context = 'vlt'
            context_line = i + 1
            context_cmd = line
            continue

        elif line.startswith('class-map ') or line.startswith('policy-map ') or line.startswith('ip access-list '):
            if context != 'global':
                errors.append((i + 1, f"Context violation: Entered QoS/ACL definition '{line}' while still in '{context}' mode (entered at line {context_line}: '{context_cmd}'). Did you forget to 'exit'?"))
            context = 'qos'
            context_line = i + 1
            context_cmd = line
            continue

        elif line.startswith('class '):
            if context != 'qos':
                errors.append((i + 1, f"Context violation: Entered class command '{line}' but not inside policy-map mode (current context is '{context}')."))
            context = 'qos-class'
            context_line = i + 1
            context_cmd = line
            continue

        elif line == 'end':
            context = 'global'
            continue

        elif line == 'exit':
            if context == 'bgp-af':
                context = 'bgp'
            elif context == 'qos-class':
                context = 'qos'
            else:
                context = 'global'
            continue

        # 2. Context command validation (ensure command runs in the right mode)
        if 'ip address ' in line or 'ip vrf forwarding ' in line:
            if context != 'interface':
                errors.append((i + 1, f"Syntax violation: Command '{line}' must be executed inside interface configuration mode."))
        elif 'route-target ' in line or 'rd ' in line or 'vni ' in line:
            if context != 'vrf':
                errors.append((i + 1, f"Syntax violation: Command '{line}' must be executed inside VRF configuration mode."))

        # 3. Inline range checks
        if line.startswith('interface vlan '):
            vlan_id = int(line.split()[-1])
            if vlan_id < 2 or vlan_id > 4094:
                errors.append((i + 1, f"VLAN ID {vlan_id} out of range (2-4094)"))
        elif 'access vlan ' in line or line.startswith('switchport access vlan '):
            try:
                vlan_id = int(line.split()[-1])
                if vlan_id < 2 or vlan_id > 4094:
                    errors.append((i + 1, f"VLAN ID {vlan_id} out of range (2-4094)"))
            except ValueError:
                errors.append((i + 1, f"Invalid VLAN value: '{line.split()[-1]}'"))
        elif line.startswith(' mtu ') or line.startswith('mtu '):
            try:
                mtu = int(line.split()[-1])
                if mtu < 576 or mtu > 9216:
                    errors.append((i + 1, f"MTU {mtu} out of range (576-9216)"))
            except ValueError:
                errors.append((i + 1, f"Invalid MTU value: '{line.split()[-1]}'"))
        elif line.startswith('router bgp '):
            try:
                asn = int(line.split()[-1])
                if asn < 1 or asn > 65535:
                    errors.append((i + 1, f"BGP ASN {asn} out of range (1-65535)"))
            except ValueError:
                errors.append((i + 1, f"Invalid BGP ASN: '{line.split()[-1]}'"))
        elif line.startswith('spanning-tree priority '):
            try:
                prio = int(line.split()[-1])
                if prio < 0 or prio > 61440 or prio % 4096 != 0:
                    errors.append((i + 1, f"STP bridge priority {prio} invalid (must be multiple of 4096, 0-61440)"))
            except ValueError:
                errors.append((i + 1, f"Invalid STP priority: '{line.split()[-1]}'"))

    return errors

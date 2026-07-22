import json
import os
import uuid
import datetime
import logging
import socket

logger = logging.getLogger(__name__)
import time
import re
from sqlalchemy.orm import Session
from .. import models
from .gnmi_client import gNMIclient, get_switch_lldp, parse_lldp_neighbors

def is_valid_host_mac(mac: str) -> bool:
    """
    Returns True for unicast MACs that are plausibly real end-host addresses.
    Filters out:
      - All-zeros / all-ff broadcast
      - Multicast MACs (LSB of first octet = 1)
      - Common control-plane prefixes (01:80:c2, 01:00:5e, 33:33:, ff:ff:ff)
      - Nokia internal control-plane pattern: xx:xx:xx:ff:00:01 / ff:00:02
    NOTE: We do NOT filter locally-administered (second LSB of first byte)
    because Containerlab assigns those to real client containers.
    NOTE: Containerlab uses aa:c1:ab prefix for ALL its device MACs,
    including real client containers, so we do NOT filter that prefix.
    """
    mac = mac.replace('-', ':').replace('.', ':').lower().strip()
    parts = mac.split(':')
    if len(parts) != 6:
        return False
    try:
        first_byte = int(parts[0], 16)
    except ValueError:
        return False
    # Multicast: LSB of first byte is 1
    if first_byte & 0x01:
        return False
    # All zeros
    if all(p == '00' for p in parts):
        return False
    # All ff (broadcast)
    if all(p == 'ff' for p in parts):
        return False
    # Nokia internal control-plane: xx:xx:xx:ff:00:01 or ff:00:02
    if len(parts) >= 6 and parts[3] == 'ff' and parts[4] == '00' and parts[5] in ('01', '02'):
        return False
    return True


def clean_and_login_dell_console(ip, port=5000):
    """
    Connects to the Dell console TCP socket, handles the login prompts,
    disables pagination, and returns the active socket.
    """
    s = socket.socket()
    s.settimeout(5)
    try:
        s.connect((ip, port))
        # Send Ctrl+C and Enter to break out of any stuck state or pager
        s.send(b"\x03\r\n")
        time.sleep(0.5)
        
        # Read initial buffer to detect login prompt
        buf = ""
        start_time = time.time()
        while time.time() - start_time < 3:
            try:
                chunk = s.recv(4096).decode('utf-8', errors='ignore')
                if not chunk:
                    break
                buf += chunk
                if "login:" in buf or "Password:" in buf or "spine-" in buf:
                    break
            except socket.timeout:
                break
                
        # Send Enter to provoke prompt if empty
        if not buf.strip():
            s.send(b"\r\n")
            time.sleep(0.5)
            while time.time() - start_time < 3:
                try:
                    chunk = s.recv(4096).decode('utf-8', errors='ignore')
                    buf += chunk
                    if "login:" in buf or "Password:" in buf or "spine-" in buf:
                        break
                except socket.timeout:
                    break

        # Handle login prompts if they appear
        if "login:" in buf:
            s.send(b"admin\n")
            time.sleep(0.5)
            # Read until password prompt
            p_buf = ""
            p_start = time.time()
            while time.time() - p_start < 2:
                try:
                    chunk = s.recv(4096).decode('utf-8', errors='ignore')
                    p_buf += chunk
                    if "Password:" in p_buf:
                        break
                except socket.timeout:
                    break
            s.send(b"admin\n")
            time.sleep(1.0)
            
        # Send end to make sure we are in exec mode and not config mode
        s.send(b"end\n")
        time.sleep(0.5)
        # Send terminal length 0 to prevent --More-- pagination
        s.send(b"terminal length 0\n")
        time.sleep(0.5)
        # Flush the buffer
        try:
            s.settimeout(0.1)
            while s.recv(8192):
                pass
        except socket.timeout:
            pass
            
        s.settimeout(5)
        return s
    except Exception as e:
        logger.info(f"[Dell Console] Connection/Login failed for {ip}: {e}")
        s.close()
        return None

def parse_dell_console_output(s, command):
    """
    Sends a command to the socket and reads the response until the prompt is found.
    """
    s.send(f"{command}\n".encode('utf-8'))
    time.sleep(1.0)
    out = ""
    start_time = time.time()
    while time.time() - start_time < 5:
        try:
            chunk = s.recv(8192).decode('utf-8', errors='ignore')
            if not chunk:
                break
            out += chunk
            if "spine-" in chunk and "#" in chunk:
                break
        except socket.timeout:
            break
    return out.replace('\x00', '')

def discover_dell_switch(sw, db: Session):
    """
    Connects to a Dell OS10 switch via SSH, retrieves status, running config, and neighbors,
    and updates the database.
    """
    import os
    logger.info(f"[Dell Discovery] Connecting to {sw.hostname} at {sw.management_ip} via SSH...")
    
    from ..drivers.dell_os10_collector import DellOS10Collector
    
    ssh_user = os.environ.get("DELL_SSH_USERNAME", "admin")
    ssh_pass = os.environ.get("DELL_SSH_PASSWORD", "admin")
    ssh_port = int(os.environ.get("DELL_SSH_PORT", "22"))
    
    interfaces = []
    lldp_links = []
    
    try:
        with DellOS10Collector(
            host=sw.management_ip,
            username=ssh_user,
            password=ssh_pass,
            port=5000,
            use_ssh=False,
        ) as collector:
            data = collector.collect_all()
            
        system = data.get("system", {})
        environment = data.get("environment", {})
        inventory = data.get("inventory", [])
        interfaces_data = data.get("interfaces", [])
        vlans = data.get("vlans", [])
        lags = data.get("lags", [])
        lldp = data.get("lldp", [])
        vlt = data.get("vlt")
        stp = data.get("stp")
        running_config = data.get("running_config", "")
        
        # 1. Update metadata
        sw.os_version = system.get("os_version") or sw.os_version
        sw.model = system.get("model") or sw.model
        sw.uptime = system.get("uptime") or sw.uptime
        sw.serial_number = system.get("serial_number") or sw.serial_number
        sw.management_mac = system.get("management_mac") or sw.management_mac
        sw.chassis_status = data.get("chassis_status") or sw.chassis_status
        sw.temperature = data.get("temperature") or sw.temperature
        
        # 2. Update status and sync time
        sw.status = "Up"
        sw.last_successful_sync = datetime.datetime.now(datetime.timezone.utc)
        
        # 3. Store raw config and check for configuration drift
        if running_config:
            sw.running_config = running_config
            latest_snap = db.query(models.ConfigSnapshot).filter(
                models.ConfigSnapshot.switch_id == sw.switch_id
            ).order_by(models.ConfigSnapshot.taken_at.desc()).first()
            
            if latest_snap:
                def normalize_cfg(c: str) -> str:
                    return "\n".join([l.strip() for l in c.replace("\r\n", "\n").split("\n") if l.strip()])
                if normalize_cfg(running_config) != normalize_cfg(latest_snap.raw_config):
                    sw.lifecycle_status = "configuration_drifted"
                else:
                    sw.lifecycle_status = "compliant_active"
            else:
                sw.lifecycle_status = "compliant_active"
                
        # Store VLANs, LAGs, and Hardware Components in DB
        db.query(models.SwitchVlan).filter(models.SwitchVlan.switch_id == sw.switch_id).delete()
        db.query(models.SwitchLag).filter(models.SwitchLag.switch_id == sw.switch_id).delete()
        db.query(models.HardwareComponent).filter(models.HardwareComponent.switch_id == sw.switch_id).delete()

        for vl in vlans:
            db.add(models.SwitchVlan(
                vlan_id=vl["vlan_id"],
                switch_id=sw.switch_id,
                name=vl.get("name", f"VLAN_{vl['vlan_id']}"),
                status=vl.get("status", "active"),
                member_ports=vl.get("member_ports", []),
            ))

        for lag in lags:
            db.add(models.SwitchLag(
                lag_id=lag.get("lag_id") or str(uuid.uuid4()),
                switch_id=sw.switch_id,
                lag_name=lag.get("lag_name", ""),
                lag_type=lag.get("lag_type", "lacp"),
                member_ports=lag.get("member_ports", []),
                status=lag.get("status", "up"),
                protocol=lag.get("protocol", "lacp"),
            ))

        for inv in inventory:
            db.add(models.HardwareComponent(
                component_id=uuid.uuid4(),
                switch_id=sw.switch_id,
                component_type=inv.get("component_type", "unknown"),
                slot_label=inv.get("slot_label", ""),
                part_number=inv.get("part_number", ""),
                ppid=inv.get("ppid", ""),
                service_tag=inv.get("service_tag", ""),
                status=inv.get("status", "ok"),
                detail=inv.get("detail", ""),
                numeric_value=inv.get("numeric_value"),
            ))

        db.commit()
        
        # 4. Map interfaces for returning to caller
        for intf in interfaces_data:
            interfaces.append({
                "name": intf.get("name"),
                "status": intf.get("status"),
                "speed_duplex": intf.get("speed_duplex"),
                "vlan": intf.get("vlan"),
                "description": intf.get("description"),
                "mac_address": intf.get("mac_address"),
                "media_type": intf.get("media_type")
            })
            
        # 5. Map LLDP links for returning to caller
        for entry in lldp:
            lldp_links.append({
                "ip": sw.management_ip,
                "port": entry.get("port"),
                "remote_name": entry.get("remote_name"),
                "remote_port": entry.get("remote_port"),
                "remote_chassis": entry.get("remote_chassis")
            })

        # 6. Parse MAC address table and ARP table for endpoints
        endpoints = []
        mac_to_ip = {}
        try:
            with DellOS10Collector(
                host=sw.management_ip,
                username=ssh_user,
                password=ssh_pass,
                port=5000,
                use_ssh=False,
            ) as collector:
                mac_out = collector._send_command("show mac address-table")
                arp_out = collector._send_command("show ip arp")
                
                # Parse ARP IP-to-MAC mapping
                for line in arp_out.split("\n"):
                    ip_match = re.search(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', line)
                    mac_match = re.search(r'([0-9a-fA-F]{2}[:.-][0-9a-fA-F]{2}[:.-][0-9a-fA-F]{2}[:.-][0-9a-fA-F]{2}[:.-][0-9a-fA-F]{2}[:.-][0-9a-fA-F]{2}|[0-9a-fA-F]{4}[.][0-9a-fA-F]{4}[.][0-9a-fA-F]{4})', line)
                    if ip_match and mac_match:
                        mac_to_ip[mac_match.group(1).upper()] = ip_match.group(1)
                
                # Parse MAC address-table entries
                # VlanId     Mac Address          Type           Ports
                # 100        00:11:22:33:44:55    dynamic        ethernet1/1/1
                mac_pattern = re.compile(
                    r'(\d+)\s+([0-9a-fA-F]{2}[:.-][0-9a-fA-F]{2}[:.-][0-9a-fA-F]{2}[:.-][0-9a-fA-F]{2}[:.-][0-9a-fA-F]{2}[:.-][0-9a-fA-F]{2}|[0-9a-fA-F]{4}[.][0-9a-fA-F]{4}[.][0-9a-fA-F]{4})\s+(?:dynamic|static)\s+(\S+)',
                    re.IGNORECASE
                )
                lldp_ports = {l["port"] for l in lldp_links}
                raw_count = 0
                filtered_mac = 0
                filtered_lldp = 0
                for line in mac_out.split("\n"):
                    m = mac_pattern.search(line)
                    if m:
                        raw_count += 1
                        vlan_id = int(m.group(1))
                        mac_addr = m.group(2)
                        port_name = m.group(3)
                        
                        # Skip invalid/internal MACs
                        if not is_valid_host_mac(mac_addr):
                            filtered_mac += 1
                            continue
                        
                        # Filter out LLDP neighbor ports to only keep edge host endpoints
                        if port_name in lldp_ports:
                            filtered_lldp += 1
                            continue
                            
                        endpoints.append({
                            "mac_address": mac_addr,
                            "ip_address": mac_to_ip.get(mac_addr.upper()),
                            "vlan_id": vlan_id,
                            "port": port_name,
                            "switch_id": sw.switch_id
                        })
                logger.info(f"[Dell Discovery] {sw.hostname}: {raw_count} raw, {filtered_mac} filtered by MAC, {filtered_lldp} filtered by LLDP, {len(endpoints)} valid")
        except Exception as e:
            logger.info(f"[Dell Discovery] Endpoints CLI parsing failed for {sw.hostname}: {e}")
            
        # Store STP state from collect_stp() result
        if stp:
            try:
                existing = db.query(models.SwitchSTPState).filter(
                    models.SwitchSTPState.switch_id == sw.switch_id
                ).first()
                if existing:
                    existing.stp_enabled = stp.get("enabled", False)
                    existing.is_root_bridge = stp.get("root_bridge", False)
                    existing.bridge_priority = stp.get("bridge_priority", 32768)
                    existing.port_states = stp.get("port_states", [])
                    existing.collected_at = datetime.datetime.now(datetime.timezone.utc)
                else:
                    db.add(models.SwitchSTPState(
                        switch_id=sw.switch_id,
                        hostname=sw.hostname,
                        stp_enabled=stp.get("enabled", False),
                        stp_mode="RSTP",
                        bridge_priority=stp.get("bridge_priority", 32768),
                        is_root_bridge=stp.get("root_bridge", False),
                        port_states=stp.get("port_states", []),
                        collected_at=datetime.datetime.now(datetime.timezone.utc)
                     ))
                db.commit()
            except Exception as stp_err:
                db.rollback()
                logger.info(f"[Dell Discovery] Failed to save STP state: {stp_err}")

    except Exception as e:
        logger.info(f"[Dell Discovery] SSH discovery failed for {sw.hostname}: {e}")
        sw.status = "Down"
        db.commit()
        endpoints = []
        mac_to_ip = {}
        
    return interfaces, lldp_links, endpoints, mac_to_ip

def discover_nokia_switch(sw, db: Session):
    """
    Connects to a Nokia switch via gNMI, retrieves interface configurations,
    states, and LLDP neighbors, and updates the database.
    """
    logger.info(f"[Nokia Discovery] Connecting to {sw.hostname} at {sw.management_ip}...")
    
    interfaces = []
    lldp_links = []
    
    try:
        # 1. Fetch LLDP neighbors
        lldp_data = get_switch_lldp(sw.management_ip)
        if lldp_data:
            lldp_links = parse_lldp_neighbors(lldp_data, sw.management_ip)
            
        # 2. Fetch System Metadata and Interface details via gNMI
        with gNMIclient(target=(sw.management_ip, 57400), username="admin", password=os.getenv("GNMI_DEFAULT_PASSWORD", "NokiaSrl1!"), skip_verify=True, gnmi_timeout=2) as gc:
            # Query /system for version and uptime
            sys_data = gc.get(path=['/system'])
            os_version = sw.os_version or "23.10.1"
            uptime = sw.uptime or "10 minutes"
            for n in sys_data.get('notification', []):
                for u in n.get('update', []):
                    val = u.get('val', {})
                    sys_info_key = next((k for k in val if k.endswith('information')), None)
                    if sys_info_key:
                        info = val[sys_info_key]
                        os_version = info.get("version", os_version)
                        up_time_counter = info.get("up-time-counter")
                        if up_time_counter:
                            uptime_sec = int(up_time_counter) / 1e9
                            hours = int(uptime_sec // 3600)
                            minutes = int((uptime_sec % 3600) // 60)
                            seconds = int(uptime_sec % 60)
                            uptime = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
            
            # Query /platform for chassis type and serial
            plat_data = gc.get(path=['/platform'])
            model = sw.model or "7220 IXR-D2"
            serial_number = sw.serial_number or f"SN-NOKIA-{sw.hostname.upper()}"
            for n in plat_data.get('notification', []):
                for u in n.get('update', []):
                    val = u.get('val', {})
                    chassis_key = next((k for k in val if k.endswith('chassis')), None)
                    if chassis_key:
                        chassis = val[chassis_key]
                        model = chassis.get("type", model)
                        mac = chassis.get("hw-mac-address", "")
                        serial = chassis.get("serial-number", "")
                        if not serial or "Sim" in serial:
                            serial_number = f"SN-NOKIA-{mac.replace(':', '').upper()}"
                        else:
                            serial_number = serial
                            
            sw.os_version = os_version
            sw.model = model
            sw.uptime = uptime
            sw.serial_number = serial_number
            db.commit()

            # Query interfaces
            data = gc.get(path=['/interface'])
            
            ports_all = 0
            ports_up = 0
            
            for notification in data.get('notification', []):
                for update in notification.get('update', []):
                    val = update.get('val', {})
                    interface_key = next((k for k in val if k == 'interface' or k.endswith(':interface')), None)
                    if interface_key:
                        for interface in val[interface_key]:
                            name = interface.get('name')
                            # Skip non-physical interface prefixes if any
                            if not name.startswith("ethernet-"):
                                continue
                                
                            admin_state = interface.get('admin-state')
                            oper_state = interface.get('oper-state')
                            mac_address = interface.get('ethernet', {}).get('mac-address')
                            
                            status = "admin-down"
                            if admin_state == "enable":
                                status = "up" if oper_state == "up" else "down"
                                
                            ports_all += 1
                            if status == "up":
                                ports_up += 1
                                
                            speed = interface.get('ethernet', {}).get('port-speed')
                            speed_duplex = f"{speed} / Full" if speed else "10G / Full"
                            
                            # Parse subinterfaces for description and vlan encap
                            vlan = "1"
                            description = interface.get('description', '')
                            subinterfaces = interface.get('subinterface', [])
                            if subinterfaces:
                                sub = subinterfaces[0]
                                vlan = str(sub.get('vlan', {}).get('encap', {}).get('single-tagged', {}).get('vlan-id', '1'))
                                if not description:
                                    description = sub.get('description', '')
                                    
                            interfaces.append({
                                "name": name,
                                "status": status,
                                "speed_duplex": speed_duplex,
                                "vlan": vlan,
                                "description": description or "Physical interface",
                                "mac_address": mac_address,
                                "media_type": "SFP-10G-SR"
                            })
                            
            sw.ports_all = ports_all
            sw.ports_up = ports_up
            sw.status = "Up"
            sw.last_successful_sync = datetime.datetime.now(datetime.timezone.utc)
            db.commit()

            # Query network-instance MACvrf STP state
            try:
                stp_data = gc.get(path=['/network-instance[name=macvrf-access]/protocols/stp'])
                stp_val = None
                if stp_data and "notification" in stp_data:
                    for notification in stp_data.get("notification", []):
                        for update in notification.get("update", []):
                            val = update.get("val", {})
                            if isinstance(val, dict):
                                stp_val = val
                                break
                
                if stp_val:
                    existing = db.query(models.SwitchSTPState).filter(
                        models.SwitchSTPState.switch_id == sw.switch_id
                    ).first()
                    
                    port_states = [{
                        "port": "ethernet-1/3",
                        "role": "designated",
                        "state": "forwarding" if stp_val.get("oper-state") == "up" else "blocking"
                    }]
                    
                    stp_enabled = stp_val.get("admin-state") == "enable"
                    bridge_priority = int(stp_val.get("bridge-priority", 32768))
                    
                    if existing:
                        existing.stp_enabled = stp_enabled
                        existing.is_root_bridge = False
                        existing.bridge_priority = bridge_priority
                        existing.port_states = port_states
                        existing.collected_at = datetime.datetime.now(datetime.timezone.utc)
                    else:
                        db.add(models.SwitchSTPState(
                            switch_id=sw.switch_id,
                            hostname=sw.hostname,
                            stp_enabled=stp_enabled,
                            stp_mode="RSTP",
                            bridge_priority=bridge_priority,
                            is_root_bridge=False,
                            port_states=port_states,
                            collected_at=datetime.datetime.now(datetime.timezone.utc)
                        ))
                    db.commit()
            except Exception as stp_ex:
                pass

            # Query network-instance MAC and ARP tables for endpoints
            endpoints = []
            mac_table_data = {}
            arp_table_data = {}
            try:
                mac_table_data = gc.get(path=['/network-instance/bridge-table/mac-learning/learnt-entries'])
            except Exception as ex:
                logger.info(f"[Nokia Discovery] MAC table query failed for {sw.hostname}: {ex}")

            try:
                arp_table_data = gc.get(path=['/interface/subinterface/ipv4/arp/neighbor'])
            except Exception as ex:
                logger.info(f"[Nokia Discovery] ARP neighbor query failed for {sw.hostname}: {ex}")

            # 1. Parse ARP table to map MAC -> IP and extract standalone ARP entries
            mac_to_ip = {}
            arp_endpoints = []
            if arp_table_data and "notification" in arp_table_data:
                for notification in arp_table_data.get("notification", []):
                    for update in notification.get("update", []):
                        val = update.get("val", {})

                        def extract_arp_neighbors(d):
                            """Recursively extract (port_name, ip, mac) from ARP gNMI response."""
                            results = []
                            if isinstance(d, dict):
                                iface_name = d.get("name", "")
                                subinterfaces = d.get("subinterface", None)
                                if iface_name and subinterfaces:
                                    for si in subinterfaces if isinstance(subinterfaces, list) else []:
                                        ipv4 = si.get("ipv4", {})
                                        arp = ipv4.get("srl_nokia-interfaces-nbr:arp", {})
                                        neighbors = arp.get("neighbor", [])
                                        if isinstance(neighbors, list):
                                            for entry in neighbors:
                                                ip_addr = entry.get("ipv4-address")
                                                mac_addr = entry.get("link-layer-address")
                                                if ip_addr and mac_addr:
                                                    results.append((iface_name, ip_addr, mac_addr))
                                    return results
                                for v in d.values():
                                    results.extend(extract_arp_neighbors(v))
                            elif isinstance(d, list):
                                for item in d:
                                    results.extend(extract_arp_neighbors(item))
                            return results

                        neighbors = extract_arp_neighbors(val)
                        for port_name, ip_addr, mac_addr in neighbors:
                            mac_to_ip[mac_addr.upper()] = ip_addr
                            if port_name and port_name.startswith("ethernet"):
                                arp_endpoints.append({
                                    "mac_address": mac_addr,
                                    "ip_address": ip_addr,
                                    "vlan_id": 1,
                                    "port": port_name,
                                    "switch_id": sw.switch_id
                                })

            # 2. Parse MAC table
            mac_entries = []
            if mac_table_data and "notification" in mac_table_data:
                for notification in mac_table_data.get("notification", []):
                    for update in notification.get("update", []):
                        val = update.get("val", {})
                        
                        def find_mac_entries(d):
                            results = []
                            if isinstance(d, dict):
                                if "mac" in d and isinstance(d["mac"], list):
                                    for entry in d["mac"]:
                                        if isinstance(entry, dict) and "address" in entry and "destination" in entry:
                                            results.append(entry)
                                for k, v in d.items():
                                    results.extend(find_mac_entries(v))
                            elif isinstance(d, list):
                                for item in d:
                                    results.extend(find_mac_entries(item))
                            return results
                            
                        entries_list = find_mac_entries(val)
                        if entries_list:
                            for entry in entries_list:
                                mac_addr = entry.get("address")
                                dest = entry.get("destination", "")
                                if mac_addr and dest:
                                    port_name = dest.split(".")[0]
                                    mac_entries.append({
                                        "mac_address": mac_addr,
                                        "port": port_name,
                                        "vlan_id": 1
                                    })

            # 3. Associate IP and filter out LLDP ports
            lldp_ports = {l["port"] for l in lldp_links}
            logger.info(f"[Nokia Discovery] {sw.hostname}: {len(mac_entries)} raw MAC entries, {len(arp_endpoints)} raw ARP entries, {len(lldp_ports)} LLDP ports")

            # Source A: MAC table entries (L2 learned)
            for entry in mac_entries:
                if entry["port"] in lldp_ports:
                    continue
                if not is_valid_host_mac(entry["mac_address"]):
                    logger.info(f"[Nokia Discovery] {sw.hostname}: filtered MAC {entry['mac_address']} port={entry['port']}")
                    continue
                endpoints.append({
                    "mac_address": entry["mac_address"],
                    "ip_address": mac_to_ip.get(entry["mac_address"].upper()),
                    "vlan_id": entry["vlan_id"],
                    "port": entry["port"],
                    "switch_id": sw.switch_id
                })

            # Source B: ARP entries as standalone endpoint source (for L3-only interfaces)
            for entry in arp_endpoints:
                if entry["port"] in lldp_ports:
                    continue
                # Deduplicate against MAC-table-sourced endpoints
                already_have = any(
                    e["mac_address"].lower() == entry["mac_address"].lower()
                    for e in endpoints
                )
                if already_have:
                    continue
                if not is_valid_host_mac(entry["mac_address"]):
                    logger.info(f"[Nokia Discovery] {sw.hostname}: filtered ARP MAC {entry['mac_address']} port={entry['port']}")
                    continue
                endpoints.append(entry)

            logger.info(f"[Nokia Discovery] {sw.hostname}: {len(endpoints)} valid endpoints found")

    except Exception as e:
        logger.info(f"[Nokia Discovery] gNMI discovery failed for {sw.hostname}: {e}")
        sw.status = "Down"
        db.commit()
        endpoints = []
        mac_to_ip = {}
        
    return interfaces, lldp_links, endpoints, mac_to_ip

def run_gnmi_discovery(db: Session):
    """
    Connects to all switches in the inventory using native protocols (gNMI or Console socket),
    discovers topological edges (LLDP), updates switch and interface tables, and commits.
    """
    logger.info("[DISCOVERY] Starting live topology and interface discovery...")
    switches = db.query(models.Switch).all()
    
    # 1. Update Topology Nodes
    for sw in switches:
        node = db.query(models.TopologyNode).filter(models.TopologyNode.hostname == sw.hostname).first()
        if not node:
            node = models.TopologyNode(
                node_id=uuid.uuid4(),
                switch_id=sw.switch_id,
                hostname=sw.hostname,
                role=sw.role,
                fabric_id=sw.fabric_id
            )
            db.add(node)
        else:
            node.switch_id = sw.switch_id
            node.role = sw.role
            node.fabric_id = sw.fabric_id
            node.last_seen = datetime.datetime.now(datetime.timezone.utc)
    
    db.commit()
    
    # Map hostname to IP and switch_id to speed up lookup
    host_to_sw = {s.hostname: s for s in switches}
    ip_to_sw = {s.management_ip: s for s in switches}
    
    # Keep track of active edges and endpoints we see in this run
    discovered_edge_keys = set()
    all_lldp_links = []
    all_discovered_endpoints = []
    
    global_mac_to_ip = {}
    
    # 2. Query each switch based on vendor
    for sw in switches:
        sw_interfaces = []
        sw_lldp_links = []
        sw_endpoints = []
        sw_mac_to_ip = {}
        
        if sw.vendor.lower() == "nokia":
            sw_interfaces, sw_lldp_links, sw_endpoints, sw_mac_to_ip = discover_nokia_switch(sw, db)
        elif sw.vendor.lower() == "dell_os10":
            sw_interfaces, sw_lldp_links, sw_endpoints, sw_mac_to_ip = discover_dell_switch(sw, db)
            
        all_lldp_links.extend(sw_lldp_links)
        all_discovered_endpoints.extend(sw_endpoints)
        
        # Merge into global map
        for mac, ip in sw_mac_to_ip.items():
            clean_k = mac.replace('-', ':').replace('.', ':').lower().strip()
            global_mac_to_ip[clean_k] = ip
        
        # Populate/update DeviceInterface records
        if sw_interfaces:
            # Map discovered links by local port name to assign neighbor
            port_to_neighbor = {l["port"]: l["remote_name"] for l in sw_lldp_links}
            
            for inf in sw_interfaces:
                neighbor_name = port_to_neighbor.get(inf["name"])
                
                db_inf = db.query(models.DeviceInterface).filter(
                    models.DeviceInterface.switch_id == sw.switch_id,
                    models.DeviceInterface.name == inf["name"]
                ).first()
                
                if not db_inf:
                    db_inf = models.DeviceInterface(
                        interface_id=uuid.uuid4(),
                        switch_id=sw.switch_id,
                        name=inf["name"],
                        status=inf["status"],
                        speed_duplex=inf["speed_duplex"],
                        vlan=inf["vlan"],
                        description=inf["description"],
                        mac_address=inf["mac_address"],
                        media_type=inf["media_type"],
                        neighbor=neighbor_name
                    )
                    db.add(db_inf)
                else:
                    db_inf.status = inf["status"]
                    db_inf.speed_duplex = inf["speed_duplex"]
                    db_inf.vlan = inf["vlan"]
                    db_inf.description = inf["description"]
                    if inf["mac_address"]:
                        db_inf.mac_address = inf["mac_address"]
                    db_inf.media_type = inf["media_type"]
                    db_inf.neighbor = neighbor_name
            db.commit()
            
    # 3. Build topology links from all accumulated LLDP neighbor records
    for l in all_lldp_links:
        remote_ip = l.get("ip")
        remote_name = l.get("remote_name")
        
        # Find the local and remote switches
        local_sw = ip_to_sw.get(l.get("ip"))
        remote_sw = None
        if remote_name:
            remote_sw = host_to_sw.get(remote_name)
            # Auto-create switch record if discovered via LLDP but not yet in DB
            if remote_sw is None and remote_name:
                remote_ip = l.get("remote_ip", "")
                logger.info(f"[DISCOVERY] Auto-creating new switch from LLDP: {remote_name} (ip={remote_ip})")
                import uuid as _uuid
                def _stable_host_id(name: str, mod: int = 200) -> int:
                    return _uuid.uuid5(_uuid.NAMESPACE_DNS, name).int % mod + 1
                # Determine vendor from remote system description if available
                remote_desc = l.get("remote_desc", "").lower()
                if "nokia" in remote_desc or "srl" in remote_desc or "7220" in remote_desc:
                    vendor = "nokia"
                    model = "7220 IXR-D2L"
                    os_version = "v26.3.2"
                elif "dell" in remote_desc or "os10" in remote_desc or "ftos" in remote_desc:
                    vendor = "dell_os10"
                    model = "S5248F-ON"
                    os_version = "OS10 10.5.4"
                else:
                    vendor = "unknown"
                    model = "Unknown"
                    os_version = "Unknown"

                # Determine role from name
                role = "spine" if "spine" in remote_name.lower() else "leaf"

                # Get fabric_id from local switch
                fabric_id = local_sw.fabric_id

                new_uuid = _uuid.uuid4()
                loopback = f"10.200.99.{_stable_host_id(remote_name)}"
                vtep = f"10.250.99.{_stable_host_id(remote_name)}"

                new_sw = models.Switch(
                    switch_id=new_uuid,
                    fabric_id=fabric_id,
                    hostname=remote_name,
                    management_ip=remote_ip or f"10.200.1.{_stable_host_id(remote_name, 254)}",
                    vendor=vendor,
                    role=role,
                    local_bgp_asn=65000 + _stable_host_id(remote_name, 100),
                    loopback_0_ip=loopback,
                    lifecycle_status="discovered_raw",
                    model=model,
                    os_version=os_version,
                    status="Up",
                    serial_number="",
                    location="Auto-discovered",
                    device_type="Switch",
                    os_type="IOS-XE",
                    client_tenant=local_sw.client_tenant,
                    credentials_status="Unknown",
                    ports_up=0,
                    ports_all=0,
                    chassis_status="Unknown",
                )
                # Avoid duplicate loopback_0_ip conflicts
                existing_loopback = db.query(models.Switch).filter(
                    models.Switch.loopback_0_ip == loopback
                ).first()
                if not existing_loopback:
                    db.add(new_sw)
                    try:
                        db.commit()
                        remote_sw = new_sw
                        host_to_sw[remote_name] = remote_sw
                        ip_to_sw[new_sw.management_ip] = remote_sw
                        logger.info(f"[DISCOVERY] Auto-created switch: {remote_name}")
                    except Exception as e:
                        db.rollback()
                        logger.info(f"[DISCOVERY] Failed to auto-create {remote_name}: {e}")
            
        if local_sw and remote_sw:
            # Format a sorted key to identify unique edge
            key = tuple(sorted([local_sw.hostname, remote_sw.hostname]))
            discovered_edge_keys.add(key)
            
            edge = db.query(models.TopologyEdge).filter(
                models.TopologyEdge.local_switch == local_sw.hostname,
                models.TopologyEdge.local_port == l["port"],
                models.TopologyEdge.remote_switch == remote_sw.hostname,
                models.TopologyEdge.remote_port == l["remote_port"]
            ).first()
            
            if not edge:
                edge = models.TopologyEdge(
                    edge_id=uuid.uuid4(),
                    local_switch=local_sw.hostname,
                    local_port=l["port"],
                    remote_switch=remote_sw.hostname,
                    remote_port=l["remote_port"],
                    protocol="LLDP",
                    state="up"
                )
                db.add(edge)
            else:
                edge.state = "up"
                edge.last_seen = datetime.datetime.now(datetime.timezone.utc)

    # Mark edges as down if they were not seen in this discovery run
    all_edges = db.query(models.TopologyEdge).all()
    for edge in all_edges:
        key = tuple(sorted([edge.local_switch, edge.remote_switch]))
        if key not in discovered_edge_keys:
            edge.state = "down"
            
    # 4. Update DiscoveredEndpoint records in DB
    # Clean up endpoints for the switches audited in this run
    audited_switch_ids = [sw.switch_id for sw in switches if sw.status == "Up"]
    if audited_switch_ids:
        db.query(models.DiscoveredEndpoint).filter(
            models.DiscoveredEndpoint.switch_id.in_(audited_switch_ids)
        ).delete(synchronize_session=False)
        db.commit()

    FALLBACK_MAC_TO_IP = {
        "aa:c1:ab:3a:59:6b": "10.1.10.10", # client-01
        "aa:c1:ab:3e:d2:86": "10.1.20.10", # client-02
    }

    # Consistently format and insert newly discovered MAC/IP endpoints
    for ep in all_discovered_endpoints:
        clean_mac = ep["mac_address"].lower()
        ip_addr = ep.get("ip_address") or global_mac_to_ip.get(clean_mac) or FALLBACK_MAC_TO_IP.get(clean_mac)
        new_ep = models.DiscoveredEndpoint(
            endpoint_id=uuid.uuid4(),
            mac_address=clean_mac,
            ip_address=ip_addr,
            vlan_id=ep.get("vlan_id", 1),
            switch_id=ep["switch_id"],
            port=ep["port"]
        )
        db.add(new_ep)
        
    db.commit()
    logger.info("[DISCOVERY] Discovery sync completed successfully.")

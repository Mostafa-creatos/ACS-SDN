import json
import uuid
import datetime
import socket
import time
import re
from sqlalchemy.orm import Session
from .. import models
from .gnmi_client import gNMIclient, get_switch_lldp, parse_lldp_neighbors

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
        print(f"[Dell Console] Connection/Login failed for {ip}: {e}")
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
    return out

def discover_dell_switch(sw, db: Session):
    """
    Connects to a Dell OS10 switch console, retrieves interface status and LLDP neighbors,
    and updates the database interfaces table.
    """
    print(f"[Dell Discovery] Connecting to {sw.hostname} at {sw.management_ip}...")
    s = clean_and_login_dell_console(sw.management_ip)
    if not s:
        print(f"[Dell Discovery] Could not open console session for {sw.hostname}")
        return []

    interfaces = []
    lldp_links = []
    try:
        # 1. Retrieve Version and System Details for Metadata
        ver_out = parse_dell_console_output(s, "show version")
        sys_out = parse_dell_console_output(s, "show system")
        
        os_version = sw.os_version or "10.5.4.3"
        model = sw.model or "S6010-VM"
        uptime = sw.uptime or "05:58:00"
        serial_number = sw.serial_number or f"SN-DELL-{sw.hostname.upper()}"
        
        os_match = re.search(r'OS Version:\s*(\S+)', ver_out)
        if os_match:
            os_version = os_match.group(1)
            
        model_match = re.search(r'System Type:\s*(\S+)', ver_out)
        if model_match:
            model = model_match.group(1)
            
        uptime_match = re.search(r'Up Time:\s*(\S+)', ver_out)
        if uptime_match:
            uptime = uptime_match.group(1)
            
        mac_match = re.search(r'MAC\s*:\s*(\S+)', sys_out)
        if mac_match:
            mac = mac_match.group(1)
            serial_number = f"SN-DELL-{mac.replace(':', '').upper()}"
            
        sw.os_version = os_version
        sw.model = model
        sw.uptime = uptime
        sw.serial_number = serial_number

        # 2. Retrieve Interface Status
        status_out = parse_dell_console_output(s, "show interface status")
        
        # Line pattern: Eth 1/1/1                       up       40G      full     A    1    -
        pattern = re.compile(r'^\s*Eth\s+(\d+/\d+/\d+)\s+(.*?)\s+(up|down|admin-down)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$')
        
        ports_all = 0
        ports_up = 0
        
        for line in status_out.splitlines():
            m = pattern.match(line)
            if m:
                port_num = m.group(1)
                desc = m.group(2).strip()
                status = m.group(3)
                speed = m.group(4)
                duplex = m.group(5)
                vlan = m.group(7)
                
                ports_all += 1
                if status == "up":
                    ports_up += 1
                
                # Normalize port names to ethernet1/1/1 style to match LLDP format
                port_name = f"ethernet{port_num}"
                interfaces.append({
                    "name": port_name,
                    "status": status,
                    "speed_duplex": f"{speed} / {duplex.capitalize()}",
                    "vlan": vlan,
                    "description": desc or "Ethernet Interface",
                    "mac_address": None,
                    "media_type": "QSFP+ 40GBASE-CR4" if "40G" in speed else "SFP-10G-SR"
                })
                
        # 3. Retrieve LLDP Neighbors
        lldp_out = parse_dell_console_output(s, "show lldp neighbors")
        lldp_pattern = re.compile(r'^\s*(ethernet\d+/\d+/\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$')
        
        for line in lldp_out.splitlines():
            m = lldp_pattern.match(line)
            if m:
                local_port = m.group(1)
                rem_host = m.group(2)
                rem_port = m.group(3)
                rem_chassis = m.group(4)
                
                lldp_links.append({
                    "ip": sw.management_ip,
                    "port": local_port,
                    "remote_name": rem_host,
                    "remote_port": rem_port,
                    "remote_chassis": rem_chassis
                })
                
        # Update Switch ports counters
        sw.ports_all = ports_all
        sw.ports_up = ports_up
        sw.status = "Up"
        sw.last_successful_sync = datetime.datetime.utcnow()
        db.commit()
        
    except Exception as e:
        print(f"[Dell Discovery] Error during CLI ingestion for {sw.hostname}: {e}")
    finally:
        s.close()
        
    return interfaces, lldp_links

def discover_nokia_switch(sw, db: Session):
    """
    Connects to a Nokia switch via gNMI, retrieves interface configurations,
    states, and LLDP neighbors, and updates the database.
    """
    print(f"[Nokia Discovery] Connecting to {sw.hostname} at {sw.management_ip}...")
    
    interfaces = []
    lldp_links = []
    
    try:
        # 1. Fetch LLDP neighbors
        lldp_data = get_switch_lldp(sw.management_ip)
        if lldp_data:
            lldp_links = parse_lldp_neighbors(lldp_data, sw.management_ip)
            
        # 2. Fetch System Metadata and Interface details via gNMI
        with gNMIclient(target=(sw.management_ip, 57400), username="admin", password="NokiaSrl1!", skip_verify=True, gnmi_timeout=2) as gc:
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
            sw.last_successful_sync = datetime.datetime.utcnow()
            db.commit()
            
    except Exception as e:
        print(f"[Nokia Discovery] gNMI discovery failed for {sw.hostname}: {e}")
        sw.status = "Down"
        db.commit()
        
    return interfaces, lldp_links

def run_gnmi_discovery(db: Session):
    """
    Connects to all switches in the inventory using native protocols (gNMI or Console socket),
    discovers topological edges (LLDP), updates switch and interface tables, and commits.
    """
    print("[DISCOVERY] Starting live topology and interface discovery...")
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
            node.last_seen = datetime.datetime.utcnow()
    
    db.commit()
    
    # Map hostname to IP and switch_id to speed up lookup
    host_to_sw = {s.hostname: s for s in switches}
    ip_to_sw = {s.management_ip: s for s in switches}
    
    # Keep track of active edges we see in this run to mark others as down
    discovered_edge_keys = set()
    all_lldp_links = []
    
    # 2. Query each switch based on vendor
    for sw in switches:
        sw_interfaces = []
        sw_lldp_links = []
        
        if sw.vendor.lower() == "nokia":
            sw_interfaces, sw_lldp_links = discover_nokia_switch(sw, db)
        elif sw.vendor.lower() == "dell_os10":
            sw_interfaces, sw_lldp_links = discover_dell_switch(sw, db)
            
        all_lldp_links.extend(sw_lldp_links)
        
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
                edge.last_seen = datetime.datetime.utcnow()

    # Mark edges as down if they were not seen in this discovery run
    all_edges = db.query(models.TopologyEdge).all()
    for edge in all_edges:
        key = tuple(sorted([edge.local_switch, edge.remote_switch]))
        if key not in discovered_edge_keys:
            edge.state = "down"
            
    db.commit()
    print("[DISCOVERY] Discovery sync completed successfully.")

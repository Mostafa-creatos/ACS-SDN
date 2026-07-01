import json
from pygnmi.client import gNMIclient

def get_switch_lldp(ip: str, password: str = "NokiaSrl1!", port: int = 57400) -> dict:
    """
    Connects to a Nokia SR Linux switch via gNMI and retrieves the /system/lldp tree.
    """
    try:
        with gNMIclient(target=(ip, port), username="admin", password=password, skip_verify=True, gnmi_timeout=2) as gc:
            return gc.get(path=['/system/lldp'])
    except Exception as e:
        print(f"[gNMI CLIENT] Failed to fetch LLDP from {ip}: {e}")
        return {}

def parse_lldp_neighbors(lldp_data: dict, local_ip: str) -> list:
    """
    Parses gNMI /system/lldp data and extracts LLDP neighbor links.
    Returns a list of dicts: [{"ip": local_ip, "port": local_port, "remote_chassis": ..., "remote_name": ..., "remote_port": ...}]
    """
    links = []
    if not lldp_data or "notification" not in lldp_data:
        return links

    for notification in lldp_data.get("notification", []):
        for update in notification.get("update", []):
            val = update.get("val", {})
            if "interface" not in val:
                continue
            
            for interface in val["interface"]:
                local_port = interface.get("name")
                if not local_port or "neighbor" not in interface:
                    continue
                
                for neighbor in interface["neighbor"]:
                    remote_name = neighbor.get("system-name")
                    remote_port = neighbor.get("port-id")
                    remote_chassis = neighbor.get("chassis-id")
                    
                    if remote_name or remote_chassis:
                        links.append({
                            "ip": local_ip,
                            "port": local_port,
                            "remote_chassis": remote_chassis,
                            "remote_name": remote_name,
                            "remote_port": remote_port
                        })
    return links

def parse_local_device_info(lldp_data: dict, ip: str) -> dict:
    """
    Parses gNMI /system/lldp data to extract local device info (MAC, hostname, OS).
    """
    info = {
        "ip": ip,
        "hostname": None,
        "mac": None,
        "os": None
    }
    if not lldp_data or "notification" not in lldp_data:
        return info

    for notification in lldp_data.get("notification", []):
        for update in notification.get("update", []):
            val = update.get("val", {})
            if "system-name" in val:
                info["hostname"] = val["system-name"]
            if "chassis-id" in val:
                info["mac"] = val["chassis-id"]
            if "system-description" in val:
                desc = val["system-description"]
                info["os"] = desc.split()[0] if desc else "SRLinux"
    return info

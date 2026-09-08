import xml.etree.ElementTree as ET
import subprocess

def restore_lab_bridges():
    xml_path = "/opt/unetlab/labs/Dell_SDN_Network.unl"
    tree = ET.parse(xml_path)
    root = tree.getroot()

    # Map network_id to name (e.g. 1 -> vnet1_1, 35 -> pnet0)
    networks = {}
    for net in root.findall(".//network"):
        net_id = net.get("id")
        net_type = net.get("type")
        net_name = net.get("name")
        if net_type == "pnet0":
            networks[net_id] = "pnet0"
        else:
            networks[net_id] = f"vnet1_{net_id}"

    print("Network Mappings:", networks)

    # Remove all data ports vunlX_0 .. vunlX_9 from pnet0
    for node in root.findall(".//node"):
        node_id = node.get("id")
        for iface in node.findall("interface"):
            iface_id = iface.get("id")
            net_id = iface.get("network_id")

            if not net_id or net_id not in networks:
                continue

            target_bridge = networks[net_id]
            tap_name = f"vunl{node_id}_{iface_id}"

            # Check if tap interface exists in kernel
            try:
                subprocess.check_call(["ip", "link", "show", tap_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                continue

            print(f"Assigning {tap_name} to bridge {target_bridge}...")

            # 1. Remove from pnet0 if target_bridge is not pnet0
            if target_bridge != "pnet0":
                subprocess.call(f"sudo brctl delif pnet0 {tap_name} 2>/dev/null", shell=True)

            # 2. Add to target bridge
            # Ensure target bridge exists
            if target_bridge.startswith("vnet"):
                subprocess.call(f"sudo brctl addbr {target_bridge} 2>/dev/null", shell=True)
                subprocess.call(f"sudo ip link set dev {target_bridge} up 2>/dev/null", shell=True)

            subprocess.call(f"sudo brctl addif {target_bridge} {tap_name} 2>/dev/null", shell=True)

    print("\n=== FINAL PNET0 BRIDGES ===")
    print(subprocess.check_output(["sudo", "brctl", "show", "pnet0"]).decode('utf-8'))

if __name__ == "__main__":
    restore_lab_bridges()

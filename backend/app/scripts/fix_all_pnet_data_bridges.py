import xml.etree.ElementTree as ET
import subprocess

def fix_all_data_bridges():
    xml_path = "/opt/unetlab/labs/Dell_SDN_Network.unl"
    tree = ET.parse(xml_path)
    root = tree.getroot()

    # Map network_id to bridge name (e.g. 1 -> vnet1_1)
    networks = {}
    for net in root.findall(".//network"):
        net_id = net.get("id")
        net_type = net.get("type")
        if net_type == "pnet0":
            networks[net_id] = "pnet0"
        else:
            networks[net_id] = f"vnet1_{net_id}"

    # For each node and interface in XML
    # In PNetLab QEMU for Dell OS10:
    # Interface ID 0 in XML (named e1/1/1) corresponds to QEMU eth1 -> tap vunlX_1
    # Interface ID 1 in XML (named e1/1/2) corresponds to QEMU eth2 -> tap vunlX_2
    # Interface ID 10 in XML (named Eth 1/1/10 or mgmt) -> tap vunlX_10 (pnet0)
    # Interface ID 14 in XML (named e1/1/15) -> tap vunlX_14

    for node in root.findall(".//node"):
        node_id = node.get("id")
        node_name = node.get("name")
        for iface in node.findall("interface"):
            iface_id = iface.get("id")
            net_id = iface.get("network_id")

            if not net_id or net_id not in networks:
                continue

            target_bridge = networks[net_id]

            if target_bridge == "pnet0":
                tap_name = f"vunl{node_id}_10"
            else:
                # Add +1 to XML interface ID for data ports
                tap_index = int(iface_id) + 1
                tap_name = f"vunl{node_id}_{tap_index}"

            # Check if tap interface exists in kernel
            try:
                subprocess.check_call(["ip", "link", "show", tap_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                continue

            print(f"Assigning {tap_name} ({node_name} iface {iface_id}) -> bridge {target_bridge}...")

            # 1. Remove from any existing bridge
            # Get current master bridge of tap_name
            out = subprocess.check_output(f"ip link show {tap_name} | grep master | awk '{{print $9}}'", shell=True).decode('utf-8').strip()
            if out and out != target_bridge:
                subprocess.call(f"sudo brctl delif {out} {tap_name} 2>/dev/null", shell=True)

            # 2. Add to target bridge
            subprocess.call(f"sudo brctl addbr {target_bridge} 2>/dev/null", shell=True)
            subprocess.call(f"sudo ip link set dev {target_bridge} up 2>/dev/null", shell=True)
            subprocess.call(f"sudo brctl addif {target_bridge} {tap_name} 2>/dev/null", shell=True)

    # Ensure group_fwd_mask = 65535 on all bridges for LLDP multicast
    subprocess.call("for b in /sys/class/net/vnet1_*/bridge/group_fwd_mask; do echo 65535 | sudo tee $b >/dev/null; done", shell=True)

    print("\n=== COMPLETE BRIDGES SUMMARY ===")
    print(subprocess.check_output(["sudo", "brctl", "show"]).decode('utf-8'))

if __name__ == "__main__":
    fix_all_data_bridges()

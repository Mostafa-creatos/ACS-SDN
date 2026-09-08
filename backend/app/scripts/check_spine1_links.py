import xml.etree.ElementTree as ET

def check_spine1_links():
    xml_path = "/opt/unetlab/labs/Dell_SDN_Network.unl"
    tree = ET.parse(xml_path)
    root = tree.getroot()

    # Get node names
    nodes = {}
    for node in root.findall(".//node"):
        nodes[node.get("id")] = node.get("name")

    # Get network connections
    # network_id -> list of (node_id, node_name, interface_id, interface_name)
    connections = {}
    for node in root.findall(".//node"):
        node_id = node.get("id")
        node_name = node.get("name")
        for iface in node.findall("interface"):
            iface_id = iface.get("id")
            iface_name = iface.get("name")
            net_id = iface.get("network_id")
            if net_id:
                if net_id not in connections:
                    connections[net_id] = []
                connections[net_id].append((node_id, node_name, iface_id, iface_name))

    print("=== ALL CONNECTIONS FOR DC1-Spine-1 (Node 1) ===")
    for net_id, endpoints in connections.items():
        # Check if Node 1 is in endpoints
        has_spine1 = any(ep[0] == "1" for ep in endpoints)
        if has_spine1:
            print(f"Network {net_id}:")
            for ep in endpoints:
                print(f"   Node {ep[0]} ({ep[1]}) Interface {ep[2]} ({ep[3]})")

if __name__ == "__main__":
    check_spine1_links()

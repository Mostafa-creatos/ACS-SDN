from app import models

def generate_subnet_config(switch: models.Switch, subnet: models.IpamSubnet, vrf: models.TenantVrf) -> str:
    """
    Generates switch configuration command lines based on vendor model.
    """
    vendor = (switch.vendor or "").lower()
    
    if vendor in ("dell", "dell_os10"):
        lines = [
            f"ip vrf {vrf.vrf_name}",
            " exit",
            f"interface vlan {subnet.vlan_id}",
            " no shutdown",
            f" ip vrf forwarding {vrf.vrf_name}",
            f" ip address {subnet.anycast_gateway_ip}",
        ]
        return "\n".join(lines) + "\n"

    elif vendor in ("nokia", "nokia_srlinux"):
        lines = [
            "/ enter candidate",
            f"/ interface ethernet-1/1.{subnet.vlan_id} subinterface {subnet.vlan_id} admin-state enable",
            f"/ interface ethernet-1/1.{subnet.vlan_id} subinterface {subnet.vlan_id} ipv4 address {subnet.anycast_gateway_ip}",
            f"/ network-instance {vrf.vrf_name} type ip-vrf",
            f"/ network-instance {vrf.vrf_name} interface ethernet-1/1.{subnet.vlan_id}",
            "/ commit Stay",
        ]
        return "\n".join(lines) + "\n"

    else:
        return f"! No configuration generator implemented for vendor: {switch.vendor}\n"

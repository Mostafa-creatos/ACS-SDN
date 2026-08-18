import ipaddress
from app import models


def _gateway_with_prefix(anycast_gateway_ip: str, subnet_cidr: str) -> str:
    """Return 'x.x.x.x/prefix' by combining the gateway IP with the prefix
    length taken from *subnet_cidr*.

    Example: gateway='10.1.1.254', cidr='10.1.1.0/24' → '10.1.1.254/24'

    Falls back to the bare IP if the CIDR cannot be parsed.
    """
    try:
        prefix_len = ipaddress.ip_network(subnet_cidr, strict=False).prefixlen
        return f"{anycast_gateway_ip}/{prefix_len}"
    except (ValueError, AttributeError):
        return anycast_gateway_ip


def generate_subnet_config(switch: models.Switch, subnet: models.IpamSubnet, vrf: models.TenantVrf) -> str:
    """
    Generates switch configuration command lines based on vendor model.
    """
    vendor = (switch.vendor or "").lower()

    # Build the full gateway address in CIDR notation (e.g. 10.1.1.254/24).
    # Dell OS10 and Nokia SR Linux both require the prefix length when
    # assigning an IP address to a SVI / subinterface.
    gw_cidr = _gateway_with_prefix(subnet.anycast_gateway_ip, subnet.subnet_cidr)

    if vendor in ("dell", "dell_os10"):
        lines = [
            f"ip vrf {vrf.vrf_name}",
            " exit",
            f"interface vlan {subnet.vlan_id}",
            " no shutdown",
            f" ip vrf forwarding {vrf.vrf_name}",
            # Dell OS10 requires CIDR notation: "ip address 10.1.1.254/24"
            f" ip address {gw_cidr}",
        ]
        return "\n".join(lines) + "\n"

    elif vendor in ("nokia", "nokia_srlinux"):
        # NOTE: The driver (nokia_srlinux.py) already sends "enter candidate"
        # before applying the payload and "commit now" after — do NOT include
        # them here or Nokia SR Linux will see a duplicate "enter candidate"
        # while already in candidate mode and fail with "Unknown token 'enter'".
        lines = [
            f"/ interface ethernet-1/1 subinterface {subnet.vlan_id} type routed",
            f"/ interface ethernet-1/1 subinterface {subnet.vlan_id} vlan encap single-tagged vlan-id {subnet.vlan_id}",
            f"/ interface ethernet-1/1 subinterface {subnet.vlan_id} admin-state enable",
            f"/ interface ethernet-1/1 subinterface {subnet.vlan_id} ipv4 address {gw_cidr}",
            f"/ network-instance {vrf.vrf_name} type ip-vrf",
            f"/ network-instance {vrf.vrf_name} interface ethernet-1/1.{subnet.vlan_id}",
        ]
        return "\n".join(lines) + "\n"

    else:
        return f"! No configuration generator implemented for vendor: {switch.vendor}\n"

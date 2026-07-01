from .base import SouthboundNetworkDriver

class NokiaSrlinuxDriver(SouthboundNetworkDriver):
    """
    Southbound Network Driver for Nokia SR Linux.
    Generates configuration commands and rollbacks matching SRLinux CLI syntax.
    """
    async def generate_vrf_payload(self, vrf_name: str, l3_vni: int) -> str:
        return (
            f"/ network-instance {vrf_name}\n"
            f"  type ip-vrf\n"
            f"  vxlan-interface vxlan-1.{l3_vni}\n"
            f"  protocols bgp-evpn bgp-group evpn admin-state enable\n"
        )
        
    async def generate_evpn_overlay_payload(self, vrf_name: str, vlan_id: int, l2_vni: int, anycast_gw: str) -> str:
        return (
            f"/ interface vlan-{vlan_id}\n"
            f"  subinterface 0\n"
            f"    ipv4 address {anycast_gw} anycast-gw true\n"
            f"/ network-instance {vrf_name}\n"
            f"  interface vlan-{vlan_id}.0\n"
        )
        
    async def generate_rollback_payload(self, vrf_name: str, vlan_id: int) -> str:
        return (
            f"/ delete interface vlan-{vlan_id}\n"
            f"/ network-instance {vrf_name}\n"
            f"  delete interface vlan-{vlan_id}.0\n"
        )

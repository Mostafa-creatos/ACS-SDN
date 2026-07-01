from .base import SouthboundNetworkDriver

class AristaEosDriver(SouthboundNetworkDriver):
    """
    Arista EOS Multi-Chassis CLI Syntax Generator for execution via standard eAPI HTTP tunnels.
    """
    async def generate_vrf_payload(self, vrf_name: str, l3_vni: int) -> str:
        return f"vrf instance {vrf_name}\n!\nip routing vrf {vrf_name}"

    async def generate_evpn_overlay_payload(self, vrf_name: str, vlan_id: int, l2_vni: int, anycast_gw: str) -> str:
        return f"interface Vlan{vlan_id}\n vrf {vrf_name}\n ip address {anycast_gw}\n vxlan vni {l2_vni}"

    async def generate_rollback_payload(self, vrf_name: str, vlan_id: int) -> str:
        return f"no interface Vlan{vlan_id}"

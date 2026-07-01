from .base import SouthboundNetworkDriver

class DellOS10Driver(SouthboundNetworkDriver):
    """
    Dell SmartFabric OS10 Structured Yang NETCONF Transaction XML Generator.
    """
    async def generate_vrf_payload(self, vrf_name: str, l3_vni: int) -> str:
        return f"""<config>
    <vrf xmlns="http://dellemc.com">
        <name>{vrf_name}</name>
        <vni>{l3_vni}</vni>
    </vrf>
</config>"""

    async def generate_evpn_overlay_payload(self, vrf_name: str, vlan_id: int, l2_vni: int, anycast_gw: str) -> str:
        return f"""<config>
    <interfaces xmlns="http://dellemc.com">
        <interface>
            <name>vlan{vlan_id}</name>
            <vrf-member>{vrf_name}</vrf-member>
            <ip-address>{anycast_gw}</ip-address>
            <evpn-overlay-tunnel><vni>{l2_vni}</vni></evpn-overlay-tunnel>
        </interface>
    </interfaces>
</config>"""

    async def generate_rollback_payload(self, vrf_name: str, vlan_id: int) -> str:
        return f"""<config>
    <interfaces xmlns="http://dellemc.com">
        <interface operation="delete">
            <name>vlan{vlan_id}</name>
        </interface>
    </interfaces>
</config>"""

import asyncio
import logging
from typing import Optional, Dict, Any

from .base import SouthboundNetworkDriver
from .dell_os10_collector import DellOS10Collector

logger = logging.getLogger(__name__)


class DellOS10Driver(SouthboundNetworkDriver):
    """
    Dell SmartFabric OS10 driver — config payload generation + live data collection.
    """

    # ------------------------------------------------------------------
    # Configuration payload generators (XML/NETCONF)
    # ------------------------------------------------------------------
    async def generate_vrf_payload(self, vrf_name: str, l3_vni: int) -> str:
        return f"""<config>
    <vrf xmlns="http://dellemc.com">
        <name>{vrf_name}</name>
        <vni>{l3_vni}</vni>
    </vrf>
</config>"""

    async def generate_evpn_overlay_payload(
        self, vrf_name: str, vlan_id: int, l2_vni: int, anycast_gw: str
    ) -> str:
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

    # ------------------------------------------------------------------
    # Live data collection via SSH
    # ------------------------------------------------------------------
    async def collect_all(
        self,
        host: str,
        username: Optional[str] = None,
        password: Optional[str] = None,
        port: int = 22,
    ) -> Dict[str, Any]:
        """SSH into the switch and return all inventory, interface, VLAN,
        LAG, VLT, environmental and config data.

        Runs the synchronous collector in a thread-pool so it does not
        block the async event loop.
        """
        def _run() -> Dict[str, Any]:
            with DellOS10Collector(
                host=host,
                username=username or "admin",
                password=password or "admin",
                port=port,
                use_ssh=True,
            ) as collector:
                return collector.collect_all()

        return await asyncio.to_thread(_run)

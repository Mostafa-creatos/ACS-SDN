from abc import ABC, abstractmethod

class SouthboundNetworkDriver(ABC):
    """
    Abstract Base Class outlining standard API endpoints for Southbound Multi-Vendor Drivers.
    """
    @abstractmethod
    async def generate_vrf_payload(self, vrf_name: str, l3_vni: int) -> str:
        """
        Generate configuration commands or XML payload to instantiate a VRF.
        """
        pass
    
    @abstractmethod
    async def generate_evpn_overlay_payload(self, vrf_name: str, vlan_id: int, l2_vni: int, anycast_gw: str) -> str:
        """
        Generate configuration commands or XML payload to bind a VLAN interface to EVPN.
        """
        pass

    @abstractmethod
    async def generate_rollback_payload(self, vrf_name: str, vlan_id: int) -> str:
        """
        Generate inverse configuration commands or XML payload to tear down/remove the VLAN interface.
        """
        pass

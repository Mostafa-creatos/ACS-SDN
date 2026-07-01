from typing import List
from pydantic import BaseModel, Field, field_validator
import ipaddress

class PolicyIntentSubmission(BaseModel):
    tenant_id: str = Field(..., description="Target parent tenant identity mapping UUID string")
    vrf_name: str = Field(..., description="Target routing VRF space context")
    l3_vni: int = Field(..., ge=5000, le=16777214, description="Layer 3 Virtual Network Identifier for inter-subnet transit paths")
    l2_vni: int = Field(..., ge=10000, le=16777214, description="Layer 2 Virtual Network Identifier for localized segment encapsulation")
    vlan_id: int = Field(..., ge=2, le=4094, description="Access VLAN ID bound to interface maps")
    requested_cidr: str = Field(..., description="Target subnet range specification in CIDR geometry notation")
    target_switch_serials: List[str] = Field(..., min_items=1)
    dry_run: bool = False

    @field_validator("requested_cidr")
    @classmethod
    def validate_cidr(cls, v: str) -> str:
        try:
            ipaddress.ip_network(v, strict=True)
        except ValueError:
            raise ValueError("Invalid network CIDR format.")
        return v

class ZtpDiscoverySubmission(BaseModel):
    serial_number: str = Field(..., description="Switch chassis physical hardware serial identifier")
    mac_address: str = Field(..., description="Chassis base interface physical MAC address identifier")
    hardware_vendor: str = Field(..., description="Vendor target flag matching supported drivers")
    hardware_model: str = Field(..., description="Model hardware description signature")
    base_os_version: str = Field(..., description="Active operating system core release string")

class PolicyReconciliationSubmission(BaseModel):
    tenant_id: str = Field(..., description="Target parent tenant identity mapping UUID string")
    vrf_name: str = Field(..., description="Target routing VRF space context")
    subnet_cidr: str = Field(..., description="Target subnet range specification in CIDR geometry notation to deallocate")

class LoginPayload(BaseModel):
    username: str
    password: str

class TenantCreate(BaseModel):
    tenant_name: str


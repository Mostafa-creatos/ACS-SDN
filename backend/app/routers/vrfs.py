from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
import ipaddress
import uuid

from .. import models
from ..db import get_db
from ..auth_permissions import require_permission

router = APIRouter(prefix="/api/v5/admin", tags=["vrfs"])

# --- SCHEMAS ---

class FabricResponse(BaseModel):
    fabric_id: str
    fabric_name: str
    global_bgp_asn: int

class VrfResponse(BaseModel):
    vrf_id: str
    tenant_id: str
    vrf_name: str
    layer3_vni: int
    route_distinguisher: str
    route_target: str
    subnets_count: int

class VrfCreate(BaseModel):
    tenant_id: str
    vrf_name: str
    layer3_vni: int = Field(..., ge=5000, le=16777214)
    route_distinguisher: str = "auto"
    route_target: str = "both auto"

class VrfUpdate(BaseModel):
    layer3_vni: Optional[int] = Field(None, ge=5000, le=16777214)
    route_distinguisher: Optional[str] = None
    route_target: Optional[str] = None

class SubnetResponse(BaseModel):
    subnet_id: str
    vrf_id: str
    fabric_id: str
    fabric_name: str
    vlan_id: int
    layer2_vni: int
    subnet_cidr: str
    anycast_gateway_ip: str

class SubnetCreate(BaseModel):
    fabric_id: str
    vlan_id: int = Field(..., ge=2, le=4094)
    layer2_vni: int = Field(..., ge=10000, le=16777214)
    subnet_cidr: str
    anycast_gateway_ip: str

    @field_validator("subnet_cidr")
    @classmethod
    def validate_cidr(cls, v):
        try:
            ipaddress.ip_network(v, strict=True)
        except ValueError:
            raise ValueError("Invalid network CIDR format.")
        return v

    @field_validator("anycast_gateway_ip")
    @classmethod
    def validate_gateway(cls, v):
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError("Invalid gateway IP address format.")
        return v

# --- ENDPOINTS ---

@router.get("/fabrics", response_model=List[FabricResponse])
def list_fabrics(
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """List all fabrics in the system."""
    fabrics = db.query(models.Fabric).all()
    return [
        {
            "fabric_id": str(f.fabric_id),
            "fabric_name": f.fabric_name,
            "global_bgp_asn": f.global_bgp_asn
        }
        for f in fabrics
    ]

@router.get("/vrfs", response_model=List[VrfResponse])
def list_vrfs(
    tenant_id: Optional[str] = None,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """List all VRFs, optionally filtered by tenant_id."""
    query = db.query(models.TenantVrf)
    if tenant_id:
        query = query.filter(models.TenantVrf.tenant_id == uuid.UUID(tenant_id))
    
    vrfs = query.all()
    
    res = []
    for v in vrfs:
        subnets_count = db.query(models.IpamSubnet).filter(models.IpamSubnet.vrf_id == v.vrf_id).count()
        res.append({
            "vrf_id": str(v.vrf_id),
            "tenant_id": str(v.tenant_id),
            "vrf_name": v.vrf_name,
            "layer3_vni": v.layer3_vni,
            "route_distinguisher": v.route_distinguisher,
            "route_target": v.route_target,
            "subnets_count": subnets_count
        })
    return res

@router.post("/vrfs", response_model=VrfResponse, status_code=status.HTTP_201_CREATED)
def create_vrf(
    payload: VrfCreate,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """Create a new VRF for a tenant."""
    t_uuid = uuid.UUID(payload.tenant_id)
    tenant = db.query(models.Tenant).filter(models.Tenant.tenant_id == t_uuid).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
        
    existing = db.query(models.TenantVrf).filter(
        models.TenantVrf.tenant_id == t_uuid,
        models.TenantVrf.vrf_name == payload.vrf_name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="VRF with this name already exists for the tenant")

    rd = payload.route_distinguisher
    if rd == "auto":
        rd = f"65000:{payload.layer3_vni}"
        
    rt = payload.route_target
    if rt == "both auto":
        rt = f"both 65000:{payload.layer3_vni}"

    new_vrf = models.TenantVrf(
        vrf_id=uuid.uuid4(),
        tenant_id=t_uuid,
        vrf_name=payload.vrf_name,
        layer3_vni=payload.layer3_vni,
        route_distinguisher=rd,
        route_target=rt
    )
    db.add(new_vrf)
    db.commit()
    db.refresh(new_vrf)
    
    return {
        "vrf_id": str(new_vrf.vrf_id),
        "tenant_id": str(new_vrf.tenant_id),
        "vrf_name": new_vrf.vrf_name,
        "layer3_vni": new_vrf.layer3_vni,
        "route_distinguisher": new_vrf.route_distinguisher,
        "route_target": new_vrf.route_target,
        "subnets_count": 0
    }

@router.put("/vrfs/{vrf_id}", response_model=VrfResponse)
def update_vrf(
    vrf_id: str,
    payload: VrfUpdate,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """Update VRF configuration."""
    v_uuid = uuid.UUID(vrf_id)
    vrf = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_id == v_uuid).first()
    if not vrf:
        raise HTTPException(status_code=404, detail="VRF not found")

    if payload.layer3_vni is not None:
        vrf.layer3_vni = payload.layer3_vni
        
    # Re-calculate defaults if L3 VNI changed or auto RD/RT specified
    rd = payload.route_distinguisher
    if rd == "auto":
        rd = f"65000:{vrf.layer3_vni}"
    if rd is not None:
        vrf.route_distinguisher = rd
        
    rt = payload.route_target
    if rt == "both auto":
        rt = f"both 65000:{vrf.layer3_vni}"
    if rt is not None:
        vrf.route_target = rt

    db.commit()
    db.refresh(vrf)
    
    subnets_count = db.query(models.IpamSubnet).filter(models.IpamSubnet.vrf_id == vrf.vrf_id).count()
    return {
        "vrf_id": str(vrf.vrf_id),
        "tenant_id": str(vrf.tenant_id),
        "vrf_name": vrf.vrf_name,
        "layer3_vni": vrf.layer3_vni,
        "route_distinguisher": vrf.route_distinguisher,
        "route_target": vrf.route_target,
        "subnets_count": subnets_count
    }

@router.delete("/vrfs/{vrf_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vrf(
    vrf_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """Delete a VRF if it has no associated subnets."""
    v_uuid = uuid.UUID(vrf_id)
    vrf = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_id == v_uuid).first()
    if not vrf:
        raise HTTPException(status_code=404, detail="VRF not found")
        
    subnets_count = db.query(models.IpamSubnet).filter(models.IpamSubnet.vrf_id == v_uuid).count()
    if subnets_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete VRF: active subnets exist. Please delete all subnets first."
        )
        
    db.delete(vrf)
    db.commit()

@router.get("/vrfs/{vrf_id}/subnets", response_model=List[SubnetResponse])
def list_vrf_subnets(
    vrf_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """List all subnets within a VRF context."""
    v_uuid = uuid.UUID(vrf_id)
    subnets = db.query(models.IpamSubnet).filter(models.IpamSubnet.vrf_id == v_uuid).all()
    
    res = []
    for s in subnets:
        fabric = db.query(models.Fabric).filter(models.Fabric.fabric_id == s.fabric_id).first()
        res.append({
            "subnet_id": str(s.subnet_id),
            "vrf_id": str(s.vrf_id),
            "fabric_id": str(s.fabric_id),
            "fabric_name": fabric.fabric_name if fabric else "Unknown",
            "vlan_id": s.vlan_id,
            "layer2_vni": s.layer2_vni,
            "subnet_cidr": s.subnet_cidr,
            "anycast_gateway_ip": s.anycast_gateway_ip
        })
    return res

@router.post("/vrfs/{vrf_id}/subnets", response_model=SubnetResponse, status_code=status.HTTP_201_CREATED)
def create_vrf_subnet(
    vrf_id: str,
    payload: SubnetCreate,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """Create a new subnet inside a VRF, with overlap and conflict validation checks."""
    v_uuid = uuid.UUID(vrf_id)
    vrf = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_id == v_uuid).first()
    if not vrf:
        raise HTTPException(status_code=404, detail="VRF not found")
        
    f_uuid = uuid.UUID(payload.fabric_id)
    fabric = db.query(models.Fabric).filter(models.Fabric.fabric_id == f_uuid).first()
    if not fabric:
        raise HTTPException(status_code=404, detail="Fabric not found")

    # VLAN Conflict Check (within same fabric context)
    vlan_conflict = db.query(models.IpamSubnet).filter(
        models.IpamSubnet.fabric_id == f_uuid,
        models.IpamSubnet.vlan_id == payload.vlan_id
    ).first()
    if vlan_conflict:
        raise HTTPException(
            status_code=400,
            detail=f"VLAN {payload.vlan_id} is already in use on Fabric {fabric.fabric_name}."
        )

    # CIDR Overlap Check (within same VRF context)
    target_net = ipaddress.ip_network(payload.subnet_cidr)
    existing_subnets = db.query(models.IpamSubnet).filter(models.IpamSubnet.vrf_id == v_uuid).all()
    for s in existing_subnets:
        existing_net = ipaddress.ip_network(s.subnet_cidr)
        if target_net.overlaps(existing_net):
            raise HTTPException(
                status_code=400,
                detail=f"CIDR prefix {payload.subnet_cidr} overlaps with existing subnet {s.subnet_cidr} inside VRF {vrf.vrf_name}."
            )

    # Validate that Gateway IP is inside CIDR prefix
    gateway_ip = ipaddress.ip_address(payload.anycast_gateway_ip)
    if gateway_ip not in target_net:
        raise HTTPException(
            status_code=400,
            detail=f"Gateway IP {payload.anycast_gateway_ip} is not within subnet prefix {payload.subnet_cidr}."
        )

    new_subnet = models.IpamSubnet(
        subnet_id=uuid.uuid4(),
        vrf_id=v_uuid,
        fabric_id=f_uuid,
        vlan_id=payload.vlan_id,
        layer2_vni=payload.layer2_vni,
        subnet_cidr=payload.subnet_cidr,
        anycast_gateway_ip=payload.anycast_gateway_ip
    )
    db.add(new_subnet)
    db.commit()
    db.refresh(new_subnet)

    # Seed initial gateway allocation to keep DB aligned
    gateway_allocation = models.IpamIpAllocation(
        allocation_id=uuid.uuid4(),
        subnet_id=new_subnet.subnet_id,
        ip_address=payload.anycast_gateway_ip,
        assignment_type="gateway",
        bound_entity_id="Anycast Gateway"
    )
    db.add(gateway_allocation)
    db.commit()

    return {
        "subnet_id": str(new_subnet.subnet_id),
        "vrf_id": str(new_subnet.vrf_id),
        "fabric_id": str(new_subnet.fabric_id),
        "fabric_name": fabric.fabric_name,
        "vlan_id": new_subnet.vlan_id,
        "layer2_vni": new_subnet.layer2_vni,
        "subnet_cidr": new_subnet.subnet_cidr,
        "anycast_gateway_ip": new_subnet.anycast_gateway_ip
    }

@router.delete("/subnets/{subnet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subnet(
    subnet_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """Delete a subnet."""
    s_uuid = uuid.UUID(subnet_id)
    subnet = db.query(models.IpamSubnet).filter(models.IpamSubnet.subnet_id == s_uuid).first()
    if not subnet:
        raise HTTPException(status_code=404, detail="Subnet not found")
    
    # Safety: block deletion if child IP allocations exist
    child_count = db.query(models.IpamIpAllocation).filter(models.IpamIpAllocation.subnet_id == s_uuid).count()
    if child_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete subnet: {child_count} host reservation(s) still reference it. Remove reservations first."
        )
    
    db.delete(subnet)
    db.commit()

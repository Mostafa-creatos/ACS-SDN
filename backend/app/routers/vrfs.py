from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
import ipaddress
import uuid
import datetime

from .. import models
from ..db import get_db
from ..auth_permissions import require_permission

router = APIRouter(prefix="/api/v5/admin", tags=["vrfs"])

# --- SCHEMAS ---

class FabricResponse(BaseModel):
    fabric_id: str
    fabric_name: str
    global_bgp_asn: int
    expected_ntp_servers: Optional[str] = "192.168.100.1"
    expected_dns_servers: Optional[str] = "8.8.8.8"
    expected_syslog_server: Optional[str] = "10.10.100.5"
    loopback_pool: Optional[str] = "10.200.1.0/24"
    vtep_pool: Optional[str] = "10.250.1.0/24"

class FabricCreate(BaseModel):
    fabric_name: str = Field(..., min_length=1)
    global_bgp_asn: int = Field(..., ge=1, le=4294967295)
    expected_ntp_servers: Optional[str] = "192.168.100.1"
    expected_dns_servers: Optional[str] = "8.8.8.8"
    expected_syslog_server: Optional[str] = "10.10.100.5"
    loopback_pool: Optional[str] = "10.200.1.0/24"
    vtep_pool: Optional[str] = "10.250.1.0/24"

class FabricUpdate(BaseModel):
    fabric_name: Optional[str] = Field(None, min_length=1)
    global_bgp_asn: Optional[int] = Field(None, ge=1, le=4294967295)
    expected_ntp_servers: Optional[str] = None
    expected_dns_servers: Optional[str] = None
    expected_syslog_server: Optional[str] = None
    loopback_pool: Optional[str] = None
    vtep_pool: Optional[str] = None

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

class ProvisioningJobResponse(BaseModel):
    job_id: str
    subnet_id: str
    vrf_name: str
    subnet_cidr: str
    fabric_name: str
    status: str
    started_at: Optional[datetime.datetime] = None
    completed_at: Optional[datetime.datetime] = None
    logs: str
    error_message: Optional[str] = None
    device_statuses: Optional[dict] = {}

    class Config:
        from_attributes = True

# --- ENDPOINTS ---

@router.get("/fabrics", response_model=List[FabricResponse])
def list_fabrics(
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:read"))
):
    """List all fabrics in the system. Accessible by all operators."""
    fabrics = db.query(models.Fabric).all()
    return [
        {
            "fabric_id": str(f.fabric_id),
            "fabric_name": f.fabric_name,
            "global_bgp_asn": f.global_bgp_asn,
            "expected_ntp_servers": f.expected_ntp_servers,
            "expected_dns_servers": f.expected_dns_servers,
            "expected_syslog_server": f.expected_syslog_server,
            "loopback_pool": f.loopback_pool,
            "vtep_pool": f.vtep_pool
        }
        for f in fabrics
    ]

@router.post("/fabrics", response_model=FabricResponse, status_code=status.HTTP_201_CREATED)
def create_fabric(
    payload: FabricCreate,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:write"))
):
    """Create a new Fabric infrastructure domain. Tenant Operator / Platform Admin."""
    # Check if a fabric with same name already exists
    existing = db.query(models.Fabric).filter(models.Fabric.fabric_name == payload.fabric_name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Fabric '{payload.fabric_name}' already exists.")
        
    fabric = models.Fabric(
        fabric_id=uuid.uuid4(),
        fabric_name=payload.fabric_name,
        global_bgp_asn=payload.global_bgp_asn,
        expected_ntp_servers=payload.expected_ntp_servers,
        expected_dns_servers=payload.expected_dns_servers,
        expected_syslog_server=payload.expected_syslog_server,
        loopback_pool=payload.loopback_pool or "10.200.1.0/24",
        vtep_pool=payload.vtep_pool or "10.250.1.0/24"
    )
    db.add(fabric)
    db.commit()
    db.refresh(fabric)
    return {
        "fabric_id": str(fabric.fabric_id),
        "fabric_name": fabric.fabric_name,
        "global_bgp_asn": fabric.global_bgp_asn,
        "expected_ntp_servers": fabric.expected_ntp_servers,
        "expected_dns_servers": fabric.expected_dns_servers,
        "expected_syslog_server": fabric.expected_syslog_server,
        "loopback_pool": fabric.loopback_pool,
        "vtep_pool": fabric.vtep_pool
    }

@router.patch("/fabrics/{fabric_id}", response_model=FabricResponse)
def update_fabric(
    fabric_id: uuid.UUID,
    payload: FabricUpdate,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:write"))
):
    """Update an existing Fabric infrastructure domain."""
    fabric = db.query(models.Fabric).filter(models.Fabric.fabric_id == fabric_id).first()
    if not fabric:
        raise HTTPException(status_code=404, detail="Fabric not found.")
        
    if payload.fabric_name is not None:
        if payload.fabric_name != fabric.fabric_name:
            existing = db.query(models.Fabric).filter(models.Fabric.fabric_name == payload.fabric_name).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Fabric '{payload.fabric_name}' already exists.")
        fabric.fabric_name = payload.fabric_name
        
    if payload.global_bgp_asn is not None:
        fabric.global_bgp_asn = payload.global_bgp_asn
        
    if payload.expected_ntp_servers is not None:
        fabric.expected_ntp_servers = payload.expected_ntp_servers
        
    if payload.expected_dns_servers is not None:
        fabric.expected_dns_servers = payload.expected_dns_servers
        
    if payload.expected_syslog_server is not None:
        fabric.expected_syslog_server = payload.expected_syslog_server

    if payload.loopback_pool is not None:
        fabric.loopback_pool = payload.loopback_pool

    if payload.vtep_pool is not None:
        fabric.vtep_pool = payload.vtep_pool
        
    db.commit()
    db.refresh(fabric)
    return {
        "fabric_id": str(fabric.fabric_id),
        "fabric_name": fabric.fabric_name,
        "global_bgp_asn": fabric.global_bgp_asn,
        "expected_ntp_servers": fabric.expected_ntp_servers,
        "expected_dns_servers": fabric.expected_dns_servers,
        "expected_syslog_server": fabric.expected_syslog_server,
        "loopback_pool": fabric.loopback_pool,
        "vtep_pool": fabric.vtep_pool
    }

@router.delete("/fabrics/{fabric_id}", status_code=status.HTTP_200_OK)
def delete_fabric(
    fabric_id: uuid.UUID,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:write"))
):
    """Delete a Fabric configuration. Rejects if any switches are assigned to it."""
    fabric = db.query(models.Fabric).filter(models.Fabric.fabric_id == fabric_id).first()
    if not fabric:
        raise HTTPException(status_code=404, detail="Fabric not found.")

    switches_count = db.query(models.Switch).filter(models.Switch.fabric_id == fabric_id).count()
    if switches_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete fabric '{fabric.fabric_name}': {switches_count} switch(es) are still assigned. Re-assign or remove them first."
        )

    db.delete(fabric)
    db.commit()
    return {"status": "DELETED", "fabric_id": str(fabric_id), "fabric_name": fabric.fabric_name}

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

    # Initialize auto-provisioning background job
    job = models.ProvisioningJob(
        job_id=uuid.uuid4(),
        subnet_id=new_subnet.subnet_id,
        vrf_name=vrf.vrf_name,
        subnet_cidr=new_subnet.subnet_cidr,
        fabric_name=fabric.fabric_name,
        status="pending",
        logs=""
    )
    db.add(job)
    db.commit()

    # Trigger Celery auto-provisioning task asynchronously
    from app.workers.sync_tasks import auto_provision_subnet_task
    auto_provision_subnet_task.delay(str(job.job_id))

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


@router.get("/provisioning-jobs", response_model=List[ProvisioningJobResponse])
def list_provisioning_jobs(
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """Retrieve all automated closed-loop provisioning status jobs."""
    jobs = db.query(models.ProvisioningJob).order_by(models.ProvisioningJob.started_at.desc()).all()
    res = []
    for j in jobs:
        res.append({
            "job_id": str(j.job_id),
            "subnet_id": str(j.subnet_id),
            "vrf_name": j.vrf_name,
            "subnet_cidr": j.subnet_cidr,
            "fabric_name": j.fabric_name,
            "status": j.status,
            "started_at": j.started_at,
            "completed_at": j.completed_at,
            "logs": j.logs,
            "error_message": j.error_message,
            "device_statuses": j.device_statuses or {}
        })
    return res


@router.get("/provisioning-jobs/{job_id}", response_model=ProvisioningJobResponse)
def get_provisioning_job(
    job_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """Retrieve details for a single provisioning job."""
    j_uuid = uuid.UUID(job_id)
    j = db.query(models.ProvisioningJob).filter(models.ProvisioningJob.job_id == j_uuid).first()
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": str(j.job_id),
        "subnet_id": str(j.subnet_id),
        "vrf_name": j.vrf_name,
        "subnet_cidr": j.subnet_cidr,
        "fabric_name": j.fabric_name,
        "status": j.status,
        "started_at": j.started_at,
        "completed_at": j.completed_at,
        "logs": j.logs,
        "error_message": j.error_message,
        "device_statuses": j.device_statuses or {}
    }


@router.post("/subnets/{subnet_id}/redeploy")
def redeploy_subnet(
    subnet_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """Trigger a new auto-provisioning job for an existing subnet."""
    s_uuid = uuid.UUID(subnet_id)
    subnet = db.query(models.IpamSubnet).filter(models.IpamSubnet.subnet_id == s_uuid).first()
    if not subnet:
        raise HTTPException(status_code=404, detail="Subnet not found")
        
    vrf = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_id == subnet.vrf_id).first()
    fabric = db.query(models.Fabric).filter(models.Fabric.fabric_id == subnet.fabric_id).first()
    
    # Check if there is already an active job running for this subnet
    active_job = db.query(models.ProvisioningJob).filter(
        models.ProvisioningJob.subnet_id == s_uuid,
        models.ProvisioningJob.status.in_(["pending", "in_progress"])
    ).first()
    if active_job:
        raise HTTPException(status_code=400, detail="A provisioning job is already active for this subnet.")
        
    # Create new job
    job = models.ProvisioningJob(
        job_id=uuid.uuid4(),
        subnet_id=subnet.subnet_id,
        vrf_name=vrf.vrf_name if vrf else "Unknown",
        subnet_cidr=subnet.subnet_cidr,
        fabric_name=fabric.fabric_name if fabric else "Unknown",
        status="pending",
        logs=""
    )
    db.add(job)
    db.commit()
    
    # Trigger Celery task
    from app.workers.sync_tasks import auto_provision_subnet_task
    auto_provision_subnet_task.delay(str(job.job_id))
    
    return {"status": "REDEPLOY_QUEUED", "job_id": str(job.job_id)}



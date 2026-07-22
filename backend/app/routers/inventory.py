import uuid
import datetime
import random
import hashlib
import math
import os
import logging
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from ..db import get_db
from .. import models
from ..auth import verify_switch_access
from ..auth_permissions import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v5", tags=["inventory"])

# Pydantic Schemas for Inventory Operations
class InterfaceSchema(BaseModel):
    name: str
    status: str
    speed_duplex: str
    vlan: str
    description: Optional[str] = None
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    media_type: Optional[str] = None
    neighbor: Optional[str] = None
    switchport_mode: Optional[str] = None
    transceiver_type: Optional[str] = None
    transceiver_serial: Optional[str] = None
    transceiver_qualified: Optional[bool] = None
    mtu: Optional[int] = None

class SwitchCreate(BaseModel):
    hostname: str = Field(..., example="AWM-DC01-LEAF1")
    management_ip: str = Field(..., example="10.250.10.120")
    vendor: str = Field(..., example="dell")
    role: str = Field(..., example="leaf")
    local_bgp_asn: int = Field(65000)
    loopback_0_ip: str = Field("10.200.1.50")
    vtep_ip: Optional[str] = None
    model: str = Field("S5248F-ON")
    os_version: str = Field("SmartFabric OS10 10.5.6.1")
    serial_number: str = Field("")
    service_tag: str = Field("")
    location: str = Field("Casablanca, Morocco")
    device_type: str = Field("Switch")
    os_type: str = Field("OS10")
    client_tenant: str = Field("AtlasWave Maroc Demo")
    ports_up: int = Field(24)
    ports_all: int = Field(52)
    chassis_status: str = Field("Ready")
    part_number: Optional[str] = None
    ppid: Optional[str] = None
    management_mac: Optional[str] = None
    fabric_id: Optional[str] = None

class SwitchUpdate(BaseModel):
    hostname: Optional[str] = None
    management_ip: Optional[str] = None
    vendor: Optional[str] = None
    role: Optional[str] = None
    local_bgp_asn: Optional[int] = None
    loopback_0_ip: Optional[str] = None
    vtep_ip: Optional[str] = None
    model: Optional[str] = None
    os_version: Optional[str] = None
    status: Optional[str] = None
    uptime: Optional[str] = None
    serial_number: Optional[str] = None
    service_tag: Optional[str] = None
    part_number: Optional[str] = None
    ppid: Optional[str] = None
    express_service_code: Optional[str] = None
    management_mac: Optional[str] = None
    os10_license_status: Optional[str] = None
    temperature: Optional[str] = None
    location: Optional[str] = None
    device_type: Optional[str] = None
    os_type: Optional[str] = None
    client_tenant: Optional[str] = None
    credentials_status: Optional[str] = None
    ports_up: Optional[int] = None
    ports_all: Optional[int] = None
    chassis_status: Optional[str] = None


def _serialize_switch(db: Session, sw: models.Switch) -> dict:
    """Serialize a Switch with all relationships into the API response dict."""
    # Load interfaces
    db_interfaces = db.query(models.DeviceInterface).filter(
        models.DeviceInterface.switch_id == sw.switch_id
    ).all()

    interfaces_list = []
    for inf in db_interfaces:
        interfaces_list.append({
            "name": inf.name,
            "status": inf.status,
            "speed_duplex": inf.speed_duplex,
            "vlan": inf.vlan,
            "description": inf.description,
            "ip_address": inf.ip_address,
            "mac_address": inf.mac_address,
            "media_type": inf.media_type or inf.transceiver_type,
            "neighbor": inf.neighbor,
            "switchport_mode": inf.switchport_mode,
            "transceiver_type": inf.transceiver_type,
            "transceiver_serial": inf.transceiver_serial,
            "transceiver_qualified": inf.transceiver_qualified,
            "mtu": inf.mtu,
            "errors_in": inf.errors_in,
            "errors_out": inf.errors_out,
            "discards_in": inf.discards_in,
            "discards_out": inf.discards_out,
        })

    # Load hardware components from DB (replaces hardcoded modules)
    db_components = db.query(models.HardwareComponent).filter(
        models.HardwareComponent.switch_id == sw.switch_id
    ).all()
    hardware_components = []
    for c in db_components:
        hardware_components.append({
            "component_id": str(c.component_id),
            "component_type": c.component_type,
            "slot_label": c.slot_label,
            "part_number": c.part_number,
            "ppid": c.ppid,
            "service_tag": c.service_tag,
            "status": c.status,
            "detail": c.detail,
            "numeric_value": c.numeric_value,
        })

    # Load VLANs from DB (replaces computed vlans)
    db_vlans = db.query(models.SwitchVlan).filter(
        models.SwitchVlan.switch_id == sw.switch_id
    ).all()
    switch_vlans = []
    for v in db_vlans:
        switch_vlans.append({
            "vlan_id": v.vlan_id,
            "name": v.name,
            "status": v.status,
            "member_ports": v.member_ports or [],
        })

    # Load LAGs
    db_lags = db.query(models.SwitchLag).filter(
        models.SwitchLag.switch_id == sw.switch_id
    ).all()
    lag_list = []
    for lag in db_lags:
        lag_list.append({
            "lag_id": str(lag.lag_id),
            "lag_name": lag.lag_name,
            "lag_type": lag.lag_type,
            "member_ports": lag.member_ports or [],
            "status": lag.status,
            "protocol": lag.protocol,
        })

    # Load VLT domain
    vlt = db.query(models.SwitchVltDomain).filter(
        models.SwitchVltDomain.switch_id == sw.switch_id
    ).first()
    vlt_data = None
    if vlt:
        vlt_data = {
            "vlt_id": str(vlt.vlt_id),
            "domain_id": vlt.domain_id,
            "peer_switch_id": str(vlt.peer_switch_id) if vlt.peer_switch_id else None,
            "peer_switch_hostname": vlt.peer_switch_hostname,
            "peer_link_status": vlt.peer_link_status,
            "icl_state": vlt.icl_state,
            "role": vlt.role,
            "peer_routing_enabled": vlt.peer_routing_enabled,
            "vrrp_groups": vlt.vrrp_groups or [],
        }

    return {
        "switch_id": str(sw.switch_id),
        "hostname": sw.hostname,
        "management_ip": sw.management_ip,
        "vendor": sw.vendor,
        "role": sw.role,
        "local_bgp_asn": sw.local_bgp_asn,
        "loopback_0_ip": sw.loopback_0_ip,
        "vtep_ip": sw.vtep_ip,
        "lifecycle_status": sw.lifecycle_status,
        "model": sw.model or "S5248F-ON",
        "os_version": sw.os_version or "SmartFabric OS10 10.5.6.1",
        "status": sw.status or "Up",
        "uptime": sw.uptime or "2 weeks 0 days 18 hours",
        "serial_number": sw.serial_number or "",
        "service_tag": sw.service_tag or "",
        "part_number": sw.part_number or "",
        "ppid": sw.ppid or "",
        "express_service_code": sw.express_service_code or "",
        "management_mac": sw.management_mac or "",
        "os10_license_status": sw.os10_license_status or "Licensed",
        "temperature": sw.temperature or "Normal",
        "cpu_usage": sw.cpu_usage,
        "memory_usage": sw.memory_usage,
        "location": sw.location or "Casablanca, Morocco",
        "device_type": sw.device_type or "Switch",
        "os_type": sw.os_type or "OS10",
        "client_tenant": sw.client_tenant or "AtlasWave Maroc Demo",
        "last_collection_timestamp": sw.last_collection_timestamp.isoformat() if sw.last_collection_timestamp else None,
        "credentials_status": sw.credentials_status or "Valid",
        "ports_up": sw.ports_up or 0,
        "ports_all": sw.ports_all or 52,
        "chassis_status": sw.chassis_status or "Ready",
        "running_config": sw.running_config or "",
        "startup_config": sw.startup_config or "",
        "configuration_checksum": sw.configuration_checksum,
        "interfaces": interfaces_list,
        "hardware_components": hardware_components,
        "vlans": switch_vlans,
        "lags": lag_list,
        "vlt": vlt_data,
    }


# Core Inventory Get Endpoint with server-side search, filter, pagination, sort
@router.get("/visibility/inventory")
def get_inventory_details(
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:read")),
    search: Optional[str] = Query(None, description="Search hostname, mgmt_ip, serial, service_tag"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by lifecycle_status"),
    vendor: Optional[str] = Query(None, description="Filter by vendor"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=200, description="Items per page"),
    sort_by: str = Query("hostname", description="Sort field"),
    sort_order: str = Query("asc", regex="^(asc|desc)$"),
):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    query = db.query(models.Switch)

    if user_role != "platform_admin":
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        allowed_switch_ids = db.query(models.Switch.switch_id).join(
            models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
        ).join(
            models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
        ).join(
            models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
        ).filter(models.TenantVrf.tenant_id == t_uuid).subquery()
        query = query.filter(models.Switch.switch_id.in_(db.query(allowed_switch_ids.c.switch_id)))

    # Server-side search
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                models.Switch.hostname.ilike(search_term),
                models.Switch.management_ip.ilike(search_term),
                models.Switch.serial_number.ilike(search_term),
                models.Switch.service_tag.ilike(search_term),
                models.Switch.model.ilike(search_term),
            )
        )

    # Server-side filter
    if status_filter:
        query = query.filter(models.Switch.lifecycle_status == status_filter)
    if vendor:
        query = query.filter(models.Switch.vendor.ilike(vendor))

    # Total count before pagination
    total_count = query.count()

    # Sorting
    sort_col = getattr(models.Switch, sort_by, models.Switch.hostname)
    if sort_order == "desc":
        sort_col = sort_col.desc()
    query = query.order_by(sort_col)

    # Pagination
    total_pages = max(1, math.ceil(total_count / per_page))
    switches = query.offset((page - 1) * per_page).limit(per_page).all()

    res = [_serialize_switch(db, sw) for sw in switches]

    return {
        "items": res,
        "total": total_count,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }

# Get Single Switch with full details
@router.get("/admin/switches/{switch_id}")
def get_switch_detail(switch_id: uuid.UUID, db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    verify_switch_access(db, switch_id, claims)
    sw = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
    if not sw:
        raise HTTPException(status_code=404, detail="Switch not found.")
    return _serialize_switch(db, sw)


# Get Switch Hardware Components
@router.get("/admin/switches/{switch_id}/hardware")
def get_switch_hardware(switch_id: uuid.UUID, db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    verify_switch_access(db, switch_id, claims)
    components = db.query(models.HardwareComponent).filter(
        models.HardwareComponent.switch_id == switch_id
    ).all()
    return [
        {
            "component_id": str(c.component_id),
            "component_type": c.component_type,
            "slot_label": c.slot_label,
            "part_number": c.part_number,
            "ppid": c.ppid,
            "service_tag": c.service_tag,
            "status": c.status,
            "detail": c.detail,
            "numeric_value": c.numeric_value,
        }
        for c in components
    ]


# Get Switch VLANs
@router.get("/admin/switches/{switch_id}/vlans")
def get_switch_vlans(switch_id: uuid.UUID, db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    verify_switch_access(db, switch_id, claims)
    vlans = db.query(models.SwitchVlan).filter(
        models.SwitchVlan.switch_id == switch_id
    ).all()
    return [
        {
            "vlan_id": v.vlan_id,
            "name": v.name,
            "status": v.status,
            "member_ports": v.member_ports or [],
        }
        for v in vlans
    ]


# Get Switch LAGs
@router.get("/admin/switches/{switch_id}/lags")
def get_switch_lags(switch_id: uuid.UUID, db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    verify_switch_access(db, switch_id, claims)
    lags = db.query(models.SwitchLag).filter(
        models.SwitchLag.switch_id == switch_id
    ).all()
    return [
        {
            "lag_id": str(lag.lag_id),
            "lag_name": lag.lag_name,
            "lag_type": lag.lag_type,
            "member_ports": lag.member_ports or [],
            "status": lag.status,
            "protocol": lag.protocol,
        }
        for lag in lags
    ]


# Get Switch VLT Domain
@router.get("/admin/switches/{switch_id}/vlt")
def get_switch_vlt(switch_id: uuid.UUID, db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    verify_switch_access(db, switch_id, claims)
    vlt = db.query(models.SwitchVltDomain).filter(
        models.SwitchVltDomain.switch_id == switch_id
    ).first()
    if not vlt:
        return None
    return {
        "vlt_id": str(vlt.vlt_id),
        "domain_id": vlt.domain_id,
        "peer_switch_id": str(vlt.peer_switch_id) if vlt.peer_switch_id else None,
        "peer_switch_hostname": vlt.peer_switch_hostname,
        "peer_link_status": vlt.peer_link_status,
        "icl_state": vlt.icl_state,
        "role": vlt.role,
        "peer_routing_enabled": vlt.peer_routing_enabled,
        "vrrp_groups": vlt.vrrp_groups or [],
    }


# Create Switch
@router.post("/admin/switches", status_code=status.HTTP_201_CREATED)
def create_switch(payload: SwitchCreate, db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
        
    if payload.fabric_id:
        fabric_id = uuid.UUID(payload.fabric_id)
    else:
        # Get active fabric ID (bind to default DataCenter fabric)
        fabric = db.query(models.Fabric).first()
        fabric_id = fabric.fabric_id if fabric else uuid.UUID("33333333-3333-3333-3333-33333333333c")
    
    # Check if duplicate hostname exists
    existing = db.query(models.Switch).filter(models.Switch.hostname == payload.hostname).first()
    if existing:
        raise HTTPException(status_code=400, detail="Device with this hostname already exists.")
        
    new_sw = models.Switch(
        switch_id=uuid.uuid4(),
        fabric_id=fabric_id,
        hostname=payload.hostname,
        management_ip=payload.management_ip,
        vendor=payload.vendor,
        role=payload.role,
        local_bgp_asn=payload.local_bgp_asn,
        loopback_0_ip=payload.loopback_0_ip,
        vtep_ip=payload.vtep_ip,
        lifecycle_status="compliant_active",
        model=payload.model,
        os_version=payload.os_version,
        status="Up",
        uptime="10 minutes",
        serial_number=payload.serial_number,
        service_tag=payload.service_tag,
        part_number=payload.part_number or payload.model,
        ppid=payload.ppid or "",
        management_mac=payload.management_mac or "",
        location=payload.location,
        device_type=payload.device_type,
        os_type=payload.os_type,
        client_tenant=payload.client_tenant,
        ports_up=payload.ports_up,
        ports_all=payload.ports_all,
        chassis_status=payload.chassis_status or "Ready",
        credentials_status="Valid",
        running_config=f"! Golden Running Config for {payload.hostname}\nhostname {payload.hostname}\ninterface loopback0\n ip address {payload.loopback_0_ip}\n!",
        startup_config=f"! Golden Startup Config for {payload.hostname}\nhostname {payload.hostname}\n!"
    )
    
    db.add(new_sw)
    db.commit()
    db.refresh(new_sw)
    
    return {"status": "DEVICE_REGISTERED", "switch_id": str(new_sw.switch_id), "hostname": new_sw.hostname}

# Edit Switch
@router.put("/admin/switches/{switch_id}")
def update_switch(switch_id: uuid.UUID, payload: SwitchUpdate, db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
        
    # Verify tenant bounds
    verify_switch_access(db, switch_id, claims)
    
    sw = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
    if not sw:
        raise HTTPException(status_code=404, detail="Switch not found.")
        
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(sw, key, value)
        
    db.commit()
    db.refresh(sw)
    return {"status": "DEVICE_UPDATED", "switch_id": str(sw.switch_id)}

# Delete Switch
@router.delete("/admin/switches/{switch_id}")
def delete_switch(switch_id: uuid.UUID, db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    from ..auth import verify_switch_access
    verify_switch_access(db, switch_id, claims)
        
    sw = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
    if not sw:
        raise HTTPException(status_code=404, detail="Switch not found.")
        
    db.delete(sw)
    db.commit()
    return {"status": "DEVICE_DELETED", "switch_id": str(switch_id)}

@router.post("/switches/{id}/rollback", status_code=status.HTTP_202_ACCEPTED)
def rollback_switch(id: uuid.UUID, db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    """
    Triggers a compliance rollback to re-apply the Ansible baseline.
    Requires approval if blast radius is high (spine).
    """
    switch = db.query(models.Switch).filter(models.Switch.switch_id == id).first()
    if not switch:
        raise HTTPException(status_code=404, detail="Switch not found.")

    from ..auth import verify_switch_access
    verify_switch_access(db, id, claims)

    if switch.role.lower() == "spine":
        # Requires approval
        approval = models.PolicyApproval(
            tenant_id=None,  # Or assign system/tenant
            vrf_name="management",
            vlan_id=1,
            layer2_vni=0,
            layer3_vni=0,
            requested_cidr="0.0.0.0/0",
            target_switch_serials=switch.serial_number,
            blast_radius=6,
            status="pending",
            diff_payload="Spine Baseline Rollback request"
        )
        db.add(approval)
        db.commit()
        return {"status": "APPROVAL_REQUIRED", "message": "Rollback of a spine switch requires Platform Admin approval.", "approval_id": str(approval.approval_id)}
    
    # Trigger rollback immediately
    from app.workers.ztp_tasks import trigger_rollback
    trigger_rollback.delay(str(switch.switch_id))
    
    return {"status": "ROLLBACK_INITIATED", "message": f"Rollback task queued for leaf {switch.hostname}."}

# ---------------------------------------------------------------------------
# Seed data helpers (fallback when live SSH collection is unavailable)
# ---------------------------------------------------------------------------

def _seed_dell_hardware(db: Session, sw: models.Switch) -> None:
    chassis_components = [
        models.HardwareComponent(
            component_id=uuid.uuid4(), switch_id=sw.switch_id,
            component_type="chassis", slot_label="1",
            part_number=sw.part_number or "0GKK8W",
            ppid=sw.ppid or "TW-0GKK8W-28298-713-0026",
            service_tag=sw.service_tag or "9531XC2",
            status="ok", detail=f"{sw.model or 'S5248F-ON'} ready",
        ),
        models.HardwareComponent(
            component_id=uuid.uuid4(), switch_id=sw.switch_id,
            component_type="psu", slot_label="PSU-1",
            part_number="06FKHH", ppid="CN-06FKHH-28298-6B5-03NY",
            status="ok", detail="AC 750W, input OK",
        ),
        models.HardwareComponent(
            component_id=uuid.uuid4(), switch_id=sw.switch_id,
            component_type="psu", slot_label="PSU-2",
            part_number="06FKHH", ppid="CN-06FKHH-28298-6B5-03NZ",
            status="ok", detail="AC 750W, input OK",
        ),
        models.HardwareComponent(
            component_id=uuid.uuid4(), switch_id=sw.switch_id,
            component_type="fan_tray", slot_label="Fan-1",
            part_number="0N7MH8", ppid="TW-0N7MH8-28298-713-0101",
            status="ok", detail="9800 RPM",
        ),
        models.HardwareComponent(
            component_id=uuid.uuid4(), switch_id=sw.switch_id,
            component_type="fan_tray", slot_label="Fan-2",
            part_number="0N7MH8", ppid="TW-0N7MH8-28298-713-0102",
            status="ok", detail="9750 RPM",
        ),
        models.HardwareComponent(
            component_id=uuid.uuid4(), switch_id=sw.switch_id,
            component_type="fan_tray", slot_label="Fan-3",
            part_number="0N7MH8", ppid="TW-0N7MH8-28298-713-0103",
            status="ok", detail="9700 RPM",
        ),
        models.HardwareComponent(
            component_id=uuid.uuid4(), switch_id=sw.switch_id,
            component_type="fan_tray", slot_label="Fan-4",
            part_number="0N7MH8", ppid="TW-0N7MH8-28298-713-0104",
            status="ok", detail="9650 RPM",
        ),
        models.HardwareComponent(
            component_id=uuid.uuid4(), switch_id=sw.switch_id,
            component_type="temperature", slot_label="Temp-1",
            status="ok", detail="System Temperature Normal", numeric_value=42.5,
        ),
    ]
    for comp in chassis_components:
        db.add(comp)


def _seed_dell_interfaces(db: Session, sw: models.Switch) -> List:
    ports_count = sw.ports_all or 52
    for idx in range(1, ports_count + 1):
        name = f"ethernet1/1/{idx}"
        is_up = "up" if idx <= (sw.ports_up or 24) else "down"
        is_high_speed = idx <= 4
        speed = "100G / Full" if is_high_speed else "10G / Full"
        media = "QSFP28 100GBASE-SR4" if is_high_speed else "SFP+ 10GBASE-SR"
        switchport = "trunk" if idx <= 4 else "access"
        vlan = "100" if idx <= 4 else str(200 + (idx % 100))

        inf = models.DeviceInterface(
            interface_id=uuid.uuid4(),
            switch_id=sw.switch_id,
            name=name,
            status=is_up,
            speed_duplex=speed,
            vlan=vlan,
            description=f"Uplink Port {idx}" if idx <= 4 else f"Access Port {idx}",
            media_type=media,
            switchport_mode=switchport,
            transceiver_type="QSFP28" if is_high_speed else "SFP+",
            transceiver_serial=f"AM{random.randint(10000, 99999)}" if is_up else None,
            transceiver_qualified=True,
            mtu=9216,
            errors_in=random.randint(0, 100) if is_up else 0,
            errors_out=random.randint(0, 50) if is_up else 0,
            neighbor=f"spine-{idx}" if idx <= 4 else None,
        )
        db.add(inf)
    db.commit()
    return db.query(models.DeviceInterface).filter(
        models.DeviceInterface.switch_id == sw.switch_id
    ).all()


def _seed_dell_vlans(db: Session, sw: models.Switch) -> None:
    seed_vlans = [
        models.SwitchVlan(switch_id=sw.switch_id, vlan_id=1, name="default", status="active", member_ports=[]),
        models.SwitchVlan(switch_id=sw.switch_id, vlan_id=100, name="Uplink-Fabric", status="active",
                          member_ports=["ethernet1/1/1", "ethernet1/1/2", "ethernet1/1/3", "ethernet1/1/4"]),
        models.SwitchVlan(switch_id=sw.switch_id, vlan_id=200, name="Server-Access", status="active",
                          member_ports=["ethernet1/1/5", "ethernet1/1/6", "ethernet1/1/7", "ethernet1/1/8"]),
        models.SwitchVlan(switch_id=sw.switch_id, vlan_id=300, name="Storage", status="active",
                          member_ports=["ethernet1/1/9", "ethernet1/1/10"]),
        models.SwitchVlan(switch_id=sw.switch_id, vlan_id=999, name="OOB-Mgmt", status="active", member_ports=[]),
    ]
    for v in seed_vlans:
        db.add(v)


def _seed_dell_lags(db: Session, sw: models.Switch) -> None:
    lags = [
        models.SwitchLag(
            lag_id=uuid.uuid4(), switch_id=sw.switch_id,
            lag_name="port-channel1000", lag_type="lacp",
            member_ports=["ethernet1/1/1", "ethernet1/1/2"],
            status="up", protocol="LACP active",
        ),
        models.SwitchLag(
            lag_id=uuid.uuid4(), switch_id=sw.switch_id,
            lag_name="port-channel2000", lag_type="static",
            member_ports=["ethernet1/1/3", "ethernet1/1/4"],
            status="up", protocol="Static",
        ),
    ]
    for lag in lags:
        db.add(lag)


def _seed_dell_vlt(db: Session, sw: models.Switch) -> None:
    vlt = models.SwitchVltDomain(
        vlt_id=uuid.uuid4(),
        switch_id=sw.switch_id,
        domain_id=1,
        peer_switch_hostname="",
        peer_link_status="up",
        icl_state="up",
        role="primary",
        peer_routing_enabled=True,
        vrrp_groups=[],
    )
    db.add(vlt)


# ---------------------------------------------------------------------------
# Live collection via driver
# ---------------------------------------------------------------------------

def _try_live_collection(db: Session, sw: models.Switch) -> Optional[dict]:
    """Attempt live SSH collection via DellOS10Driver.

    Returns the collected data dict on success, or None on failure.
    """
    if sw.vendor.lower() not in ("dell", "dell_os10"):
        return None

    try:
        from ..drivers.dell_os10 import DellOS10Driver

        ssh_user = os.environ.get("DELL_SSH_USERNAME", "admin")
        ssh_pass = os.environ.get("DELL_SSH_PASSWORD", "admin")
        ssh_port = int(os.environ.get("DELL_SSH_PORT", "22"))

        driver = DellOS10Driver()
        import asyncio
        collected = asyncio.run(
            driver.collect_all(
                host=sw.management_ip,
                username=ssh_user,
                password=ssh_pass,
                port=ssh_port,
            )
        )
        return collected
    except Exception as exc:
        logger.warning(
            "Live collection failed for %s (%s): %s",
            sw.hostname, sw.management_ip, exc,
        )
        return None


def _apply_collected_data(db: Session, sw: models.Switch, data: dict) -> str:
    """Persist all collected data into the database.

    Returns the running config string.
    """
    system = data.get("system", {})
    environment = data.get("environment", {})
    inventory = data.get("inventory", [])
    interfaces = data.get("interfaces", [])
    vlans = data.get("vlans", [])
    lags = data.get("lags", [])
    vlt = data.get("vlt")
    running_config = data.get("running_config", "")

    # Update Switch-level fields
    for key, val in system.items():
        if val:
            setattr(sw, key, val)
    if data.get("temperature"):
        sw.temperature = data["temperature"]
    if data.get("chassis_status"):
        sw.chassis_status = data["chassis_status"]

    # Remove old child records before inserting fresh ones
    db.query(models.HardwareComponent).filter(
        models.HardwareComponent.switch_id == sw.switch_id
    ).delete()
    db.query(models.DeviceInterface).filter(
        models.DeviceInterface.switch_id == sw.switch_id
    ).delete()
    db.query(models.SwitchVlan).filter(
        models.SwitchVlan.switch_id == sw.switch_id
    ).delete()
    db.query(models.SwitchLag).filter(
        models.SwitchLag.switch_id == sw.switch_id
    ).delete()
    db.query(models.SwitchVltDomain).filter(
        models.SwitchVltDomain.switch_id == sw.switch_id
    ).delete()

    # Hardware components -- merge inventory + environment
    for inv in inventory:
        db.add(models.HardwareComponent(
            component_id=uuid.uuid4(), switch_id=sw.switch_id,
            component_type=inv.get("component_type", "unknown"),
            slot_label=inv.get("slot_label", ""),
            part_number=inv.get("part_number", ""),
            ppid=inv.get("ppid", ""),
            service_tag=inv.get("service_tag", ""),
            status=inv.get("status", "ok"),
            detail=inv.get("detail", ""),
            numeric_value=inv.get("numeric_value"),
        ))
    for sensor in environment.get("temperature_sensors", []):
        db.add(models.HardwareComponent(
            component_id=uuid.uuid4(), switch_id=sw.switch_id,
            component_type="temperature",
            slot_label=sensor.get("slot_label", ""),
            status=sensor.get("status", "ok"),
            detail=sensor.get("detail", ""),
            numeric_value=sensor.get("numeric_value"),
        ))
    for fan in environment.get("fans", []):
        db.add(models.HardwareComponent(
            component_id=uuid.uuid4(), switch_id=sw.switch_id,
            component_type="fan_tray",
            slot_label=fan.get("slot_label", ""),
            status=fan.get("status", "ok"),
            detail=fan.get("detail", ""),
            numeric_value=fan.get("numeric_value"),
        ))
    for psu in environment.get("power_supplies", []):
        db.add(models.HardwareComponent(
            component_id=uuid.uuid4(), switch_id=sw.switch_id,
            component_type="psu",
            slot_label=psu.get("slot_label", ""),
            status=psu.get("status", "ok"),
            detail=psu.get("detail", ""),
        ))

    # Interfaces
    up_count = 0
    for intf in interfaces:
        status = intf.get("status", "down")
        if status == "up":
            up_count += 1
        db.add(models.DeviceInterface(
            interface_id=uuid.uuid4(), switch_id=sw.switch_id,
            name=intf.get("name", ""),
            status=status,
            speed_duplex=intf.get("speed_duplex", "10G / Full"),
            vlan=intf.get("vlan", ""),
            description=intf.get("description", ""),
            ip_address=intf.get("ip_address"),
            mac_address=intf.get("mac_address"),
            media_type=intf.get("transceiver_type") or intf.get("media_type"),
            neighbor=intf.get("neighbor"),
            switchport_mode=intf.get("switchport_mode", "trunk"),
            transceiver_type=intf.get("transceiver_type"),
            transceiver_serial=intf.get("transceiver_serial"),
            transceiver_qualified=intf.get("transceiver_qualified"),
            mtu=intf.get("mtu", 9216),
            errors_in=intf.get("errors_in", 0),
            errors_out=intf.get("errors_out", 0),
            discards_in=intf.get("discards_in", 0),
            discards_out=intf.get("discards_out", 0),
        ))
    sw.ports_up = up_count
    sw.ports_all = len(interfaces)

    # VLANs
    for vlan in vlans:
        db.add(models.SwitchVlan(
            switch_id=sw.switch_id,
            vlan_id=vlan.get("vlan_id", 0),
            name=vlan.get("name", ""),
            status=vlan.get("status", "active"),
            member_ports=vlan.get("member_ports", []),
        ))

    # LAGs
    for lag in lags:
        db.add(models.SwitchLag(
            lag_id=uuid.uuid4(), switch_id=sw.switch_id,
            lag_name=lag.get("lag_name", ""),
            lag_type=lag.get("lag_type", "lacp"),
            member_ports=lag.get("member_ports", []),
            status=lag.get("status", "up"),
            protocol=lag.get("protocol", ""),
        ))

    # VLT domain
    if vlt:
        db.add(models.SwitchVltDomain(
            vlt_id=uuid.uuid4(), switch_id=sw.switch_id,
            domain_id=vlt.get("domain_id", 0),
            peer_switch_hostname=vlt.get("peer_switch_hostname", ""),
            peer_link_status=vlt.get("peer_link_status", "down"),
            icl_state=vlt.get("icl_state", "down"),
            role=vlt.get("role", "backup"),
            peer_routing_enabled=vlt.get("peer_routing_enabled", False),
            vrrp_groups=vlt.get("vrrp_groups", []),
        ))

    return running_config


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

# Immediate Data / Config Collection Trigger
@router.post("/admin/switches/{switch_id}/collect")
def collect_switch_snapshot(switch_id: uuid.UUID, db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:write"))):
    verify_switch_access(db, switch_id, claims)

    sw = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
    if not sw:
        raise HTTPException(status_code=404, detail="Switch not found.")

    sw.last_collection_timestamp = datetime.datetime.now(datetime.timezone.utc)
    sw.status = "Up"

    is_dell = sw.vendor.lower() in ("dell", "dell_os10")

    # --- Phase 1: Try live SSH collection ---
    live_data = _try_live_collection(db, sw) if is_dell else None

    if live_data is not None:
        running_config_str = _apply_collected_data(db, sw, live_data)
        logger.info("Live collection succeeded for %s", sw.hostname)
    else:
        # --- Phase 2: Seed data fallback ---
        if is_dell:
            # Seed hardware components
            if db.query(models.HardwareComponent).filter(
                models.HardwareComponent.switch_id == switch_id
            ).count() == 0:
                _seed_dell_hardware(db, sw)

            # Seed interfaces
            db_interfaces = db.query(models.DeviceInterface).filter(
                models.DeviceInterface.switch_id == switch_id
            ).all()
            if not db_interfaces:
                db_interfaces = _seed_dell_interfaces(db, sw)

            # Seed VLANs
            if db.query(models.SwitchVlan).filter(
                models.SwitchVlan.switch_id == switch_id
            ).count() == 0:
                _seed_dell_vlans(db, sw)

            # Seed LAGs
            if db.query(models.SwitchLag).filter(
                models.SwitchLag.switch_id == switch_id
            ).count() == 0:
                _seed_dell_lags(db, sw)

            # Seed VLT
            if db.query(models.SwitchVltDomain).filter(
                models.SwitchVltDomain.switch_id == switch_id
            ).count() == 0:
                _seed_dell_vlt(db, sw)

            # Refresh interface state
            db_interfaces = db.query(models.DeviceInterface).filter(
                models.DeviceInterface.switch_id == switch_id
            ).all()
            up_count = 0
            for inf in db_interfaces:
                if random.random() < 0.15 and inf.name not in ["ethernet1/1/1", "ethernet1/1/2"]:
                    inf.status = "up" if inf.status == "down" else "down"
                if inf.status == "up":
                    up_count += 1
            sw.ports_up = up_count

            # Build a seed running config
            config_lines = [
                f"! Golden configuration for {sw.hostname}",
                f"! Model: {sw.model or 'S5248F-ON'}",
                f"! Service Tag: {sw.service_tag or sw.serial_number or 'Unknown'}",
                f"! OS Version: {sw.os_version or 'SmartFabric OS10 10.5.6.1'}",
                f"hostname {sw.hostname}",
                "system enable",
                "username admin password sha512 $6$Salted$Hash role sysadmin",
            ]
            for inf in db_interfaces:
                config_lines.append(f"interface {inf.name}")
                config_lines.append(f" no shutdown" if inf.status == "up" else " shutdown")
                config_lines.append(f" description {inf.description or 'Configured'}")
                config_lines.append(f" switchport mode {inf.switchport_mode or 'access'}")
                if inf.vlan:
                    config_lines.append(f" switchport access vlan {inf.vlan}")
                config_lines.append(f" mtu {inf.mtu or 9216}")
                config_lines.append("!")
            running_config_str = "\n".join(config_lines)
        else:
            running_config_str = sw.running_config or ""

    # --- Phase 3: Common persistence (config + snapshot) ---
    if running_config_str and len(running_config_str) > 50:
        sw.running_config = running_config_str
        md5_hash = hashlib.md5(running_config_str.encode("utf-8")).hexdigest()
        sw.configuration_checksum = md5_hash

        snapshot = models.ConfigSnapshot(
            snapshot_id=uuid.uuid4(),
            switch_id=sw.switch_id,
            taken_at=sw.last_collection_timestamp,
            raw_config=running_config_str,
            config_hash=md5_hash,
            taken_by=claims.get("username", "system"),
        )
        db.add(snapshot)
    else:
        md5_hash = sw.configuration_checksum or ""

    db.commit()
    db.refresh(sw)

    return {
        "status": "COLLECTION_COMPLETED",
        "switch_id": str(switch_id),
        "last_collection_timestamp": sw.last_collection_timestamp.isoformat(),
        "config_hash": md5_hash,
        "ports_up": sw.ports_up,
        "ports_all": sw.ports_all,
    }


@router.post("/admin/switches/{switch_id}/provision", status_code=status.HTTP_202_ACCEPTED)
def provision_switch(
    switch_id: uuid.UUID,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """
    Manually trigger ZTP baseline provisioning for a switch.
    """
    sw = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
    if not sw:
        raise HTTPException(status_code=404, detail="Switch not found.")
        
    from app.workers.ztp_tasks import apply_baseline_template
    apply_baseline_template.delay(str(switch_id))
    
    return {"status": "PROVISION_QUEUED", "message": f"Provisioning task queued for {sw.hostname}."}

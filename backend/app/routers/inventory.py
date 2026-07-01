import uuid
import datetime
import random
import hashlib
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models
from ..auth import get_current_user_claims, verify_switch_access

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

class SwitchCreate(BaseModel):
    hostname: str = Field(..., example="AWM-CAS-FW01")
    management_ip: str = Field(..., example="10.250.10.120")
    vendor: str = Field(..., example="fortinet")
    role: str = Field(..., example="Firewall")
    local_bgp_asn: int = Field(65000)
    loopback_0_ip: str = Field("10.200.1.50")
    vtep_ip: Optional[str] = None
    model: str = Field("FortiGate-200F")
    os_version: str = Field("FortiOS 7.2.6")
    serial_number: str = Field("00CA289E56")
    location: str = Field("Casablanca, Morocco")
    device_type: str = Field("Firewall")
    os_type: str = Field("FortiOS")
    client_tenant: str = Field("AtlasWave Maroc Demo")
    ports_up: int = Field(3)
    ports_all: int = Field(24)
    chassis_status: str = Field("Ready")

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
    location: Optional[str] = None
    device_type: Optional[str] = None
    os_type: Optional[str] = None
    client_tenant: Optional[str] = None
    credentials_status: Optional[str] = None
    ports_up: Optional[int] = None
    ports_all: Optional[int] = None
    chassis_status: Optional[str] = None

# Core Inventory Get Endpoint
@router.get("/visibility/inventory")
def get_inventory_details(db: Session = Depends(get_db), claims: dict = Depends(get_current_user_claims)):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")
    
    query = db.query(models.Switch)
    if user_role != "Platform Admin":
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        # Filter switches by checking if tenant has VRF config
        query = query.join(models.Fabric).join(models.IpamSubnet).join(models.TenantVrf).filter(
            models.TenantVrf.tenant_id == t_uuid
        ).distinct()
        
    switches = query.all()
    res = []
    
    for sw in switches:
        # Load interfaces from DB
        db_interfaces = db.query(models.DeviceInterface).filter(models.DeviceInterface.switch_id == sw.switch_id).all()
        
        # Structure the final interface array
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
                "media_type": inf.media_type,
                "neighbor": inf.neighbor
            })
            
        # Build list of active VLANs
        vlans = list(set([int(inf.vlan) for inf in db_interfaces if inf.vlan.isdigit()]))
        
        # Build chassis modules
        modules = [
            {"slot": "1", "type": "Supervisor Module", "status": "active"},
            {"slot": "2", "type": "Power Supply A", "status": "normal"},
            {"slot": "3", "type": "Power Supply B", "status": "normal"},
            {"slot": "4", "type": "Fan Tray module", "status": "active"}
        ]
        if sw.vendor.lower() == "nokia":
            modules[0]["type"] = "Nokia Controller Module"
        elif "forti" in sw.vendor.lower():
            modules[0]["type"] = "Fortinet Core Processing Unit"
            
        res.append({
            "switch_id": str(sw.switch_id),
            "hostname": sw.hostname,
            "management_ip": sw.management_ip,
            "vendor": sw.vendor,
            "role": sw.role,
            "local_bgp_asn": sw.local_bgp_asn,
            "loopback_0_ip": sw.loopback_0_ip,
            "vtep_ip": sw.vtep_ip,
            "lifecycle_status": sw.lifecycle_status,
            "model": sw.model or "C9300-48P",
            "os_version": sw.os_version or "IOS XE 17.9.4",
            "status": sw.status or "Up",
            "uptime": sw.uptime or "2 weeks 0 days 18 hours",
            "serial_number": sw.serial_number or f"SN-{sw.vendor.upper()}-{sw.hostname.upper()}",
            "location": sw.location or "Casablanca, Morocco",
            "device_type": sw.device_type or "Switch",
            "os_type": sw.os_type or "IOS-XE",
            "client_tenant": sw.client_tenant or "AtlasWave Maroc Demo",
            "last_collection_timestamp": sw.last_collection_timestamp.isoformat() if sw.last_collection_timestamp else None,
            "credentials_status": sw.credentials_status or "Valid",
            "ports_up": sw.ports_up or 24,
            "ports_all": sw.ports_all or 24,
            "chassis_status": sw.chassis_status or "Ready",
            "running_config": sw.running_config or "",
            "startup_config": sw.startup_config or "",
            "interfaces": interfaces_list,
            "vlans": sorted(vlans),
            "modules": modules
        })
        
    return res

# Create Switch
@router.post("/admin/switches", status_code=status.HTTP_201_CREATED)
def create_switch(payload: SwitchCreate, db: Session = Depends(get_db), claims: dict = Depends(get_current_user_claims)):
    user_role = claims.get("role")
    if user_role != "Platform Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only Platform Admins can manually register devices."
        )
        
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
        location=payload.location,
        device_type=payload.device_type,
        os_type=payload.os_type,
        client_tenant=payload.client_tenant,
        ports_up=payload.ports_up,
        ports_all=payload.ports_all,
        chassis_status="Ready",
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
def update_switch(switch_id: uuid.UUID, payload: SwitchUpdate, db: Session = Depends(get_db), claims: dict = Depends(get_current_user_claims)):
    user_role = claims.get("role")
    if user_role not in ["Platform Admin", "Tenant Operator"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: User lacks authorization to edit device metadata."
        )
        
    # Verify tenant bounds
    verify_switch_access(db, switch_id, claims)
    
    sw = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
    if not sw:
        raise HTTPException(status_code=404, detail="Switch not found.")
        
    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(sw, key, value)
        
    db.commit()
    db.refresh(sw)
    return {"status": "DEVICE_UPDATED", "switch_id": str(sw.switch_id)}

# Delete Switch
@router.delete("/admin/switches/{switch_id}")
def delete_switch(switch_id: uuid.UUID, db: Session = Depends(get_db), claims: dict = Depends(get_current_user_claims)):
    user_role = claims.get("role")
    if user_role != "Platform Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only Platform Admins can delete devices from the registry."
        )
        
    sw = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
    if not sw:
        raise HTTPException(status_code=404, detail="Switch not found.")
        
    db.delete(sw)
    db.commit()
    return {"status": "DEVICE_DELETED", "switch_id": str(switch_id)}

# Immediate Data / Config Collection Trigger
@router.post("/admin/switches/{switch_id}/collect")
def collect_switch_snapshot(switch_id: uuid.UUID, db: Session = Depends(get_db), claims: dict = Depends(get_current_user_claims)):
    # Verify tenant bounds
    verify_switch_access(db, switch_id, claims)
    
    sw = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
    if not sw:
        raise HTTPException(status_code=404, detail="Switch not found.")
        
    # Trigger configuration snapshot generation
    sw.last_collection_timestamp = datetime.datetime.utcnow()
    sw.status = "Up"
    
    # Refresh interface state configuration slightly to simulate real discovery changes
    db_interfaces = db.query(models.DeviceInterface).filter(models.DeviceInterface.switch_id == switch_id).all()
    if db_interfaces:
        # Randomly toggle some interfaces
        up_count = 0
        for inf in db_interfaces:
            if inf.name != "GigabitEthernet1/0/1" and inf.name != "ethernet-1/1":
                # 20% chance to toggle
                if random.random() < 0.2:
                    inf.status = "up" if inf.status == "down" else "down"
            if inf.status == "up":
                up_count += 1
        sw.ports_up = up_count
    else:
        # Create default interfaces if they don't exist yet
        ports_count = sw.ports_all if sw.ports_all else 24
        prefix = "ethernet-" if sw.vendor.lower() in ["nokia", "arista"] else "port-"
        if "c9300" in sw.model.lower() or "cisco" in sw.vendor.lower():
            prefix = "GigabitEthernet1/0/"
        
        for idx in range(1, ports_count + 1):
            name = f"{prefix}{idx}"
            is_up = "up" if idx <= (sw.ports_up or 3) else "down"
            inf = models.DeviceInterface(
                interface_id=uuid.uuid4(),
                switch_id=sw.switch_id,
                name=name,
                status=is_up,
                speed_duplex="10G / Full" if idx <= 4 else "1G / Full",
                vlan="10" if idx <= 4 else "1",
                description="Default Interface",
                media_type="SFP-10G-SR" if idx <= 4 else "1000BaseT"
            )
            db.add(inf)
        db.commit()
        db_interfaces = db.query(models.DeviceInterface).filter(models.DeviceInterface.switch_id == switch_id).all()
        
    # Generate mock CLI config contents
    config_blocks = [
        f"! Golden running configuration collected on {sw.last_collection_timestamp.strftime('%Y-%m-%d %H:%M:%S')}",
        f"hostname {sw.hostname}",
        f"syslocation {sw.location}",
        f"os-version {sw.os_version}",
        f"serial-number {sw.serial_number or 'SN-UNKNOWN'}",
        "ntp server 192.168.100.1",
        "ip name-server 8.8.8.8",
        "aaa authentication login default local"
    ]
    
    # Append port lines
    for inf in db_interfaces:
        config_blocks.append(f"interface {inf.name}\n description {inf.description or 'N/A'}\n switchport access vlan {inf.vlan}\n speed 1000\n!")
        
    running_config_str = "\n".join(config_blocks)
    sw.running_config = running_config_str
    
    # Compute checksum MD5 hash
    md5_hash = hashlib.md5(running_config_str.encode('utf-8')).hexdigest()
    sw.configuration_checksum = md5_hash
    
    # Store config snapshot
    snapshot = models.ConfigSnapshot(
        snapshot_id=uuid.uuid4(),
        switch_id=sw.switch_id,
        taken_at=sw.last_collection_timestamp,
        raw_config=running_config_str,
        config_hash=md5_hash,
        taken_by=claims.get("username", "system")
    )
    db.add(snapshot)
    db.commit()
    db.refresh(sw)
    
    return {
        "status": "COLLECTION_COMPLETED",
        "switch_id": str(switch_id),
        "last_collection_timestamp": sw.last_collection_timestamp.isoformat(),
        "config_hash": md5_hash,
        "ports_up": sw.ports_up
    }

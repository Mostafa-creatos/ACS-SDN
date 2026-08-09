from fastapi import APIRouter, Depends, Request, status, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app import models, schemas
from app.auth_permissions import require_permission
from pydantic import BaseModel, Field
from typing import Optional

# We will import apply_baseline_template later to avoid circular imports if needed
from app.workers.ztp_tasks import apply_baseline_template

router = APIRouter(
    prefix="/api/v5/discovery",
    tags=["ZTP Discovery"]
)

class ZtpIngestionPayload(BaseModel):
    mac_address: str = Field(..., description="Chassis base interface physical MAC address identifier")
    serial_number: str = Field(..., description="Switch chassis physical hardware serial identifier")
    os_version: str = Field(..., description="Active operating system core release string")
    vendor: str = Field(..., description="Vendor target flag matching supported drivers")
    management_ip: Optional[str] = Field(None, description="Optional IP override for testing/simulation")

@router.post("/on-boarding-ingestion", status_code=status.HTTP_202_ACCEPTED)
async def ingest_ztp_signal(
    payload: ZtpIngestionPayload,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Ingest a ZTP discovery signal from a newly unboxed switch.
    """
    # Check if a discovery record already exists for this serial or MAC
    record = db.query(models.ZtpDiscoveryPool).filter(
        (models.ZtpDiscoveryPool.serial_number == payload.serial_number) |
        (models.ZtpDiscoveryPool.mac_address == payload.mac_address)
    ).first()
    
    # Check if a Switch row already exists and has a fabric assigned
    switch = db.query(models.Switch).filter(
        models.Switch.serial_number == payload.serial_number
    ).first()

    has_fabric = (switch is not None) and (switch.fabric_id is not None)
    initial_status = "pending" if has_fabric else "unassigned"

    # Use provided management_ip if available, else fallback to client IP
    client_ip = payload.management_ip if payload.management_ip else (request.client.host if request.client else "127.0.0.1")

    if record:
        record.current_dhcp_ip = client_ip
        record.base_os_version = payload.os_version
        record.hardware_vendor = payload.vendor
        record.hardware_model = "Unknown"
        record.onboarding_status = initial_status
        record.error_message = None
    else:
        record = models.ZtpDiscoveryPool(
            serial_number=payload.serial_number,
            mac_address=payload.mac_address,
            hardware_vendor=payload.vendor,
            hardware_model="Unknown",
            current_dhcp_ip=client_ip,
            base_os_version=payload.os_version,
            onboarding_status=initial_status
        )
        db.add(record)
    
    db.commit()
    db.refresh(record)

    # Upsert a Switch row with lifecycle_state='DiscoveredRaw'
    if not switch:
        # Create a new bare-minimum switch row
        hostname = f"switch-{payload.serial_number[-4:]}"
        switch = models.Switch(
            discovery_id=record.discovery_id,
            hostname=hostname,
            management_ip=client_ip,
            vendor=payload.vendor,
            role="leaf",
            local_bgp_asn=65000,
            loopback_0_ip=f"10.255.0.{abs(hash(payload.serial_number)) % 254 + 1}",
            serial_number=payload.serial_number,
            lifecycle_status="discovered_raw"
        )
        db.add(switch)
    else:
        switch.lifecycle_status = "discovered_raw"
        switch.discovery_id = record.discovery_id

    db.commit()
    db.refresh(switch)

    # Only enqueue Celery task if fabric is assigned
    if has_fabric:
        apply_baseline_template.delay(str(switch.switch_id))
        print(f"[ZTP INGESTION] Auto-provisioning triggered for switch serial: {payload.serial_number} at IP: {client_ip} (Fabric Assigned)")
    else:
        print(f"[ZTP INGESTION] Discovered bare-metal switch serial: {payload.serial_number} at IP: {client_ip} (Pending Fabric Assignment)")

    return {"status": "DISCOVERY_INGESTION_ACCEPTED", "serial_number": payload.serial_number, "switch_id": str(switch.switch_id)}

@router.get("/pool", status_code=status.HTTP_200_OK)
async def get_discovery_pool(
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:read"))
):
    """
    Get the onboarding queue status (pending/provisioned/failed) per entry.
    Tenant-scoped: non-platform-admins only see switches in their tenant's fabrics.
    """
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    if user_role == "platform_admin":
        records = db.query(models.ZtpDiscoveryPool).order_by(models.ZtpDiscoveryPool.first_seen.desc()).all()
    else:
        import uuid
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        records = db.query(models.ZtpDiscoveryPool).join(
            models.Switch, models.Switch.discovery_id == models.ZtpDiscoveryPool.discovery_id
        ).join(
            models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
        ).join(
            models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
        ).join(
            models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
        ).filter(models.TenantVrf.tenant_id == t_uuid).distinct().order_by(
            models.ZtpDiscoveryPool.first_seen.desc()
        ).all()

    response_data = []
    for r in records:
        switch = db.query(models.Switch).filter(models.Switch.discovery_id == r.discovery_id).first()
        response_data.append({
            "discovery_id": str(r.discovery_id),
            "mac_address": r.mac_address,
            "serial_number": r.serial_number,
            "hardware_vendor": r.hardware_vendor,
            "os_version": r.base_os_version,
            "current_dhcp_ip": r.current_dhcp_ip,
            "first_seen": r.first_seen.isoformat() if r.first_seen else None,
            "onboarding_status": r.onboarding_status,
            "error_message": r.error_message,
            "ztp_logs": r.ztp_logs,
            "fabric_id": str(switch.fabric_id) if switch and switch.fabric_id else None,
            "switch_hostname": switch.hostname if switch else None,
            "switch_role": switch.role if switch else None,
        })
    return response_data


@router.get("/pool/{discovery_id}/status", status_code=status.HTTP_200_OK)
async def get_ztp_record_status(
    discovery_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:read"))
):
    """Get full status details for a single ZTP discovery record."""
    import uuid as _uuid
    try:
        did = _uuid.UUID(discovery_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid discovery_id format")

    record = db.query(models.ZtpDiscoveryPool).filter(
        models.ZtpDiscoveryPool.discovery_id == did
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Discovery record not found")

    switch = db.query(models.Switch).filter(models.Switch.discovery_id == did).first()
    latest_snapshot = None
    if switch:
        snap = db.query(models.ConfigSnapshot).filter(
            models.ConfigSnapshot.switch_id == switch.switch_id
        ).order_by(models.ConfigSnapshot.taken_at.desc()).first()
        if snap:
            latest_snapshot = {
                "snapshot_id": str(snap.snapshot_id),
                "config_hash": snap.config_hash,
                "is_baseline": snap.is_baseline,
                "taken_by": snap.taken_by,
                "taken_at": snap.taken_at.isoformat() if snap.taken_at else None
            }

    return {
        "discovery_id": str(record.discovery_id),
        "serial_number": record.serial_number,
        "mac_address": record.mac_address,
        "hardware_vendor": record.hardware_vendor,
        "os_version": record.base_os_version,
        "current_dhcp_ip": record.current_dhcp_ip,
        "first_seen": record.first_seen.isoformat() if record.first_seen else None,
        "onboarding_status": record.onboarding_status,
        "error_message": record.error_message,
        "ztp_logs": record.ztp_logs,
        "switch": {
            "switch_id": str(switch.switch_id) if switch else None,
            "hostname": switch.hostname if switch else None,
            "management_ip": switch.management_ip if switch else None,
            "lifecycle_status": switch.lifecycle_status if switch else None,
        } if switch else None,
        "latest_snapshot": latest_snapshot
    }


@router.post("/pool/{discovery_id}/retry", status_code=status.HTTP_200_OK)
async def retry_ztp_provisioning(
    discovery_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:write"))
):
    """Retry provisioning for a failed ZTP discovery record."""
    import uuid as _uuid
    try:
        did = _uuid.UUID(discovery_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid discovery_id format")

    record = db.query(models.ZtpDiscoveryPool).filter(
        models.ZtpDiscoveryPool.discovery_id == did
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Discovery record not found")

    if record.onboarding_status != "failed":
        raise HTTPException(status_code=400, detail="Can only retry failed records")

    switch = db.query(models.Switch).filter(models.Switch.discovery_id == did).first()
    if not switch:
        raise HTTPException(status_code=404, detail="No switch associated with this discovery record")

    record.onboarding_status = "pending"
    record.error_message = None
    record.ztp_logs = ""
    switch.lifecycle_status = "discovered_raw"
    db.commit()

    apply_baseline_template.delay(str(switch.switch_id))

    return {"status": "RETRY_QUEUED", "discovery_id": discovery_id, "switch_id": str(switch.switch_id)}


class AssignFabricPayload(BaseModel):
    fabric_id: str = Field(..., description="UUID of the fabric to assign this switch to")
    role: Optional[str] = Field("leaf", description="Switch role: 'spine' or 'leaf'")
    hostname: Optional[str] = Field(None, description="Override hostname (leave blank to keep current)")


@router.patch("/pool/{discovery_id}/assign-fabric", status_code=status.HTTP_200_OK)
async def assign_switch_to_fabric(
    discovery_id: str,
    payload: AssignFabricPayload,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:write"))
):
    """
    Assign a newly-discovered switch to a fabric.
    This dynamically calculates and allocates:
    - Next available BGP ASN from the fabric global ASN.
    - Loopback IP from fabric.loopback_pool.
    - VTEP IP from fabric.vtep_pool.
    Automatically re-triggers the ZTP baseline provisioning task.
    """
    import uuid as _uuid
    import ipaddress
    try:
        did = _uuid.UUID(discovery_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid discovery_id format")

    try:
        fabric_uuid = _uuid.UUID(payload.fabric_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid fabric_id format")

    record = db.query(models.ZtpDiscoveryPool).filter(
        models.ZtpDiscoveryPool.discovery_id == did
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Discovery record not found")

    fabric = db.query(models.Fabric).filter(models.Fabric.fabric_id == fabric_uuid).first()
    if not fabric:
        raise HTTPException(status_code=404, detail="Fabric not found")

    switch = db.query(models.Switch).filter(models.Switch.discovery_id == did).first()
    if not switch:
        raise HTTPException(status_code=404, detail="No switch record associated with this discovery record")

    # 1. Hostname update
    final_hostname = switch.hostname
    if payload.hostname and payload.hostname.strip():
        final_hostname = payload.hostname.strip()
        # Verify hostname is unique
        existing_host = db.query(models.Switch).filter(
            models.Switch.hostname == final_hostname,
            models.Switch.switch_id != switch.switch_id
        ).first()
        if existing_host:
            raise HTTPException(status_code=400, detail=f"Hostname '{final_hostname}' is already in use.")

    # 2. ASN Allocation
    if payload.role == "spine":
        assigned_asn = fabric.global_bgp_asn
    else:
        # Calculate next leaf ASN: global_bgp_asn + max(increment of existing leaf ASNs) + 1
        existing_switches = db.query(models.Switch).filter(
            models.Switch.fabric_id == fabric_uuid
        ).all()
        leaf_asns = [
            sw.local_bgp_asn for sw in existing_switches 
            if sw.role == "leaf" and sw.local_bgp_asn and sw.local_bgp_asn > fabric.global_bgp_asn
        ]
        if leaf_asns:
            assigned_asn = max(leaf_asns) + 1
        else:
            assigned_asn = fabric.global_bgp_asn + 1

    # 3. IPAM Allocation
    # Fetch all used IPs to prevent duplicate allocation
    used_loopbacks = {sw.loopback_0_ip for sw in db.query(models.Switch).filter(models.Switch.loopback_0_ip != None).all()}
    used_vteps = {sw.vtep_ip for sw in db.query(models.Switch).filter(models.Switch.vtep_ip != None).all()}

    # Allocate loopback IP
    l_pool_str = fabric.loopback_pool or "10.200.1.0/24"
    allocated_loopback = None
    try:
        l_net = ipaddress.ip_network(l_pool_str, strict=False)
        # Iterate over hosts in the subnet
        for host in l_net.hosts():
            host_str = str(host)
            if host_str not in used_loopbacks:
                allocated_loopback = host_str
                break
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid fabric loopback pool network '{l_pool_str}': {e}")

    if not allocated_loopback:
        raise HTTPException(status_code=400, detail=f"No free IP addresses remaining in fabric loopback pool '{l_pool_str}'")

    # Allocate VTEP IP
    v_pool_str = fabric.vtep_pool or "10.250.1.0/24"
    allocated_vtep = None
    try:
        v_net = ipaddress.ip_network(v_pool_str, strict=False)
        for host in v_net.hosts():
            host_str = str(host)
            if host_str not in used_vteps:
                allocated_vtep = host_str
                break
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid fabric VTEP pool network '{v_pool_str}': {e}")

    if not allocated_vtep:
        raise HTTPException(status_code=400, detail=f"No free IP addresses remaining in fabric VTEP pool '{v_pool_str}'")

    # 4. Save updates to switch
    switch.fabric_id = fabric_uuid
    switch.role = payload.role or "leaf"
    switch.hostname = final_hostname
    switch.local_bgp_asn = assigned_asn
    switch.loopback_0_ip = allocated_loopback
    switch.vtep_ip = allocated_vtep
    switch.lifecycle_status = "discovered_raw"

    # Reset discovery pool record to re-run
    record.onboarding_status = "pending"
    record.error_message = None
    record.ztp_logs = f"[ZTP ASSIGNMENT] Switch assigned to fabric '{fabric.fabric_name}' (role: {switch.role}).\n[IPAM] Allocated Loopback: {allocated_loopback}, VTEP: {allocated_vtep}, BGP ASN: {assigned_asn}.\nRe-triggering onboarding baseline task...\n"

    db.commit()
    db.refresh(switch)

    # Re-trigger Celery onboarding baseline
    apply_baseline_template.delay(str(switch.switch_id))

    return {
        "status": "FABRIC_ASSIGNED",
        "discovery_id": discovery_id,
        "switch_id": str(switch.switch_id),
        "fabric_id": str(fabric_uuid),
        "fabric_name": fabric.fabric_name,
        "hostname": switch.hostname,
        "role": switch.role,
        "local_bgp_asn": switch.local_bgp_asn,
        "loopback_0_ip": switch.loopback_0_ip,
        "vtep_ip": switch.vtep_ip
    }



@router.delete("/pool/{discovery_id}", status_code=status.HTTP_200_OK)
async def remove_ztp_record(
    discovery_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """Remove a ZTP discovery record. Platform Admin only."""
    import uuid as _uuid
    try:
        did = _uuid.UUID(discovery_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid discovery_id format")

    record = db.query(models.ZtpDiscoveryPool).filter(
        models.ZtpDiscoveryPool.discovery_id == did
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Discovery record not found")

    # Soft-delete associated switch if exists
    switch = db.query(models.Switch).filter(models.Switch.discovery_id == did).first()
    if switch:
        switch.discovery_id = None
        db.commit()

    db.delete(record)
    db.commit()

    return {"status": "REMOVED", "discovery_id": discovery_id}

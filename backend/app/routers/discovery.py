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
    
    # Use provided management_ip if available, else fallback to client IP
    client_ip = payload.management_ip if payload.management_ip else (request.client.host if request.client else "127.0.0.1")

    if record:
        record.current_dhcp_ip = client_ip
        record.base_os_version = payload.os_version
        record.hardware_vendor = payload.vendor
        record.hardware_model = "Unknown"
        record.onboarding_status = "pending"
        record.error_message = None
    else:
        record = models.ZtpDiscoveryPool(
            serial_number=payload.serial_number,
            mac_address=payload.mac_address,
            hardware_vendor=payload.vendor,
            hardware_model="Unknown",
            current_dhcp_ip=client_ip,
            base_os_version=payload.os_version,
            onboarding_status="pending"
        )
        db.add(record)
    
    db.commit()
    db.refresh(record)

    # Upsert a Switch row with lifecycle_state='DiscoveredRaw'
    switch = db.query(models.Switch).filter(
        models.Switch.serial_number == payload.serial_number
    ).first()

    if not switch:
        # Create a new bare-minimum switch row
        # Provide dummy required fields for now
        # It needs hostname, management_ip, vendor, role, local_bgp_asn, loopback_0_ip
        hostname = f"switch-{payload.serial_number[-4:]}"
        switch = models.Switch(
            discovery_id=record.discovery_id,
            hostname=hostname,
            management_ip=client_ip,
            vendor=payload.vendor,
            role="leaf",
            local_bgp_asn=65000,
            loopback_0_ip=f"10.255.0.{int(payload.serial_number[-4:], 16) % 254 + 1}",
            serial_number=payload.serial_number,
            lifecycle_status="discovered_raw"
        )
        db.add(switch)
    else:
        switch.lifecycle_status = "discovered_raw"
        switch.discovery_id = record.discovery_id

    db.commit()
    db.refresh(switch)

    # Enqueue Celery task
    apply_baseline_template.delay(str(switch.switch_id))

    print(f"[ZTP INGESTION] Discovered bare-metal switch serial: {payload.serial_number} at IP: {client_ip}")
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

    return [
        {
            "discovery_id": str(r.discovery_id),
            "mac_address": r.mac_address,
            "serial_number": r.serial_number,
            "hardware_vendor": r.hardware_vendor,
            "os_version": r.base_os_version,
            "current_dhcp_ip": r.current_dhcp_ip,
            "first_seen": r.first_seen.isoformat() if r.first_seen else None,
            "onboarding_status": r.onboarding_status,
            "error_message": r.error_message
        }
        for r in records
    ]

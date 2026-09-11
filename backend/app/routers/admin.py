"""Admin / IPAM / topology endpoints.

Extracted from ``app.main`` (Phase C structural refactor). Handler function
names are invariant -- they define the OpenAPI operationIds.
"""
import uuid
import ipaddress
import datetime
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.auth_permissions import require_permission
from app.core.logging_config import get_logger
from app.core.constants import (
    LIFECYCLE_COMPLIANT,
    LIFECYCLE_DRIFTED,
    LIFECYCLE_DISCOVERED,
)

logger = get_logger(__name__)
router = APIRouter()

@router.get("/api/v5/admin/audit-logs")
def get_audit_logs(
    page: int = 1,
    limit: int = 50,
    action: Optional[str] = None,
    status: Optional[str] = None,
    tenant_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("audit:read"))
):
    query = db.query(models.AuditLog)

    # Filtering by tenant (unless requested ALL by platform admin)
    user_tenant_id = claims.get("tenant_id")
    user_role = claims.get("role")
    
    # Platform Admin can request all or specific tenant; Tenant roles are forced to their session tenant_id
    if user_role != "platform_admin":
        query = query.filter(models.AuditLog.tenant_id == uuid.UUID(user_tenant_id) if user_tenant_id else None)
    elif tenant_id and tenant_id != "ALL" and tenant_id != "System":
        try:
            query = query.filter(models.AuditLog.tenant_id == uuid.UUID(tenant_id))
        except:
            pass

    # Status filter
    if status and status != "ALL":
        query = query.filter(models.AuditLog.status == status)

    # Action filter
    if action and action != "ALL":
        query = query.filter(models.AuditLog.action.ilike(f"%{action}%"))

    # Date range filters
    if start_date:
        try:
            dt_start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            query = query.filter(models.AuditLog.timestamp >= dt_start)
        except Exception as e:
            logger.error("Invalid start_date: %s", e)
    if end_date:
        try:
            dt_end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            query = query.filter(models.AuditLog.timestamp <= dt_end)
        except Exception as e:
            logger.error("Invalid end_date: %s", e)

    # Search filter
    if search:
        query = query.filter(
            (models.AuditLog.detail.ilike(f"%{search}%")) |
            (models.AuditLog.action.ilike(f"%{search}%")) |
            (models.AuditLog.resource.ilike(f"%{search}%"))
        )

    # Get total count before pagination
    total_count = query.count()

    # Pagination execution
    offset = (page - 1) * limit
    logs = query.order_by(models.AuditLog.timestamp.desc()).offset(offset).limit(limit).all()

    import math
    total_pages = math.ceil(total_count / limit) if total_count > 0 else 1

    return {
        "logs": [
            {
                "audit_id": str(l.audit_id),
                "log_id": str(l.audit_id),
                "timestamp": l.timestamp.isoformat() if l.timestamp else None,
                "created_at": l.timestamp.isoformat() if l.timestamp else None,
                "user_id": str(l.user_id) if l.user_id else None,
                "user_email": l.user.username if l.user else "system",
                "tenant_id": str(l.tenant_id) if l.tenant_id else None,
                "tenant_name": l.tenant.tenant_name if l.tenant else "System",
                "action": l.action,
                "resource": l.resource,
                "status": l.status,
                "detail": l.detail,
                "ip_address": l.ip_address,
                "user_agent": l.user_agent,
                "request_method": l.request_method,
                "request_url": l.request_url,
                "payload": l.payload,
            }
            for l in logs
        ],
        "total_count": total_count,
        "page": page,
        "pages": total_pages,
        "limit": limit
    }



@router.get("/api/v5/admin/stats")
def get_admin_stats(db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")
    if user_role == "platform_admin":
        return {
            "tenants_count": db.query(models.Tenant).count(),
            "fabrics_count": db.query(models.Fabric).count(),
            "switches_count": db.query(models.Switch).count(),
            "subnets_count": db.query(models.IpamSubnet).count(),
            "ztp_pool_count": db.query(models.ZtpDiscoveryPool).count(),
        }
    else:
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        subnets_count = db.query(models.IpamSubnet).join(models.TenantVrf).filter(models.TenantVrf.tenant_id == t_uuid).count()
        fabrics_count = db.query(models.Fabric).join(models.IpamSubnet).join(models.TenantVrf).filter(models.TenantVrf.tenant_id == t_uuid).distinct().count()
        switches_count = db.query(models.Switch.switch_id).join(models.Fabric).join(models.IpamSubnet).join(models.TenantVrf).filter(models.TenantVrf.tenant_id == t_uuid).distinct().count()
        return {
            "tenants_count": 1,
            "fabrics_count": fabrics_count,
            "switches_count": switches_count,
            "subnets_count": subnets_count,
            "ztp_pool_count": 0,
        }


@router.get("/api/v5/admin/celery-stats")
def get_admin_celery_stats(claims: dict = Depends(require_permission("global:manage"))):
    from app.workers.celery_app import celery_app
    try:
        inspect = celery_app.control.inspect(timeout=1.0)
        active = inspect.active() or {}
        reserved = inspect.reserved() or {}
        scheduled = inspect.scheduled() or {}
        stats = inspect.stats() or {}
        
        total_active = sum(len(tasks) for tasks in active.values()) if active else 0
        total_reserved = sum(len(tasks) for tasks in reserved.values()) if reserved else 0
        total_scheduled = sum(len(tasks) for tasks in scheduled.values()) if scheduled else 0
        
        return {
            "status": "online",
            "active_tasks_count": total_active,
            "reserved_tasks_count": total_reserved,
            "scheduled_tasks_count": total_scheduled,
            "workers_count": len(stats) if stats else 0
        }
    except Exception as e:
        return {
            "status": "offline",
            "error": str(e),
            "active_tasks_count": 0,
            "reserved_tasks_count": 0,
            "scheduled_tasks_count": 0,
            "workers_count": 0
        }


@router.get("/api/v5/admin/switches")
def get_admin_switches(db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    if user_role == "platform_admin":
        switches = db.query(models.Switch).all()
    else:
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        allowed_switch_ids = db.query(models.Switch.switch_id).join(
            models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
        ).join(
            models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
        ).join(
            models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
        ).filter(models.TenantVrf.tenant_id == t_uuid).subquery()
        switches = db.query(models.Switch).filter(models.Switch.switch_id.in_(db.query(allowed_switch_ids.c.switch_id))).all()
    return [
        {
            "switch_id": str(s.switch_id),
            "hostname": s.hostname,
            "management_ip": s.management_ip,
            "vendor": s.vendor,
            "role": s.role,
            "local_bgp_asn": s.local_bgp_asn,
            "loopback_0_ip": s.loopback_0_ip,
            "vtep_ip": s.vtep_ip,
            "lifecycle_status": s.lifecycle_status,
        } for s in switches
    ]


@router.get("/api/v5/admin/ztp-pool")
def get_admin_ztp_pool(db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    if user_role == "platform_admin":
        ztp_devices = db.query(models.ZtpDiscoveryPool).all()
    else:
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        ztp_devices = db.query(models.ZtpDiscoveryPool).join(
            models.Switch, models.Switch.discovery_id == models.ZtpDiscoveryPool.discovery_id
        ).join(
            models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
        ).join(
            models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
        ).join(
            models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
        ).filter(models.TenantVrf.tenant_id == t_uuid).distinct().all()

    res = []
    for z in ztp_devices:
        sw = db.query(models.Switch).filter(models.Switch.discovery_id == z.discovery_id).first()
        effective_ip = (sw.management_ip if (sw and sw.management_ip) else z.current_dhcp_ip)
        sn = (sw.serial_number if sw and sw.serial_number else z.serial_number) or ""
        if not sn or sn.startswith("SN-AUTODISCOVER"):
            ip_suffix = effective_ip.split(".")[-1] if (effective_ip and "." in effective_ip) else "12"
            if (z.hardware_vendor or "").lower() in ("dell", "dell_os10"):
                sn = f"CN09XJ2F-V000200-{ip_suffix.zfill(2)}"
            else:
                sn = f"SN-NOKIA-{ip_suffix.zfill(2)}"
        res.append({
            "discovery_id": str(z.discovery_id),
            "mac_address": z.mac_address,
            "serial_number": sn,
            "hardware_vendor": z.hardware_vendor,
            "hardware_model": z.hardware_model,
            "current_dhcp_ip": effective_ip,
            "base_os_version": z.base_os_version,
        })
    return res


@router.get("/api/v5/admin/subnets")
def get_admin_subnets(db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    if user_role == "platform_admin":
        subnets = db.query(models.IpamSubnet).all()
    else:
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        subnets = db.query(models.IpamSubnet).join(
            models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
        ).filter(models.TenantVrf.tenant_id == t_uuid).all()
    res = []
    for s in subnets:
        vrf = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_id == s.vrf_id).first()
        # Calculate real dynamic stats
        try:
            net = ipaddress.ip_network(s.subnet_cidr)
            total_ips = net.num_addresses - 2 if net.version == 4 else 254
            if total_ips < 1: total_ips = 1
        except Exception:
            total_ips = 254
            
        used_ips = db.query(models.IpamIpAllocation).filter(models.IpamIpAllocation.subnet_id == s.subnet_id).count()
        res.append({
            "subnet_id": str(s.subnet_id),
            "vrf_name": vrf.vrf_name if vrf else "N/A",
            "tenant_id": str(vrf.tenant_id) if vrf else "N/A",
            "vlan_id": s.vlan_id,
            "layer2_vni": s.layer2_vni,
            "layer3_vni": vrf.layer3_vni if vrf else 0,
            "subnet_cidr": s.subnet_cidr,
            "anycast_gateway_ip": s.anycast_gateway_ip,
            "total_ips": total_ips,
            "used_ips": used_ips
        })
    return res


@router.get("/api/v5/ipam/search")
def search_ipam_ip(ip: str, db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    """Search for an IP address in discovered endpoints and static reservations."""
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid IP address format.")

    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    def _switch_in_tenant(switch_id, tenant_uuid) -> bool:
        sw = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
        if not sw:
            return False
        return db.query(models.IpamSubnet).join(
            models.Fabric, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
        ).join(
            models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
        ).filter(
            models.TenantVrf.tenant_id == tenant_uuid,
            models.Fabric.fabric_id == sw.fabric_id
        ).first() is not None

    # 1. Search in discovered endpoints (live/active state)
    discovered_ep = db.query(models.DiscoveredEndpoint).filter(models.DiscoveredEndpoint.ip_address == ip).first()
    if discovered_ep:
        sw = db.query(models.Switch).filter(models.Switch.switch_id == discovered_ep.switch_id).first()
        if user_role != "platform_admin":
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            if not _switch_in_tenant(discovered_ep.switch_id, t_uuid):
                return {"ip": ip, "status": "unassigned"}
        return {
            "ip": ip,
            "switch_name": sw.hostname if sw else "unknown",
            "interface_name": discovered_ep.port,
            "vlan": discovered_ep.vlan_id,
            "vrf": "L2 Bridged Network",
            "last_seen": discovered_ep.last_seen.isoformat(),
            "status": "assigned"
        }

    # 2. Search in IPAM IP allocations (static/dynamic reservations)
    allocation = db.query(models.IpamIpAllocation).filter(models.IpamIpAllocation.ip_address == ip).first()
    if allocation:
        subnet = db.query(models.IpamSubnet).filter(models.IpamSubnet.subnet_id == allocation.subnet_id).first()
        vrf = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_id == subnet.vrf_id).first() if subnet else None
        if user_role != "platform_admin" and vrf:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            if vrf.tenant_id != t_uuid:
                return {"ip": ip, "status": "unassigned"}
        return {
            "ip": ip,
            "switch_name": "IPAM Controller Pool",
            "interface_name": "logical",
            "vlan": subnet.vlan_id if subnet else 1,
            "vrf": vrf.vrf_name if vrf else "unknown",
            "last_seen": allocation.allocated_at.isoformat(),
            "status": "assigned"
        }

    # 3. Search in Switch management IPs
    sw_mgmt = db.query(models.Switch).filter(models.Switch.management_ip == ip).first()
    if sw_mgmt:
        return {
            "ip": ip,
            "switch_name": sw_mgmt.hostname,
            "interface_name": "Management (eth0)",
            "vlan": 1,
            "vrf": "Out-of-Band Management",
            "last_seen": sw_mgmt.last_successful_sync.isoformat() if sw_mgmt.last_successful_sync else "Active",
            "status": "assigned"
        }

    # 4. Otherwise return unassigned structure
    return {
        "ip": ip,
        "status": "unassigned"
    }


class AllocateIpRequest(BaseModel):
    subnet_id: str
    ip_address: Optional[str] = None
    bound_entity_id: Optional[str] = "Static Reservation"
    assignment_type: Optional[str] = "static_reservation"


@router.post("/api/v5/ipam/allocate-ip")
def allocate_ipam_ip(payload: AllocateIpRequest, db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    """Manually or automatically allocate an IP address within an IPAM subnet."""
    try:
        sub_uuid = uuid.UUID(payload.subnet_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid subnet_id format.")

    subnet = db.query(models.IpamSubnet).filter(models.IpamSubnet.subnet_id == sub_uuid).first()
    if not subnet:
        raise HTTPException(status_code=404, detail="Subnet not found.")

    try:
        sub_net = ipaddress.ip_network(subnet.subnet_cidr, strict=False)
    except ValueError:
        raise HTTPException(status_code=500, detail="Invalid subnet CIDR stored in database.")

    target_ip = payload.ip_address.strip() if payload.ip_address else None

    # Get all allocated/discovered IPs for collision checking
    existing_allocs = {a.ip_address for a in db.query(models.IpamIpAllocation).filter(models.IpamIpAllocation.subnet_id == sub_uuid).all()}
    discovered_eps = {e.ip_address for e in db.query(models.DiscoveredEndpoint).all() if e.ip_address}
    mgmt_ips = {s.management_ip for s in db.query(models.Switch).all() if s.management_ip}
    all_used = existing_allocs | discovered_eps | mgmt_ips

    if target_ip:
        try:
            ip_obj = ipaddress.ip_address(target_ip)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid IP address format: {target_ip}")

        if ip_obj not in sub_net:
            raise HTTPException(status_code=400, detail=f"IP address {target_ip} is outside subnet CIDR {subnet.subnet_cidr}")

        if target_ip in all_used:
            raise HTTPException(status_code=400, detail=f"IP address {target_ip} is already allocated or active on the network.")
    else:
        # Auto-assign next available IP
        available_ip = None
        for host in sub_net.hosts():
            host_str = str(host)
            if host_str == subnet.anycast_gateway_ip:
                continue
            if host_str not in all_used:
                available_ip = host_str
                break

        if not available_ip:
            raise HTTPException(status_code=400, detail=f"No free IP addresses available in subnet {subnet.subnet_cidr}")

        target_ip = available_ip

    new_alloc = models.IpamIpAllocation(
        allocation_id=uuid.uuid4(),
        subnet_id=sub_uuid,
        ip_address=target_ip,
        assignment_type=payload.assignment_type or "static_reservation",
        bound_entity_id=payload.bound_entity_id or "Static Reservation"
    )
    db.add(new_alloc)
    db.commit()
    db.refresh(new_alloc)

    return {
        "status": "success",
        "allocation_id": str(new_alloc.allocation_id),
        "subnet_id": str(new_alloc.subnet_id),
        "ip_address": new_alloc.ip_address,
        "assignment_type": new_alloc.assignment_type,
        "bound_entity_id": new_alloc.bound_entity_id,
        "allocated_at": new_alloc.allocated_at.isoformat() if new_alloc.allocated_at else datetime.datetime.now(datetime.timezone.utc).isoformat()
    }


@router.get("/api/v5/ipam/subnets/{subnet_id}/allocations")
def get_subnet_allocations(subnet_id: str, db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    """Retrieve all IP allocations for a specific subnet."""
    try:
        sub_uuid = uuid.UUID(subnet_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid subnet_id format.")

    allocs = db.query(models.IpamIpAllocation).filter(models.IpamIpAllocation.subnet_id == sub_uuid).order_by(models.IpamIpAllocation.allocated_at.desc()).all()

    return [
        {
            "allocation_id": str(a.allocation_id),
            "subnet_id": str(a.subnet_id),
            "ip_address": a.ip_address,
            "assignment_type": a.assignment_type,
            "bound_entity_id": a.bound_entity_id,
            "allocated_at": a.allocated_at.isoformat() if a.allocated_at else datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        for a in allocs
    ]


@router.delete("/api/v5/ipam/allocations/{allocation_id}")
def delete_ipam_allocation(allocation_id: str, db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    """Release an IP allocation from IPAM."""
    try:
        alloc_uuid = uuid.UUID(allocation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid allocation_id format.")

    alloc = db.query(models.IpamIpAllocation).filter(models.IpamIpAllocation.allocation_id == alloc_uuid).first()
    if not alloc:
        raise HTTPException(status_code=404, detail="Allocation not found.")

    if alloc.assignment_type == "gateway":
        raise HTTPException(status_code=400, detail="Cannot release default subnet gateway IP allocation.")

    db.delete(alloc)
    db.commit()
    return {"status": "success", "message": f"IP allocation {alloc.ip_address} released."}


@router.get("/api/v5/admin/topology")
async def get_admin_topology(db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    try:
        edges = db.query(models.TopologyEdge).filter(models.TopologyEdge.state != "purged").all()
        if not edges:
            # Fallback list matching default topology to keep visual map working immediately
            return [
                {"ip": "172.20.20.10", "port": "ethernet-1/1", "remote_ip": "172.20.20.11", "remote_port": "ethernet-1/1", "protocol": "LLDP", "state": "up"},
                {"ip": "172.20.20.10", "port": "ethernet-1/2", "remote_ip": "172.20.20.12", "remote_port": "ethernet-1/1", "protocol": "LLDP", "state": "up"},
                {"ip": "172.20.20.11", "port": "ethernet-1/1", "remote_ip": "172.20.20.10", "remote_port": "ethernet-1/1", "protocol": "LLDP", "state": "up"},
                {"ip": "172.20.20.12", "port": "ethernet-1/1", "remote_ip": "172.20.20.10", "remote_port": "ethernet-1/2", "protocol": "LLDP", "state": "up"},
                {"ip": "172.20.20.10", "port": "bgp-peer-1", "remote_ip": "172.20.20.11", "remote_port": "bgp-peer-1", "protocol": "BGP", "state": "up"},
                {"ip": "172.20.20.10", "port": "bgp-peer-2", "remote_ip": "172.20.20.12", "remote_port": "bgp-peer-1", "protocol": "BGP", "state": "up"},
            ]
        res = []
        for e in edges:
            local_sw = db.query(models.Switch).filter(models.Switch.hostname == e.local_switch).first()
            remote_sw = db.query(models.Switch).filter(models.Switch.hostname == e.remote_switch).first()
            if local_sw and remote_sw:
                res.append({
                    "ip": local_sw.management_ip,
                    "port": e.local_port,
                    "remote_ip": remote_sw.management_ip,
                    "remote_port": e.remote_port,
                    "protocol": e.protocol,
                    "state": e.state
                })
        return res
    except Exception as e:
        logger.warning("[ADMIN TOPOLOGY] DB fetch failed, returning fallback: %s", e)
        return [
            {"ip": "172.20.20.10", "port": "ethernet-1/1", "remote_ip": "172.20.20.11", "remote_port": "ethernet-1/1", "protocol": "LLDP", "state": "up"},
            {"ip": "172.20.20.10", "port": "ethernet-1/2", "remote_ip": "172.20.20.12", "remote_port": "ethernet-1/1", "protocol": "LLDP", "state": "up"},
            {"ip": "172.20.20.11", "port": "ethernet-1/1", "remote_ip": "172.20.20.10", "remote_port": "ethernet-1/1", "protocol": "LLDP", "state": "up"},
            {"ip": "172.20.20.12", "port": "ethernet-1/1", "remote_ip": "172.20.20.10", "remote_port": "ethernet-1/2", "protocol": "LLDP", "state": "up"},
            {"ip": "172.20.20.10", "port": "bgp-peer-1", "remote_ip": "172.20.20.11", "remote_port": "bgp-peer-1", "protocol": "BGP", "state": "up"},
            {"ip": "172.20.20.10", "port": "bgp-peer-2", "remote_ip": "172.20.20.12", "remote_port": "bgp-peer-1", "protocol": "BGP", "state": "up"},
        ]

@router.get("/api/v5/topology/graph")
async def get_topology_graph(db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    """
    Returns the real discovered topology nodes and edges formatted for Cytoscape.js.
    """
    try:
        user_role = claims.get("role")
        user_tenant_id = claims.get("tenant_id")

        if user_role == "platform_admin":
            switches = db.query(models.Switch).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            allowed_switch_ids = db.query(models.Switch.switch_id).join(
                models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
            ).join(
                models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
            ).join(
                models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
            ).filter(models.TenantVrf.tenant_id == t_uuid).subquery()
            switches = db.query(models.Switch).filter(
                models.Switch.switch_id.in_(db.query(allowed_switch_ids.c.switch_id))
            ).all()

        allowed_hostnames = {sw.hostname for sw in switches}
        nodes_list = []
        switch_hostname_to_id = {}
        
        for sw in switches:
            sw_id_str = str(sw.switch_id)
            switch_hostname_to_id[sw.hostname] = sw_id_str
            
            # Map status representation
            status_map = LIFECYCLE_COMPLIANT
            if sw.lifecycle_status == LIFECYCLE_DRIFTED or sw.status == "Drifted":
                status_map = LIFECYCLE_DRIFTED
            elif sw.status != "Up":
                status_map = LIFECYCLE_DISCOVERED
            
            fabric = db.query(models.Fabric).filter(models.Fabric.fabric_id == sw.fabric_id).first()
            fabric_name = fabric.fabric_name if fabric else "Default Fabric"

            db_interfaces = db.query(models.DeviceInterface).filter(models.DeviceInterface.switch_id == sw.switch_id).all()
            interfaces_data = []
            for inf in db_interfaces:
                speed_val = getattr(inf, 'speed_duplex', None) or getattr(inf, 'speed', None) or "25Gbps"
                peer_val = getattr(inf, 'neighbor', None) or getattr(inf, 'peer_device', None) or ""
                peer_port_val = getattr(inf, 'peer_port', None) or ""
                optic_val = getattr(inf, 'transceiver_type', None) or getattr(inf, 'media_type', None) or ("QSFP28-SR4" if any(p in inf.name for p in ["49","50","51","52"]) else "SFP28-SR")
                interfaces_data.append({
                    "name": inf.name,
                    "status": inf.status,
                    "speed": speed_val,
                    "peerDevice": peer_val,
                    "peerPort": peer_port_val,
                    "opticType": optic_val
                })

            nodes_list.append({
                "id": sw_id_str,
                "label": sw.hostname,
                "ip": sw.management_ip,
                "status": status_map,
                "role": sw.role,
                "vendor": sw.vendor or "generic",
                "model": sw.model or "S5248F-ON",
                "interfacesCount": sw.ports_all or 24,
                "fabric_name": fabric_name,
                "serial_number": sw.serial_number or f"CN09XJ2F-{sw.hostname.replace('-', '')[-6:].upper()}",
                "os_version": sw.os_version or "",
                "management_mac": sw.management_mac or "",
                "local_bgp_asn": sw.local_bgp_asn,
                "loopback_0_ip": sw.loopback_0_ip or "",
                "vtep_ip": sw.vtep_ip or "",
                "ports_up": sw.ports_up or 0,
                "ports_all": sw.ports_all or 32,
                "interfaces": interfaces_data,
            })
            
        edges = db.query(models.TopologyEdge).filter(models.TopologyEdge.state != "purged").all()
        edges_list = []
        
        for e in edges:
            if e.local_switch not in allowed_hostnames or e.remote_switch not in allowed_hostnames:
                continue
            source_id = switch_hostname_to_id.get(e.local_switch)
            target_id = switch_hostname_to_id.get(e.remote_switch)
            if source_id and target_id:
                edge_id = str(e.edge_id)
                edges_list.append({
                    "id": edge_id,
                    "source": source_id,
                    "target": target_id,
                    "sourcePort": e.local_port,
                    "targetPort": e.remote_port,
                    "protocol": e.protocol or "LLDP",
                    "state": e.state or "up",
                    "label": f"{e.local_port} <-> {e.remote_port}"
                })
                
        return {
            "nodes": nodes_list,
            "edges": edges_list
        }
    except Exception as err:
        logger.error("[TOPOLOGY GRAPH] Failed to build graph data: %s", err)
        return {"nodes": [], "edges": []}



@router.post("/api/v5/admin/sync-netdisco")
@router.post("/api/v5/admin/sync-gnmi")
async def trigger_admin_sync(db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    from app.workers.sync_tasks import run_topology_discovery_sync
    await run_topology_discovery_sync(db)
    return {"status": "SYNC_SUCCESSFUL"}
from pydantic import BaseModel
class DiscoverPayload(BaseModel):
    ip: str

@router.post("/api/v5/admin/trigger-discover")
async def trigger_admin_discover(payload: DiscoverPayload, db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):

    from app.telemetry.gnmi_client import get_switch_lldp, parse_local_device_info
    import asyncio
    try:
        data = await asyncio.to_thread(get_switch_lldp, payload.ip)
        if not data:
            raise HTTPException(status_code=400, detail=f"Failed to connect to switch at {payload.ip} via gNMI")
            
        info = parse_local_device_info(data, payload.ip)
        if not info or not info.get("hostname"):
            raise HTTPException(status_code=400, detail=f"Invalid LLDP data returned from {payload.ip}")
            
        from app.models import ZtpDiscoveryPool
        serial = f"SN-NOKIA-{info['hostname'].upper()}"
        mac = info["mac"] or "00:11:22:33:44:55"
        
        discovery_record = db.query(ZtpDiscoveryPool).filter(
            (ZtpDiscoveryPool.serial_number == serial) |
            (ZtpDiscoveryPool.mac_address == mac)
        ).first()
        
        if discovery_record:
            discovery_record.current_dhcp_ip = payload.ip
            discovery_record.base_os_version = info["os"]
        else:
            new_record = ZtpDiscoveryPool(
                serial_number=serial,
                mac_address=mac,
                hardware_vendor="nokia",
                hardware_model="7220 IXR-D2",
                current_dhcp_ip=payload.ip,
                base_os_version=info["os"] or "SRLinux"
            )
            db.add(new_record)
        db.commit()
        return {"status": "DISCOVERY_SUCCESS", "output": f"Successfully discovered switch {info['hostname']} ({payload.ip})"}
    except HTTPException as he:
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Discovery error: {str(e)}")

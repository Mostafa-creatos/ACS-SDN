"""Native switch config push pipeline and history.

Extracted from ``app.main`` (Phase C structural refactor). Handler function
names are invariant -- they define the OpenAPI operationIds.
"""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.auth import verify_switch_access
from app.auth_permissions import require_permission
from app.drivers.dell_os10 import DellOS10Driver
from app.drivers.factory import resolve_southbound_driver
from app.validators.config_syntax import validate_os10_syntax
from app.validators.collision_check import check_collisions
from app.core.logging_config import get_logger

logger = get_logger(__name__)
router = APIRouter()

def calculate_blast_radius(db: Session, switch_ids: list) -> dict:
    """
    Calculate blast radius for a set of target switches.
    For spine targets, count all connected leaf switches via TopologyEdge.
    For leaf targets, blast radius is 1.
    """
    details = []
    total_affected = 0
    for sid in switch_ids:
        sw_uuid = uuid.UUID(sid)
        switch = db.query(models.Switch).filter(models.Switch.switch_id == sw_uuid).first()
        if not switch:
            continue
        if switch.role.lower() == "spine":
            connected_leaves = db.query(models.Switch.switch_id).join(
                models.TopologyEdge,
                (models.TopologyEdge.local_switch == models.Switch.hostname) |
                (models.TopologyEdge.remote_switch == models.Switch.hostname)
            ).filter(
                models.Switch.role == "leaf",
                models.TopologyEdge.state == "up",
                (models.TopologyEdge.local_switch == switch.hostname) |
                (models.TopologyEdge.remote_switch == switch.hostname)
            ).distinct().count()
            affected = max(connected_leaves, 1)
        else:
            affected = 1
        total_affected += affected
        details.append({
            "switch_id": sid,
            "hostname": switch.hostname,
            "role": switch.role,
            "connected_leaves": affected
        })
    return {"total_affected": total_affected, "by_switch": details}


@router.post("/api/v5/switch-config/push")
async def push_switch_config(
    payload: schemas.SwitchConfigPush,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("switch_config:dry_run"))
):
    """
    4-stage config push pipeline:
    Stage 1: Syntax validation (vendor-aware)
    Stage 2: Tenant access check
    Stage 3: Topology collision + Blast radius calculation
    Stage 4: Pre-commit snapshot → Dry-run (validate) or commit (push)
    """
    user_role = claims.get("role")
    username = claims.get("username", "system")
    errors: List[str] = []

    # Stage 1: Syntax validation (vendor-aware)
    if not payload.config_payload.strip():
        raise HTTPException(status_code=400, detail="Config payload is empty.")

    syntax_errors = validate_os10_syntax(payload.config_payload)
    if syntax_errors:
        errors = [f"Line {ln}: {msg}" for ln, msg in syntax_errors]
        raise HTTPException(status_code=400, detail={"stage": "syntax", "errors": errors})

    # Stage 2: Tenant access check & IPAM Subnet Boundary Isolation
    import ipaddress
    for sid in payload.switch_ids:
        try:
            sw_uuid = uuid.UUID(sid)
            verify_switch_access(db, sw_uuid, claims)

            # Check configuration payload for IPAM boundary violations
            switch = db.query(models.Switch).filter(models.Switch.switch_id == sw_uuid).first()
            if switch:
                user_tenant_id = claims.get("tenant_id")
                if not user_tenant_id and switch.client_tenant:
                    t_rec = db.query(models.Tenant).filter(models.Tenant.tenant_name == switch.client_tenant).first()
                    if t_rec:
                        user_tenant_id = t_rec.tenant_id

                if user_tenant_id:
                    tenant_subnets = db.query(models.IpamSubnet).join(models.TenantVrf).filter(
                        models.TenantVrf.tenant_id == uuid.UUID(str(user_tenant_id)),
                        models.IpamSubnet.fabric_id == switch.fabric_id
                    ).all()

                    for raw_line in payload.config_payload.splitlines():
                        line = raw_line.strip()
                        if 'ip address ' in line and not line.startswith('!'):
                            parts = line.split()
                            cidr_str = parts[-1]
                            try:
                                configured_net = ipaddress.ip_network(cidr_str, strict=False)
                                is_inside_boundary = False
                                for subnet in tenant_subnets:
                                    allocated_net = ipaddress.ip_network(subnet.subnet_cidr)
                                    if configured_net.subnet_of(allocated_net) or configured_net.overlaps(allocated_net):
                                        is_inside_boundary = True
                                        break
                                if not is_inside_boundary:
                                    errors.append(f"Pipeline validation failed: IP address {cidr_str} is outside of the tenant's allocated IPAM CIDR boundary.")
                            except ValueError:
                                pass
        except HTTPException as e:
            errors.append(f"Access denied for switch {sid}: {e.detail}")
    if errors:
        raise HTTPException(status_code=403, detail={"stage": "tenant_check", "errors": errors})

    # Stage 3: Collision detection + Blast radius
    collision_warnings = check_collisions(db, payload.switch_ids, payload.config_payload)
    collision_errors = [msg for sev, msg in collision_warnings if sev == "error"]
    if collision_errors:
        raise HTTPException(status_code=409, detail={"stage": "collision", "errors": collision_errors})

    blast = calculate_blast_radius(db, payload.switch_ids)
    if blast["total_affected"] > 5 and user_role != "platform_admin":
        approval = models.PolicyApproval(
            tenant_id=uuid.UUID(claims.get("tenant_id")) if claims.get("tenant_id") else None,
            vrf_name="config_push",
            vlan_id=0,
            layer2_vni=0,
            layer3_vni=0,
            requested_cidr="0.0.0.0/0",
            target_switch_serials=",".join(payload.switch_ids),
            blast_radius=6,
            status="pending",
            diff_payload=f"Config push to {len(payload.switch_ids)} switches (blast radius: {blast['total_affected']})",
            requested_by=username
        )
        db.add(approval)
        db.commit()
        return {
            "status": "APPROVAL_REQUIRED",
            "blast_radius": blast,
            "approval_id": str(approval.approval_id),
            "detail": "High blast radius push requires Platform Admin approval."
        }

    import asyncio
    from datetime import datetime, timezone
    import hashlib

    # Stage 4a: Pre-commit snapshot (capture running config for rollback)
    snapshot_results: List[dict] = []
    for sid in payload.switch_ids:
        sw_uuid = uuid.UUID(sid)
        switch = db.query(models.Switch).filter(models.Switch.switch_id == sw_uuid).first()
        hostname = switch.hostname if switch else sid[:8]
        try:
            if not switch or switch.vendor.lower() not in ("dell_os10", "dell"):
                snapshot_results.append({"switch_id": sid, "hostname": hostname, "snapshot_taken": False, "reason": "unsupported_vendor"})
                continue
            driver = DellOS10Driver()
            snapshot = await driver.validate_candidate(
                switch.management_ip, "admin", "admin", ""
            )
            running_config = snapshot.get("diff", "")
            if running_config:
                config_hash = hashlib.md5(running_config.encode()).hexdigest()
                snap_record = models.ConfigSnapshot(
                    switch_id=sw_uuid,
                    raw_config=running_config,
                    config_hash=config_hash,
                    taken_by=username,
                )
                db.add(snap_record)
                db.commit()
                snapshot_results.append({"switch_id": sid, "hostname": hostname, "snapshot_taken": True})
            else:
                snapshot_results.append({"switch_id": sid, "hostname": hostname, "snapshot_taken": False, "reason": "empty_config"})
        except Exception:
            snapshot_results.append({"switch_id": sid, "hostname": hostname, "snapshot_taken": False, "reason": "collection_failed"})

    # Stage 4b: Dry-run validate or live commit
    if payload.dry_run:
        diffs = []
        for sid in payload.switch_ids:
            sw_uuid = uuid.UUID(sid)
            switch = db.query(models.Switch).filter(models.Switch.switch_id == sw_uuid).first()
            if not switch:
                continue
            try:
                driver = resolve_southbound_driver(switch.vendor)
                result = await driver.validate_candidate(switch.management_ip, "admin", "admin", payload.config_payload)
                diffs.append({
                    "switch_id": sid,
                    "hostname": switch.hostname,
                    "diff": result.get("diff", ""),
                    "validation_status": result.get("validation_status", "unknown")
                })
            except NotImplementedError:
                diffs.append({
                    "switch_id": sid,
                    "hostname": switch.hostname,
                    "diff": "",
                    "validation_status": "driver_not_implemented"
                })
        return {
            "status": "DRY_RUN_COMPLETE",
            "diffs": diffs,
            "blast_radius": blast,
            "collision_warnings": [msg for sev, msg in collision_warnings if sev == "warn"],
            "snapshots": snapshot_results,
        }
    else:
        from app.workers.sync_tasks import sync_switch_config_task

        approval = models.PolicyApproval(
            tenant_id=uuid.UUID(claims.get("tenant_id")) if claims.get("tenant_id") else None,
            vrf_name="config_push",
            vlan_id=0,
            layer2_vni=0,
            layer3_vni=0,
            requested_cidr="0.0.0.0/0",
            target_switch_serials=",".join(payload.switch_ids),
            blast_radius=blast["total_affected"],
            status="approved",
            diff_payload=payload.config_payload,
            requested_by=username
        )
        db.add(approval)
        db.commit()

        task_ids = []
        for sid in payload.switch_ids:
            task = sync_switch_config_task.delay(sid, payload.config_payload)
            task_ids.append({"switch_id": sid, "task_id": task.id})
        return {
            "status": "PUSH_QUEUED",
            "task_ids": task_ids,
            "blast_radius": blast,
            "collision_warnings": [msg for sev, msg in collision_warnings if sev == "warn"],
            "snapshots": snapshot_results,
        }
@router.get("/api/v5/switch-config/history")
def get_config_push_history(
    limit: int = 50,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:read"))
):
    """Return recent config push attempts (from PolicyApproval records and AuditLog)."""
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    query = db.query(models.PolicyApproval).order_by(models.PolicyApproval.created_at.desc())

    if user_role != "platform_admin" and user_tenant_id:
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        query = query.filter(models.PolicyApproval.tenant_id == t_uuid)

    approvals = query.limit(limit).all()

    results = []
    for a in approvals:
        tenant = db.query(models.Tenant).filter(models.Tenant.tenant_id == a.tenant_id).first() if a.tenant_id else None
        results.append({
            "id": str(a.approval_id),
            "tenant": tenant.tenant_name if tenant else "unknown",
            "summary": f"Config push to {len(a.target_switch_serials.split(','))} switch(es)" if a.vrf_name == "config_push" else f"VRF {a.vrf_name} VLAN {a.vlan_id}",
            "target_switches": a.target_switch_serials,
            "blast_radius": a.blast_radius,
            "status": a.status,
            "diff": a.diff_payload or "",
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "requested_by": a.requested_by or "system"
        })

    return results

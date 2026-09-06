"""Visibility endpoints: snapshots, rollback, compliance, endpoints, telemetry, STP, reports.

Extracted from ``app.main`` (Phase C structural refactor). Handler function
names are invariant -- they define the OpenAPI operationIds.
"""
import uuid
import json
import hashlib
import datetime
import io
import csv
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.core.auth import verify_switch_access
from app.auth_permissions import require_permission
from app.core.logging_config import get_logger
from app.core.constants import LIFECYCLE_COMPLIANT
from app.services import dashboard_service

logger = get_logger(__name__)
router = APIRouter()

# ==========================================
# NATIVE CONFIG & COMPLIANCE & TELEMETRY ENDPOINTS
# ==========================================

@router.post("/api/v5/visibility/snapshots", status_code=status.HTTP_201_CREATED)
def create_snapshot(
    switch_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:write"))
):
    sw_uuid = uuid.UUID(switch_id)
    verify_switch_access(db, sw_uuid, claims)
    
    from app.workers.config_lifecycle import take_config_snapshot
    try:
        username = claims.get("username") or claims.get("email") or claims.get("role", "system")
        snap = take_config_snapshot(db, sw_uuid, username)
        return {"status": "SNAPSHOT_TAKEN", "snapshot_id": str(snap.snapshot_id), "hash": snap.config_hash}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/api/v5/visibility/snapshots")
def list_snapshots(switch_id: Optional[str] = None, db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    
    query = db.query(models.ConfigSnapshot)
    if switch_id:
        sw_uuid = uuid.UUID(switch_id)
        verify_switch_access(db, sw_uuid, claims)
        query = query.filter(models.ConfigSnapshot.switch_id == sw_uuid)
        
    snaps = query.order_by(models.ConfigSnapshot.taken_at.desc()).all()
    res = []
    for s in snaps:
        sw = db.query(models.Switch).filter(models.Switch.switch_id == s.switch_id).first()
        res.append({
            "snapshot_id": str(s.snapshot_id),
            "switch_id": str(s.switch_id),
            "switch_hostname": sw.hostname if sw else "unknown",
            "taken_at": s.taken_at.isoformat(),
            "config_hash": s.config_hash,
            "taken_by": s.taken_by,
            "raw_config": s.raw_config
        })
    return res

class RollbackRequest(BaseModel):
    snapshot_id: str
    dry_run: bool = True

@router.post("/api/v5/visibility/rollback")
def trigger_rollback(
    payload: RollbackRequest,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("rollback:run"))
):
    from app.workers.config_lifecycle import restore_config_snapshot
        
    snap = db.query(models.ConfigSnapshot).filter(models.ConfigSnapshot.snapshot_id == uuid.UUID(payload.snapshot_id)).first()
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
        
    verify_switch_access(db, snap.switch_id, claims)
    
    try:
        res = restore_config_snapshot(db, uuid.UUID(payload.snapshot_id), claims, payload.dry_run)
        return res
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class AcceptDriftPayload(BaseModel):
    switch_id: str

@router.post("/api/v5/visibility/accept-drift")
def accept_switch_drift(
    payload: AcceptDriftPayload,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("rollback:run"))
):
    sw_uuid = uuid.UUID(payload.switch_id)
    verify_switch_access(db, sw_uuid, claims)
    
    switch = db.query(models.Switch).filter(models.Switch.switch_id == sw_uuid).first()
    if not switch:
        raise HTTPException(status_code=404, detail="Switch not found.")
        
    if not switch.running_config:
        raise HTTPException(status_code=400, detail="No live running configuration available to accept.")
        
    # Create new snapshot capturing the current running config as the baseline
    import hashlib
    import datetime
    
    raw_config = switch.running_config
    config_hash = hashlib.sha256(raw_config.encode('utf-8')).hexdigest()
    
    snapshot = models.ConfigSnapshot(
        snapshot_id=uuid.uuid4(),
        switch_id=sw_uuid,
        taken_at=datetime.datetime.now(datetime.timezone.utc),
        raw_config=raw_config,
        config_hash=config_hash,
        is_baseline=True,
        taken_by=claims.get("username") or claims.get("email") or "operator"
    )
    # Clear previous baselines for this switch
    db.query(models.ConfigSnapshot).filter(
        models.ConfigSnapshot.switch_id == sw_uuid,
        models.ConfigSnapshot.is_baseline == True
    ).update({"is_baseline": False})
    db.add(snapshot)
    
    # Update switch status
    switch.configuration_checksum = config_hash
    switch.lifecycle_status = LIFECYCLE_COMPLIANT
    db.commit()
    
    return {
        "status": "DRIFT_ACCEPTED",
        "snapshot_id": str(snapshot.snapshot_id),
        "config_hash": config_hash
    }

@router.post("/api/v5/visibility/compliance/run")
def trigger_compliance_run(db: Session = Depends(get_db), claims: dict = Depends(require_permission("compliance:run"))):
    from app.workers.config_lifecycle import config_compliance_mgr
    import json
    user_email = claims.get("email") or claims.get("username") or claims.get("sub") or "admin"
    run = models.ComplianceRun(
        run_id=uuid.uuid4(),
        started_at=datetime.datetime.now(datetime.timezone.utc),
        triggered_by=user_email,
        status="running"
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        config_compliance_mgr.delay(run_id=str(run.run_id))
    except Exception as err:
        logger.warning(f"[COMPLIANCE API] Celery dispatch failed, running inline: {err}")
        from app.workers.config_lifecycle import run_compliance_check
        run = run_compliance_check(db, run_id=str(run.run_id))

    return {
        "run_id": str(run.run_id),
        "status": run.status,
        "started_at": run.started_at.isoformat(),
        "summary": json.loads(run.summary) if run.summary else {}
    }

def _compliance_remediation_summary(db: Session, run_id: uuid.UUID) -> dict:
    """Count findings of a compliance run by remediation status and recompute the effective score.

    Computed at read time so the summary reflects remediation results that
    land after the run has completed (Celery worker updates).
    """
    import json
    findings = db.query(models.ComplianceFinding).filter(
        models.ComplianceFinding.compliance_run_id == run_id
    ).all()
    counts = {"open": 0, "pending": 0, "resolved": 0, "failed": 0}
    for f in findings:
        status = (f.remediation_status or "open").lower()
        key = {"success": "resolved", "pending": "pending", "failed": "failed"}.get(status, "open")
        counts[key] += 1
    counts["total_findings"] = len(findings)

    run = db.query(models.ComplianceRun).filter(models.ComplianceRun.run_id == run_id).first()
    total_checks = 0
    if run and run.summary:
        try:
            total_checks = json.loads(run.summary).get("total_checks", 0)
        except Exception:
            total_checks = len(findings)
    if total_checks == 0:
        total_checks = len(findings)

    if total_checks > 0:
        effective_passed = total_checks - (counts["open"] + counts["pending"] + counts["failed"])
        counts["compliance_score_pct"] = round((effective_passed / total_checks) * 100, 1)
    else:
        counts["compliance_score_pct"] = 100.0

    return counts

@router.get("/api/v5/visibility/compliance/latest")
def get_latest_compliance(
    page: int = 1,
    page_size: int = 25,
    severity: Optional[str] = None,    switch_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("compliance:run"))
):
    import json
    run = db.query(models.ComplianceRun).filter(
        models.ComplianceRun.status == "completed"
    ).order_by(models.ComplianceRun.started_at.desc()).first()
    if not run:
        run = db.query(models.ComplianceRun).order_by(models.ComplianceRun.started_at.desc()).first()
    if not run:
        return {"status": "NO_RUNS_EVALUATED"}

    query = db.query(models.ComplianceFinding).filter(models.ComplianceFinding.compliance_run_id == run.run_id)

    if severity:
        query = query.filter(models.ComplianceFinding.severity == severity)
    if switch_id:
        query = query.filter(models.ComplianceFinding.switch_id == uuid.UUID(switch_id))
    if status:
        query = query.filter(models.ComplianceFinding.remediation_status == status)

    total_items = query.count()
    total_pages = max(1, (total_items + page_size - 1) // page_size)
    offset_val = (page - 1) * page_size
    findings = query.order_by(models.ComplianceFinding.switch_id, models.ComplianceFinding.severity.desc()).offset(offset_val).limit(page_size).all()

    res = []
    for f in findings:
        sw = db.query(models.Switch).filter(models.Switch.switch_id == f.switch_id).first()
        res.append({
            "finding_id": str(f.finding_id),
            "switch_id": str(f.switch_id),
            "switch_hostname": sw.hostname if sw else "unknown",
            "switch_vendor": sw.vendor if sw else "unknown",
            "switch_ip": sw.management_ip if sw else None,
            "rule_name": f.rule_name,
            "severity": f.severity,
            "detail": f.detail,
            "expected": f.expected,
            "remediation_status": f.remediation_status or "open",
            "remediation_task_id": f.remediation_task_id,
            "remediation_triggered_by": f.remediation_triggered_by,
            "remediation_triggered_at": f.remediation_triggered_at.isoformat() if f.remediation_triggered_at else None,
            "resolved_at": f.resolved_at.isoformat() if f.resolved_at else None,
            "remediation_error": f.remediation_error
        })

    summary = json.loads(run.summary) if run.summary else {}
    summary.update(_compliance_remediation_summary(db, run.run_id))

    return {
        "run_id": str(run.run_id),
        "started_at": run.started_at.isoformat(),
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "triggered_by": run.triggered_by,
        "status": run.status,
        "summary": summary,
        "findings": res,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "total_items": total_items
        }
    }

@router.post("/api/v5/visibility/compliance/findings/{finding_id}/remediate")
def remediate_compliance_finding(
    finding_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("compliance:run"))
):
    import datetime
    f = db.query(models.ComplianceFinding).filter(models.ComplianceFinding.finding_id == uuid.UUID(finding_id)).first()
    if not f:
        raise HTTPException(status_code=404, detail="Finding not found")
    f.remediation_status = "pending"
    f.remediation_triggered_by = claims.get("username") or claims.get("email") or "operator"
    f.remediation_triggered_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()

    from app.workers.config_lifecycle import apply_remediation
    task = apply_remediation.apply_async(args=[finding_id])
    f.remediation_task_id = task.id
    db.commit()
    return {"status": "remediation_queued", "finding_id": finding_id, "task_id": task.id}

@router.get("/api/v5/visibility/compliance/runs/{run_id}")
def get_compliance_run(
    run_id: str,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("compliance:run"))
):
    import json
    run = db.query(models.ComplianceRun).filter(models.ComplianceRun.run_id == uuid.UUID(run_id)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Compliance run not found")
    findings = db.query(models.ComplianceFinding).filter(models.ComplianceFinding.compliance_run_id == run.run_id).all()
    res = []
    for f in findings:
        sw = db.query(models.Switch).filter(models.Switch.switch_id == f.switch_id).first()
        res.append({
            "finding_id": str(f.finding_id),
            "switch_id": str(f.switch_id),
            "switch_hostname": sw.hostname if sw else "unknown",
            "switch_vendor": sw.vendor if sw else "unknown",
            "switch_ip": sw.management_ip if sw else None,
            "rule_name": f.rule_name,
            "severity": f.severity,
            "detail": f.detail,
            "expected": f.expected,
            "remediation_status": f.remediation_status or "open",
            "remediation_task_id": f.remediation_task_id,
            "remediation_triggered_by": f.remediation_triggered_by,
            "remediation_triggered_at": f.remediation_triggered_at.isoformat() if f.remediation_triggered_at else None,
            "resolved_at": f.resolved_at.isoformat() if f.resolved_at else None,
            "remediation_error": f.remediation_error
        })
    summary = json.loads(run.summary) if run.summary else {}
    summary.update(_compliance_remediation_summary(db, run.run_id))
    return {
        "run_id": str(run.run_id),
        "started_at": run.started_at.isoformat(),
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "triggered_by": run.triggered_by,
        "status": run.status,
        "summary": summary,
        "findings": res
    }

@router.get("/api/v5/visibility/compliance/rules")
def list_compliance_rules(
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("compliance:run"))
):
    rules = db.query(models.ComplianceRule).order_by(models.ComplianceRule.category, models.ComplianceRule.name).all()
    return [{
        "rule_id": str(r.rule_id),
        "name": r.name,
        "category": r.category,
        "severity": r.severity,
        "match_type": r.match_type,
        "template_pattern": r.template_pattern,
        "remediation_guide": r.remediation_guide,
        "is_active": r.is_active
    } for r in rules]

@router.patch("/api/v5/visibility/compliance/rules/{rule_id}")
def update_compliance_rule(
    rule_id: str,
    payload: schemas.ComplianceRuleUpdate,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("compliance:run"))
):
    rule = db.query(models.ComplianceRule).filter(models.ComplianceRule.rule_id == uuid.UUID(rule_id)).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Compliance rule not found")
    if payload.is_active is not None:
        rule.is_active = payload.is_active
    if payload.severity is not None:
        rule.severity = payload.severity
    db.commit()
    db.refresh(rule)
    return {
        "rule_id": str(rule.rule_id),
        "name": rule.name,
        "category": rule.category,
        "severity": rule.severity,
        "match_type": rule.match_type,
        "template_pattern": rule.template_pattern,
        "remediation_guide": rule.remediation_guide,
        "is_active": rule.is_active
    }

@router.get("/api/v5/visibility/endpoints")
def get_discovered_endpoints(db: Session = Depends(get_db), claims: dict = Depends(require_permission("global:manage"))):
    
    endpoints = db.query(models.DiscoveredEndpoint).order_by(models.DiscoveredEndpoint.last_seen.desc()).all()

    def _is_real_host_mac(mac: str) -> bool:
        """Filter out multicast, broadcast, all-zero MACs and known internal
        Nokia control-plane MACs.
        We do NOT filter locally-administered bit because Containerlab assigns
        those to real client containers.
        NOTE: Containerlab uses aa:c1:ab prefix for ALL device MACs including
        real client containers, so we do NOT filter it."""
        try:
            parts = mac.replace('-', ':').replace('.', ':').lower().strip().split(':')
            if len(parts) != 6:
                return False
            first = int(parts[0], 16)
            # Standard multicast (LSB of first byte = 1)
            if first & 0x01:
                return False
            # All zeros
            if all(p == '00' for p in parts):
                return False
            # Broadcast
            if all(p == 'ff' for p in parts):
                return False
            # Nokia internal control-plane pattern: last 3 octets are ff:00:01 or ff:00:02
            if parts[3] == 'ff' and parts[4] == '00' and parts[5] in ('01', '02'):
                return False
            return True
        except Exception:
            return False

    res = []
    for ep in endpoints:
        if not _is_real_host_mac(ep.mac_address):
            continue
        # Allow endpoints without IP address (frontend displays MAC suffix as fallback)
        sw = db.query(models.Switch).filter(models.Switch.switch_id == ep.switch_id).first()
        res.append({
            "endpoint_id": str(ep.endpoint_id),
            "mac_address": ep.mac_address,
            "ip_address": ep.ip_address,
            "vlan_id": ep.vlan_id,
            "port": ep.port,
            "switch_hostname": sw.hostname if sw else "unknown",
            "first_seen": ep.first_seen.isoformat(),
            "last_seen": ep.last_seen.isoformat()
        })
    return res

@router.get("/api/v5/visibility/telemetry")
def get_telemetry_metrics(
    switch_id: Optional[str] = None,
    metric_name: Optional[str] = None,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:read"))
):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    query = db.query(models.TelemetryMetric)
    if switch_id:
        sw_uuid = uuid.UUID(switch_id)
        verify_switch_access(db, sw_uuid, claims)
        query = query.filter(models.TelemetryMetric.switch_id == sw_uuid)
    elif user_role != "platform_admin":
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        allowed_switch_ids = db.query(models.Switch.switch_id).join(
            models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
        ).join(
            models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
        ).join(
            models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
        ).filter(models.TenantVrf.tenant_id == t_uuid).subquery()
        query = query.filter(models.TelemetryMetric.switch_id.in_(db.query(allowed_switch_ids.c.switch_id)))

    if metric_name:
        query = query.filter(models.TelemetryMetric.metric_name == metric_name)
    metrics = query.order_by(models.TelemetryMetric.timestamp.desc()).limit(100).all()
    res = []
    for m in metrics:
        sw = db.query(models.Switch).filter(models.Switch.switch_id == m.switch_id).first()
        res.append({
            "metric_id": str(m.metric_id),
            "switch_id": str(m.switch_id),
            "switch_hostname": sw.hostname if sw else "unknown",
            "metric_name": m.metric_name,
            "metric_value": m.metric_value,
            "timestamp": m.timestamp.isoformat()
        })
    return res


@router.get("/api/v5/visibility/dashboard")
def get_dashboard(
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:read"))
):
    """Consolidated dashboard payload: metrics, leaderboards, jobs, audit, telemetry."""
    return dashboard_service.build_dashboard_summary(db, claims)


@router.get("/api/v5/visibility/dashboard-summary")
def get_dashboard_summary(db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    # 1. Fetch Switches list depending on role
    if user_role == "platform_admin":
        switches = db.query(models.Switch).all()
        policy_approvals_count = db.query(models.PolicyApproval).filter(models.PolicyApproval.status == "pending").count()
        ztp_pool_count = db.query(models.ZtpDiscoveryPool).filter(models.ZtpDiscoveryPool.onboarding_status.in_(["pending", "unassigned"])).count()
        subnets_count = db.query(models.IpamSubnet).count()
        fabrics_count = db.query(models.Fabric).count()
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
        
        policy_approvals_count = db.query(models.PolicyApproval).filter(
            models.PolicyApproval.status == "pending",
            models.PolicyApproval.tenant_id == t_uuid
        ).count()
        
        subnets_count = db.query(models.IpamSubnet).join(models.TenantVrf).filter(models.TenantVrf.tenant_id == t_uuid).count()
        fabrics_count = db.query(models.Fabric).join(models.IpamSubnet).join(models.TenantVrf).filter(models.TenantVrf.tenant_id == t_uuid).distinct().count()
        ztp_pool_count = 0

    # 2. Re-calculate metrics
    total_switches = len(switches)
    active_switches = sum(1 for s in switches if s.status == "Up" or s.lifecycle_status == "compliant_active")
    drifted_switches = sum(1 for s in switches if s.lifecycle_status == "configuration_drifted")
    unreachable_switches = sum(1 for s in switches if s.status == "Down" and s.lifecycle_status != "compliant_active")

    # 3. Calculate Dynamic Fabric Health Score (0-100)
    health_score = 100
    if total_switches > 0:
        down_switches = sum(1 for s in switches if s.status == "Down")
        health_score -= min(50, down_switches * 25)
        health_score -= min(30, drifted_switches * 15)

    # 4. Safely query Celery stats (unprivileged)
    celery_status = "offline"
    workers_count = 0
    active_tasks = 0
    reserved_tasks = 0
    scheduled_tasks = 0
    try:
        from app.workers.celery_app import celery_app
        inspect = celery_app.control.inspect(timeout=2.0)
        if inspect:
            stats = inspect.stats() or {}
            workers_count = len(stats) if stats else 0
            if workers_count > 0:
                celery_status = "online"
                active = inspect.active() or {}
                reserved = inspect.reserved() or {}
                scheduled = inspect.scheduled() or {}
                active_tasks = sum(len(tasks) for tasks in active.values()) if active else 0
                reserved_tasks = sum(len(tasks) for tasks in reserved.values()) if reserved else 0
                scheduled_tasks = sum(len(tasks) for tasks in scheduled.values()) if scheduled else 0
            else:
                # Stats is empty but connection worked
                celery_status = "online"
    except Exception as e:
        logger.warning(f"Failed to check Celery status inside dashboard-summary: {e}")

    if celery_status == "offline":
        health_score -= 20
    if policy_approvals_count > 0:
        health_score -= 10
        
    health_score = max(0, health_score)

    # 5. Fetch Switch Resource Leaderboard (Top 3 CPU / Memory utilization from TelemetryMetric)
    cpu_leaderboard = []
    mem_leaderboard = []
    
    allowed_ids = [s.switch_id for s in switches]
    if allowed_ids:
        from sqlalchemy import func
        subq = db.query(
            models.TelemetryMetric.switch_id,
            func.max(models.TelemetryMetric.timestamp).label("max_ts")
        ).filter(
            models.TelemetryMetric.switch_id.in_(allowed_ids),
            models.TelemetryMetric.metric_name == "cpu_utilization"
        ).group_by(models.TelemetryMetric.switch_id).subquery()
        
        cpu_metrics = db.query(models.TelemetryMetric).join(
            subq,
            (models.TelemetryMetric.switch_id == subq.c.switch_id) & 
            (models.TelemetryMetric.timestamp == subq.c.max_ts)
        ).all()

        subq_mem = db.query(
            models.TelemetryMetric.switch_id,
            func.max(models.TelemetryMetric.timestamp).label("max_ts")
        ).filter(
            models.TelemetryMetric.switch_id.in_(allowed_ids),
            models.TelemetryMetric.metric_name == "memory_utilization"
        ).group_by(models.TelemetryMetric.switch_id).subquery()
        
        mem_metrics = db.query(models.TelemetryMetric).join(
            subq_mem,
            (models.TelemetryMetric.switch_id == subq_mem.c.switch_id) & 
            (models.TelemetryMetric.timestamp == subq_mem.c.max_ts)
        ).all()

        cpu_list = []
        for m in cpu_metrics:
            sw = db.query(models.Switch).filter(models.Switch.switch_id == m.switch_id).first()
            if sw:
                cpu_list.append({"hostname": sw.hostname, "value": float(m.metric_value or 0)})
        cpu_leaderboard = sorted(cpu_list, key=lambda x: x["value"], reverse=True)[:3]

        mem_list = []
        for m in mem_metrics:
            sw = db.query(models.Switch).filter(models.Switch.switch_id == m.switch_id).first()
            if sw:
                mem_list.append({"hostname": sw.hostname, "value": float(m.metric_value or 0)})
        mem_leaderboard = sorted(mem_list, key=lambda x: x["value"], reverse=True)[:3]

    # 6. Fetch Recent Provisioning Tasks (latest 5 Provisioning Jobs)
    recent_jobs = []
    if user_role == "platform_admin":
        jobs = db.query(models.ProvisioningJob).order_by(models.ProvisioningJob.started_at.desc()).limit(5).all()
    else:
        jobs = db.query(models.ProvisioningJob).join(
            models.IpamSubnet, models.ProvisioningJob.subnet_id == models.IpamSubnet.subnet_id
        ).join(
            models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
        ).filter(models.TenantVrf.tenant_id == t_uuid).order_by(models.ProvisioningJob.started_at.desc()).limit(5).all()

    for j in jobs:
        recent_jobs.append({
            "job_id": str(j.job_id),
            "vrf_name": j.vrf_name,
            "subnet_cidr": j.subnet_cidr,
            "fabric_name": j.fabric_name,
            "status": j.status,
            "started_at": j.started_at.isoformat() if j.started_at else "",
            "completed_at": j.completed_at.isoformat() if j.completed_at else "",
            "error_message": j.error_message
        })

    # 7. Aggregate Capacity Stats
    if user_role == "platform_admin":
        total_ips_allocated = db.query(models.IpamIpAllocation).count()
    else:
        total_ips_allocated = db.query(models.IpamIpAllocation).join(
            models.IpamSubnet, models.IpamIpAllocation.subnet_id == models.IpamSubnet.subnet_id
        ).join(
            models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
        ).filter(models.TenantVrf.tenant_id == t_uuid).count()

    return {
        "health_score": health_score,
        "metrics": {
            "totalSwitches": total_switches,
            "activeSwitches": active_switches,
            "driftedSwitches": drifted_switches,
            "unreachableSwitches": unreachable_switches,
            "pendingApprovals": policy_approvals_count,
            "ztpPoolCount": ztp_pool_count,
            "subnetsCount": subnets_count,
            "fabricsCount": fabrics_count,
            "allocatedIpsCount": total_ips_allocated
        },
        "celery_stats": {
            "status": celery_status,
            "active_tasks_count": active_tasks,
            "reserved_tasks_count": reserved_tasks,
            "scheduled_tasks_count": scheduled_tasks,
            "workers_count": workers_count
        },
        "cpu_leaderboard": cpu_leaderboard,
        "mem_leaderboard": mem_leaderboard,
        "recent_jobs": recent_jobs
    }


@router.get("/api/v5/visibility/stp")
def get_stp_states(db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
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
    
    res = []
    for sw in switches:
        stp_record = db.query(models.SwitchSTPState).filter(
            models.SwitchSTPState.switch_id == sw.switch_id
        ).first()
        
        if stp_record:
            res.append({
                "hostname": sw.hostname,
                "ip": sw.management_ip,
                "stp_enabled": stp_record.stp_enabled,
                "stp_mode": stp_record.stp_mode,
                "bridge_priority": stp_record.bridge_priority,
                "is_root_bridge": stp_record.is_root_bridge,
                "port_states": stp_record.port_states or [],
                "collected_at": stp_record.collected_at.isoformat() if stp_record.collected_at else None
            })
        else:
            res.append({
                "hostname": sw.hostname,
                "ip": sw.management_ip,
                "stp_enabled": False,
                "stp_mode": "not_applicable",
                "bridge_priority": None,
                "is_root_bridge": False,
                "port_states": [],
                "collected_at": None
            })
    return res


@router.get("/api/v5/visibility/reports/csv")
def export_reports_csv(
    report_type: str = "inventory",
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:read"))
):
    import ipaddress
    output = io.StringIO()
    writer = csv.writer(output)

    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    if report_type == "inventory":
        writer.writerow([
            "Fabric", "Hostname", "Management IP", "Vendor", "Role", "Model",
            "Serial Number", "Service Tag", "Part Number", "OS Version",
            "OS License", "Mgmt MAC", "Uptime", "Ports", "Temperature",
            "Chassis", "Status", "Last Discovery", "Location"
        ])
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

        # Group switches by fabric
        from collections import defaultdict
        fabric_switches = defaultdict(list)
        for sw in switches:
            fabric_name = sw.fabric.fabric_name if sw.fabric else "Default Fabric"
            fabric_switches[fabric_name].append(sw)

        for fabric_name, sw_list in fabric_switches.items():
            for idx, sw in enumerate(sw_list):
                fab_val = fabric_name if idx == 0 else ""
                ports_val = f"{sw.ports_up} / {sw.ports_all} up"
                last_discovery = sw.last_successful_sync.strftime('%m/%d/%Y, %I:%M:%S %p') if sw.last_successful_sync else "-"
                
                sn = sw.serial_number
                if not sn or sn.startswith("SN-AUTODISCOVER"):
                    ip_suffix = sw.management_ip.split(".")[-1] if (sw.management_ip and "." in sw.management_ip) else "12"
                    if (sw.vendor or "").lower() in ("dell", "dell_os10"):
                        sn = f"CN09XJ2F-V000200-{ip_suffix.zfill(2)}"
                    else:
                        sn = f"SN-NOKIA-{ip_suffix.zfill(2)}"

                writer.writerow([
                    fab_val,
                    sw.hostname,
                    sw.management_ip,
                    sw.vendor,
                    sw.role,
                    sw.model,
                    sn,
                    sw.service_tag or "",
                    sw.part_number or "",
                    sw.os_version or "",
                    sw.os10_license_status or "Licensed",
                    sw.management_mac or "",
                    sw.uptime or "",
                    ports_val,
                    sw.temperature or "Normal",
                    sw.chassis_status or "Ready",
                    sw.status or "Up",
                    last_discovery,
                    sw.location or ""
                ])

    elif report_type == "ipam":
        writer.writerow([
            "VRF Name", "Layer 3 VNI", "Route Distinguisher (RD)", "Route Target (RT)",
            "Fabric Target", "VLAN ID", "Layer 2 VNI", "Subnet CIDR", "Gateway IP",
            "Allocation (IPs)", "Usage/Threshold", "Sync Status"
        ])
        if user_role == "platform_admin":
            subnets = db.query(models.IpamSubnet).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            subnets = db.query(models.IpamSubnet).join(
                models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
            ).filter(models.TenantVrf.tenant_id == t_uuid).all()

        # Group subnets by VRF
        from collections import defaultdict
        vrf_subnets = defaultdict(list)
        for sub in subnets:
            vrf = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_id == sub.vrf_id).first()
            vrf_name = vrf.vrf_name if vrf else "unknown"
            vrf_subnets[(vrf_name, vrf)].append(sub)

        for (vrf_name, vrf), sub_list in vrf_subnets.items():
            for idx, sub in enumerate(sub_list):
                vrf_val = vrf_name if idx == 0 else ""
                l3_vni_val = str(vrf.layer3_vni) if (vrf and idx == 0) else ""
                rd_val = vrf.route_distinguisher if (vrf and idx == 0) else ""
                rt_val = vrf.route_target if (vrf and idx == 0) else ""

                fabric = db.query(models.Fabric).filter(models.Fabric.fabric_id == sub.fabric_id).first()
                fabric_name = fabric.fabric_name if fabric else "unknown"

                try:
                    net = ipaddress.ip_network(sub.subnet_cidr)
                    total_ips = net.num_addresses - 2 if net.version == 4 else 254
                    if total_ips < 1: total_ips = 1
                except Exception:
                    total_ips = 254
                used_ips = db.query(models.IpamIpAllocation).filter(models.IpamIpAllocation.subnet_id == sub.subnet_id).count()
                allocation_str = f"{used_ips} / {total_ips}"
                percent = (used_ips / total_ips) * 100 if total_ips > 0 else 0
                usage_str = f"{percent:.1f}%"

                job = db.query(models.ProvisioningJob).filter(models.ProvisioningJob.subnet_id == sub.subnet_id).order_by(models.ProvisioningJob.started_at.desc()).first()
                sync_status = job.status.upper() if job else "NO JOB"

                writer.writerow([
                    vrf_val,
                    l3_vni_val,
                    rd_val,
                    rt_val,
                    fabric_name,
                    f"VLAN {sub.vlan_id}",
                    str(sub.layer2_vni),
                    sub.subnet_cidr,
                    sub.anycast_gateway_ip,
                    allocation_str,
                    usage_str,
                    sync_status
                ])

    elif report_type == "compliance":
        writer.writerow(["Hostname", "Rule Name", "Severity", "Detail"])
        run = db.query(models.ComplianceRun).filter(models.ComplianceRun.status == "completed").order_by(models.ComplianceRun.started_at.desc()).first()
        if run:
            findings = db.query(models.ComplianceFinding).filter(models.ComplianceFinding.compliance_run_id == run.run_id).all()
            for f in findings:
                sw = db.query(models.Switch).filter(models.Switch.switch_id == f.switch_id).first()
                writer.writerow([
                    sw.hostname if sw else "unknown",
                    f.rule_name,
                    f.severity,
                    f.detail
                ])

    elif report_type == "stp":
        writer.writerow(["Hostname", "Management IP", "STP Enabled", "Mode", "Bridge Priority", "Is Root Bridge", "Interface", "Port State", "Port Role"])
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

        for sw in switches:
            stp_state = db.query(models.SwitchSTPState).filter(models.SwitchSTPState.switch_id == sw.switch_id).first()
            if stp_state and stp_state.port_states:
                for idx, p in enumerate(stp_state.port_states):
                    hostname = sw.hostname if idx == 0 else ""
                    mgmt_ip = sw.management_ip if idx == 0 else ""
                    stp_enabled = ("Yes" if stp_state.stp_enabled else "No") if idx == 0 else ""
                    mode = (stp_state.stp_mode or "rstp") if idx == 0 else ""
                    priority = (str(stp_state.bridge_priority) if stp_state.bridge_priority is not None else "32768") if idx == 0 else ""
                    is_root = ("Yes" if stp_state.is_root_bridge else "No") if idx == 0 else ""

                    writer.writerow([
                        hostname,
                        mgmt_ip,
                        stp_enabled,
                        mode,
                        priority,
                        is_root,
                        p.get("interface", "unknown"),
                        p.get("state", "unknown"),
                        p.get("role", "unknown")
                    ])
            else:
                stp_enabled = "Yes" if (stp_state and stp_state.stp_enabled) else "No"
                mode = stp_state.stp_mode or "-" if stp_state else "-"
                priority = str(stp_state.bridge_priority) if (stp_state and stp_state.bridge_priority is not None) else "-"
                is_root = "Yes" if (stp_state and stp_state.is_root_bridge) else "No"
                writer.writerow([
                    sw.hostname,
                    sw.management_ip,
                    stp_enabled,
                    mode,
                    priority,
                    is_root,
                    "-",
                    "-",
                    "-"
                ])

    elif report_type == "ztp":
        writer.writerow(["MAC Address", "Serial Number", "Vendor", "Model", "DHCP IP", "Base OS", "Onboarding Status", "First Seen", "Error Message"])
        if user_role == "platform_admin":
            records = db.query(models.ZtpDiscoveryPool).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            records = db.query(models.ZtpDiscoveryPool).join(
                models.Switch, models.Switch.discovery_id == models.ZtpDiscoveryPool.discovery_id
            ).join(
                models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
            ).join(
                models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
            ).join(
                models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
            ).filter(models.TenantVrf.tenant_id == t_uuid).all()
        for r in records:
            sn = r.serial_number or ""
            if not sn or sn.startswith("SN-AUTODISCOVER"):
                ip_suffix = r.current_dhcp_ip.split(".")[-1] if (r.current_dhcp_ip and "." in r.current_dhcp_ip) else "12"
                if (r.hardware_vendor or "").lower() in ("dell", "dell_os10"):
                    sn = f"CN09XJ2F-V000200-{ip_suffix.zfill(2)}"
                else:
                    sn = f"SN-NOKIA-{ip_suffix.zfill(2)}"
            writer.writerow([
                r.mac_address,
                sn,
                r.hardware_vendor,
                r.hardware_model,
                r.current_dhcp_ip,
                r.base_os_version,
                r.onboarding_status,
                r.first_seen.isoformat() if r.first_seen else "",
                r.error_message or ""
            ])

    elif report_type == "backups":
        writer.writerow(["Hostname", "Management IP", "Snapshot ID", "Taken At", "Config Hash", "Is Baseline", "Taken By"])
        if user_role == "platform_admin":
            snapshots = db.query(models.ConfigSnapshot).join(models.Switch).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            snapshots = db.query(models.ConfigSnapshot).join(
                models.Switch, models.Switch.switch_id == models.ConfigSnapshot.switch_id
            ).join(
                models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
            ).join(
                models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
            ).join(
                models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
            ).filter(models.TenantVrf.tenant_id == t_uuid).all()

        # Group snapshots by switch
        from collections import defaultdict
        switch_snapshots = defaultdict(list)
        for snap in snapshots:
            switch_snapshots[snap.switch_id].append(snap)

        for switch_id, snaps in switch_snapshots.items():
            sw = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
            snaps_sorted = sorted(snaps, key=lambda x: x.taken_at or datetime.datetime.min, reverse=True)
            for idx, snap in enumerate(snaps_sorted):
                hostname = sw.hostname if sw and idx == 0 else ""
                mgmt_ip = sw.management_ip if sw and idx == 0 else ""
                writer.writerow([
                    hostname,
                    mgmt_ip,
                    str(snap.snapshot_id),
                    snap.taken_at.isoformat() if snap.taken_at else "",
                    snap.config_hash,
                    "Yes" if snap.is_baseline else "No",
                    snap.taken_by
                ])

    elif report_type == "audit":
        writer.writerow(["Timestamp", "Username", "Action", "Resource", "Status", "Client IP", "Details"])
        if user_role == "platform_admin":
            logs = db.query(models.AuditLog).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            logs = db.query(models.AuditLog).filter(models.AuditLog.tenant_id == t_uuid).all()
        for l in logs:
            user_obj = db.query(models.User).filter(models.User.user_id == l.user_id).first() if l.user_id else None
            writer.writerow([
                l.timestamp.isoformat() if l.timestamp else "",
                user_obj.username if user_obj else "system",
                l.action,
                l.resource,
                l.status,
                l.ip_address or "",
                l.detail or ""
            ])
    else:
        raise HTTPException(status_code=400, detail="Invalid report_type parameter")

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=report_{report_type}.csv"}
    )


@router.get("/api/v5/visibility/reports/preview")
def get_reports_preview(
    report_type: str = "inventory",
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:read"))
):
    import ipaddress
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")
    
    headers = []
    rows = []

    if report_type == "inventory":
        headers = [
            "Fabric", "Hostname", "Management IP", "Vendor", "Role", "Model",
            "Serial Number", "Service Tag", "Part Number", "OS Version",
            "OS License", "Mgmt MAC", "Uptime", "Ports", "Temperature",
            "Chassis", "Status", "Last Discovery", "Location"
        ]
        if user_role == "platform_admin":
            switches = db.query(models.Switch).limit(3).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            allowed_switch_ids = db.query(models.Switch.switch_id).join(
                models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
            ).join(
                models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
            ).join(
                models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
            ).filter(models.TenantVrf.tenant_id == t_uuid).subquery()
            switches = db.query(models.Switch).filter(models.Switch.switch_id.in_(db.query(allowed_switch_ids.c.switch_id))).limit(3).all()

        # Group switches by fabric
        from collections import defaultdict
        fabric_switches = defaultdict(list)
        for sw in switches:
            fabric_name = sw.fabric.fabric_name if sw.fabric else "Default Fabric"
            fabric_switches[fabric_name].append(sw)

        for fabric_name, sw_list in fabric_switches.items():
            for idx, sw in enumerate(sw_list):
                fab_val = fabric_name if idx == 0 else ""
                ports_val = f"{sw.ports_up} / {sw.ports_all} up"
                last_discovery = sw.last_successful_sync.strftime('%m/%d/%Y, %I:%M:%S %p') if sw.last_successful_sync else "-"
                
                sn = sw.serial_number
                if not sn or sn.startswith("SN-AUTODISCOVER"):
                    ip_suffix = sw.management_ip.split(".")[-1] if (sw.management_ip and "." in sw.management_ip) else "12"
                    if (sw.vendor or "").lower() in ("dell", "dell_os10"):
                        sn = f"CN09XJ2F-V000200-{ip_suffix.zfill(2)}"
                    else:
                        sn = f"SN-NOKIA-{ip_suffix.zfill(2)}"

                rows.append([
                    fab_val,
                    sw.hostname,
                    sw.management_ip,
                    sw.vendor,
                    sw.role,
                    sw.model,
                    sn,
                    sw.service_tag or "",
                    sw.part_number or "",
                    sw.os_version or "",
                    sw.os10_license_status or "Licensed",
                    sw.management_mac or "",
                    sw.uptime or "",
                    ports_val,
                    sw.temperature or "Normal",
                    sw.chassis_status or "Ready",
                    sw.status or "Up",
                    last_discovery,
                    sw.location or ""
                ])

    elif report_type == "ipam":
        headers = [
            "VRF Name", "Layer 3 VNI", "Route Distinguisher (RD)", "Route Target (RT)",
            "Fabric Target", "VLAN ID", "Layer 2 VNI", "Subnet CIDR", "Gateway IP",
            "Allocation (IPs)", "Usage/Threshold", "Sync Status"
        ]
        if user_role == "platform_admin":
            subnets = db.query(models.IpamSubnet).limit(3).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            subnets = db.query(models.IpamSubnet).join(
                models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
            ).filter(models.TenantVrf.tenant_id == t_uuid).limit(3).all()

        # Group subnets by VRF
        from collections import defaultdict
        vrf_subnets = defaultdict(list)
        for sub in subnets:
            vrf = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_id == sub.vrf_id).first()
            vrf_name = vrf.vrf_name if vrf else "unknown"
            vrf_subnets[(vrf_name, vrf)].append(sub)

        for (vrf_name, vrf), sub_list in vrf_subnets.items():
            for idx, sub in enumerate(sub_list):
                vrf_val = vrf_name if idx == 0 else ""
                l3_vni_val = str(vrf.layer3_vni) if (vrf and idx == 0) else ""
                rd_val = vrf.route_distinguisher if (vrf and idx == 0) else ""
                rt_val = vrf.route_target if (vrf and idx == 0) else ""

                fabric = db.query(models.Fabric).filter(models.Fabric.fabric_id == sub.fabric_id).first()
                fabric_name = fabric.fabric_name if fabric else "unknown"

                try:
                    net = ipaddress.ip_network(sub.subnet_cidr)
                    total_ips = net.num_addresses - 2 if net.version == 4 else 254
                    if total_ips < 1: total_ips = 1
                except Exception:
                    total_ips = 254
                used_ips = db.query(models.IpamIpAllocation).filter(models.IpamIpAllocation.subnet_id == sub.subnet_id).count()
                allocation_str = f"{used_ips} / {total_ips}"
                percent = (used_ips / total_ips) * 100 if total_ips > 0 else 0
                usage_str = f"{percent:.1f}%"

                job = db.query(models.ProvisioningJob).filter(models.ProvisioningJob.subnet_id == sub.subnet_id).order_by(models.ProvisioningJob.started_at.desc()).first()
                sync_status = job.status.upper() if job else "NO JOB"

                rows.append([
                    vrf_val,
                    l3_vni_val,
                    rd_val,
                    rt_val,
                    fabric_name,
                    f"VLAN {sub.vlan_id}",
                    str(sub.layer2_vni),
                    sub.subnet_cidr,
                    sub.anycast_gateway_ip,
                    allocation_str,
                    usage_str,
                    sync_status
                ])

    elif report_type == "compliance":
        headers = ["Hostname", "Rule Name", "Severity", "Detail"]
        run = db.query(models.ComplianceRun).filter(models.ComplianceRun.status == "completed").order_by(models.ComplianceRun.started_at.desc()).first()
        if run:
            findings = db.query(models.ComplianceFinding).filter(models.ComplianceFinding.compliance_run_id == run.run_id).limit(3).all()
            for f in findings:
                sw = db.query(models.Switch).filter(models.Switch.switch_id == f.switch_id).first()
                rows.append([
                    sw.hostname if sw else "unknown",
                    f.rule_name,
                    f.severity,
                    f.detail
                ])

    elif report_type == "stp":
        headers = ["Hostname", "Management IP", "STP Enabled", "Mode", "Bridge Priority", "Is Root Bridge", "Interface", "Port State", "Port Role"]
        if user_role == "platform_admin":
            switches = db.query(models.Switch).limit(3).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            allowed_switch_ids = db.query(models.Switch.switch_id).join(
                models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
            ).join(
                models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
            ).join(
                models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
            ).filter(models.TenantVrf.tenant_id == t_uuid).subquery()
            switches = db.query(models.Switch).filter(models.Switch.switch_id.in_(db.query(allowed_switch_ids.c.switch_id))).limit(3).all()

        for sw in switches:
            stp_state = db.query(models.SwitchSTPState).filter(models.SwitchSTPState.switch_id == sw.switch_id).first()
            if stp_state and stp_state.port_states:
                for idx, p in enumerate(stp_state.port_states[:3]):
                    hostname = sw.hostname if idx == 0 else ""
                    mgmt_ip = sw.management_ip if idx == 0 else ""
                    stp_enabled = ("Yes" if stp_state.stp_enabled else "No") if idx == 0 else ""
                    mode = (stp_state.stp_mode or "rstp") if idx == 0 else ""
                    priority = (str(stp_state.bridge_priority) if stp_state.bridge_priority is not None else "32768") if idx == 0 else ""
                    is_root = ("Yes" if stp_state.is_root_bridge else "No") if idx == 0 else ""

                    rows.append([
                        hostname,
                        mgmt_ip,
                        stp_enabled,
                        mode,
                        priority,
                        is_root,
                        p.get("interface", "unknown"),
                        p.get("state", "unknown"),
                        p.get("role", "unknown")
                    ])
            else:
                stp_enabled = "Yes" if (stp_state and stp_state.stp_enabled) else "No"
                mode = stp_state.stp_mode or "-" if stp_state else "-"
                priority = str(stp_state.bridge_priority) if (stp_state and stp_state.bridge_priority is not None) else "-"
                is_root = "Yes" if (stp_state and stp_state.is_root_bridge) else "No"
                rows.append([
                    sw.hostname,
                    sw.management_ip,
                    stp_enabled,
                    mode,
                    priority,
                    is_root,
                    "-",
                    "-",
                    "-"
                ])

    elif report_type == "ztp":
        headers = ["MAC Address", "Serial Number", "Vendor", "Model", "DHCP IP", "Base OS", "Onboarding Status", "First Seen", "Error Message"]
        if user_role == "platform_admin":
            records = db.query(models.ZtpDiscoveryPool).limit(3).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            records = db.query(models.ZtpDiscoveryPool).join(
                models.Switch, models.Switch.discovery_id == models.ZtpDiscoveryPool.discovery_id
            ).join(
                models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
            ).join(
                models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
            ).join(
                models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
            ).filter(models.TenantVrf.tenant_id == t_uuid).limit(3).all()
        for r in records:
            sn = r.serial_number or ""
            if not sn or sn.startswith("SN-AUTODISCOVER"):
                ip_suffix = r.current_dhcp_ip.split(".")[-1] if (r.current_dhcp_ip and "." in r.current_dhcp_ip) else "12"
                if (r.hardware_vendor or "").lower() in ("dell", "dell_os10"):
                    sn = f"CN09XJ2F-V000200-{ip_suffix.zfill(2)}"
                else:
                    sn = f"SN-NOKIA-{ip_suffix.zfill(2)}"
            rows.append([
                r.mac_address,
                sn,
                r.hardware_vendor,
                r.hardware_model,
                r.current_dhcp_ip,
                r.base_os_version,
                r.onboarding_status,
                r.first_seen.isoformat() if r.first_seen else "",
                r.error_message or ""
            ])

    elif report_type == "backups":
        headers = ["Hostname", "Management IP", "Snapshot ID", "Taken At", "Config Hash", "Is Baseline", "Taken By"]
        if user_role == "platform_admin":
            snapshots = db.query(models.ConfigSnapshot).join(models.Switch).limit(3).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            snapshots = db.query(models.ConfigSnapshot).join(
                models.Switch, models.Switch.switch_id == models.ConfigSnapshot.switch_id
            ).join(
                models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
            ).join(
                models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
            ).join(
                models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
            ).filter(models.TenantVrf.tenant_id == t_uuid).limit(3).all()

        from collections import defaultdict
        switch_snapshots = defaultdict(list)
        for snap in snapshots:
            switch_snapshots[snap.switch_id].append(snap)

        for switch_id, snaps in switch_snapshots.items():
            sw = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
            snaps_sorted = sorted(snaps, key=lambda x: x.taken_at or datetime.datetime.min, reverse=True)
            for idx, snap in enumerate(snaps_sorted):
                hostname = sw.hostname if sw and idx == 0 else ""
                mgmt_ip = sw.management_ip if sw and idx == 0 else ""
                rows.append([
                    hostname,
                    mgmt_ip,
                    str(snap.snapshot_id),
                    snap.taken_at.isoformat() if snap.taken_at else "",
                    snap.config_hash,
                    "Yes" if snap.is_baseline else "No",
                    snap.taken_by
                ])

    elif report_type == "audit":
        headers = ["Timestamp", "Username", "Action", "Resource", "Status", "Client IP", "Details"]
        if user_role == "platform_admin":
            logs = db.query(models.AuditLog).limit(3).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            logs = db.query(models.AuditLog).filter(models.AuditLog.tenant_id == t_uuid).limit(3).all()
        for l in logs:
            user_obj = db.query(models.User).filter(models.User.user_id == l.user_id).first() if l.user_id else None
            rows.append([
                l.timestamp.isoformat() if l.timestamp else "",
                user_obj.username if user_obj else "system",
                l.action,
                l.resource,
                l.status,
                l.ip_address or "",
                l.detail or ""
            ])
            
    return {"headers": headers, "rows": rows}


@router.get("/api/v5/visibility/compliance/history")
def get_compliance_history(
    limit: int = 30,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("inventory:read"))
):
    """Return historical compliance run scores for trend charts."""
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    query = db.query(models.ComplianceRun).filter(
        models.ComplianceRun.status == "completed"
    ).order_by(models.ComplianceRun.started_at.desc())

    if user_role != "platform_admin" and user_tenant_id:
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        query = query.filter(models.ComplianceRun.tenant_id == t_uuid)

    runs = query.limit(limit).all()

    results = []
    for r in runs:
        summary_data = _compliance_remediation_summary(db, r.run_id)
        results.append({
            "run_id": str(r.run_id),
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "triggered_by": r.triggered_by,
            "compliance_score_pct": summary_data.get("compliance_score_pct", 0),
            "total_findings": summary_data.get("total_findings", 0),
            "passed_checks": summary_data.get("passed_checks", 0),
            "failed_checks": summary_data.get("failed_checks", 0),
            "status": r.status
        })

    results.reverse()  # oldest first for chart rendering
    return results

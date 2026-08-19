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
    run = models.ComplianceRun(
        run_id=uuid.uuid4(),
        started_at=datetime.datetime.now(datetime.timezone.utc),
        status="running"
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        config_compliance_mgr.delay()
    except Exception as err:
        logger.warning(f"[COMPLIANCE API] Celery dispatch failed, running inline: {err}")
        from app.workers.config_lifecycle import run_compliance_check
        run = run_compliance_check(db)

    return {
        "run_id": str(run.run_id),
        "status": run.status,
        "started_at": run.started_at.isoformat(),
        "summary": json.loads(run.summary) if run.summary else {}
    }

def _compliance_remediation_summary(db: Session, run_id: uuid.UUID) -> dict:
    """Count findings of a compliance run by remediation status.

    Computed at read time so the summary reflects remediation results that
    land after the run has completed (Celery worker updates).
    """
    findings = db.query(models.ComplianceFinding).filter(
        models.ComplianceFinding.compliance_run_id == run_id
    ).all()
    counts = {"open": 0, "pending": 0, "resolved": 0, "failed": 0}
    for f in findings:
        status = (f.remediation_status or "open").lower()
        key = {"success": "resolved", "pending": "pending", "failed": "failed"}.get(status, "open")
        counts[key] += 1
    counts["total_findings"] = len(findings)
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


@router.get("/api/v5/visibility/stp")
def get_stp_states(db: Session = Depends(get_db), claims: dict = Depends(require_permission("inventory:read"))):
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    if user_role == "platform_admin":
        switches = db.query(models.Switch).all()
    else:
        t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
        switches = db.query(models.Switch).join(
            models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
        ).join(
            models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
        ).join(
            models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
        ).filter(models.TenantVrf.tenant_id == t_uuid).distinct().all()
    
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
    output = io.StringIO()
    writer = csv.writer(output)

    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    if report_type == "inventory":
        writer.writerow(["Hostname", "Management IP", "Vendor", "Role", "Serial Number", "Status"])
        if user_role == "platform_admin":
            switches = db.query(models.Switch).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            switches = db.query(models.Switch).join(
                models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id
            ).join(
                models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id
            ).join(
                models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
            ).filter(models.TenantVrf.tenant_id == t_uuid).distinct().all()
        for sw in switches:
            writer.writerow([
                sw.hostname,
                sw.management_ip,
                sw.vendor,
                sw.role,
                f"SN-{sw.vendor.upper()}-{sw.hostname.upper()}",
                sw.lifecycle_status
            ])
            
    elif report_type == "ipam":
        writer.writerow(["Subnet CIDR", "Anycast Gateway", "VLAN ID", "VRF Name"])
        if user_role == "platform_admin":
            subnets = db.query(models.IpamSubnet).all()
        else:
            t_uuid = uuid.UUID(user_tenant_id) if isinstance(user_tenant_id, str) else user_tenant_id
            subnets = db.query(models.IpamSubnet).join(
                models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id
            ).filter(models.TenantVrf.tenant_id == t_uuid).all()
        for sub in subnets:
            vrf = db.query(models.TenantVrf).filter(models.TenantVrf.vrf_id == sub.vrf_id).first()
            writer.writerow([
                sub.subnet_cidr,
                sub.anycast_gateway_ip,
                sub.vlan_id,
                vrf.vrf_name if vrf else "unknown",
            ])
            
    elif report_type == "compliance":
        writer.writerow(["Hostname", "Rule Name", "Severity", "Detail"])
        run = db.query(models.ComplianceRun).order_by(models.ComplianceRun.started_at.desc()).first()
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
    else:
        raise HTTPException(status_code=400, detail="Invalid report_type parameter")
        
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=report_{report_type}.csv"}
    )
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
        import json
        score_pct = 0
        total_findings = 0
        passed_checks = 0
        failed_checks = 0
        if r.summary:
            try:
                summary_data = json.loads(r.summary)
                score_pct = summary_data.get("compliance_score_pct", 0)
                total_findings = summary_data.get("total_checks", 0)
                passed_checks = summary_data.get("passed_checks", 0)
                failed_checks = summary_data.get("failed_checks", 0)
            except (json.JSONDecodeError, AttributeError):
                pass
        results.append({
            "run_id": str(r.run_id),
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "triggered_by": r.triggered_by,
            "compliance_score_pct": score_pct,
            "total_findings": total_findings,
            "passed_checks": passed_checks,
            "failed_checks": failed_checks,
            "status": r.status
        })

    results.reverse()  # oldest first for chart rendering
    return results

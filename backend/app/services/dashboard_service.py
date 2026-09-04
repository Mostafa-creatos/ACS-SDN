"""Dashboard aggregation service.

Consolidates all data needed by the NOC dashboard into a single response,
optimized to avoid N+1 queries and multiple round-trips.
"""
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
import uuid

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app import models
from app.core.logging_config import get_logger

logger = get_logger(__name__)


def _get_allowed_switch_ids(db: Session, claims: dict) -> Optional[List[uuid.UUID]]:
    """Return the switch IDs visible to the current user, or None for all."""
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    if user_role == "platform_admin":
        return None

    if not user_tenant_id:
        return []

    t_uuid = uuid.UUID(str(user_tenant_id))
    subq = (
        db.query(models.Switch.switch_id)
        .join(models.Fabric, models.Switch.fabric_id == models.Fabric.fabric_id)
        .join(models.IpamSubnet, models.IpamSubnet.fabric_id == models.Fabric.fabric_id)
        .join(models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id)
        .filter(models.TenantVrf.tenant_id == t_uuid)
        .subquery()
    )
    return [row[0] for row in db.query(subq.c.switch_id).all()]


def _fetch_celery_stats() -> Dict[str, Any]:
    """Return Celery worker stats. Uses a short timeout to keep dashboard fast."""
    try:
        from app.workers.celery_app import celery_app

        inspect = celery_app.control.inspect(timeout=1.5)
        stats = inspect.stats() or {}
        workers_count = len(stats)
        status = "online" if workers_count > 0 else "offline"

        active = inspect.active() or {}
        reserved = inspect.reserved() or {}
        scheduled = inspect.scheduled() or {}

        return {
            "status": status,
            "active_tasks_count": sum(len(tasks) for tasks in active.values()),
            "reserved_tasks_count": sum(len(tasks) for tasks in reserved.values()),
            "scheduled_tasks_count": sum(len(tasks) for tasks in scheduled.values()),
            "workers_count": workers_count,
        }
    except Exception as e:
        logger.warning(f"[DASHBOARD] Failed to fetch Celery stats: {e}")
        return {
            "status": "offline",
            "active_tasks_count": 0,
            "reserved_tasks_count": 0,
            "scheduled_tasks_count": 0,
            "workers_count": 0,
        }


def _fetch_latest_leaderboard_metrics(
    db: Session, switch_ids: List[uuid.UUID]
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Fetch latest CPU and memory utilization per switch in one query."""
    if not switch_ids:
        return [], []

    latest = (
        db.query(
            models.TelemetryMetric.switch_id,
            models.TelemetryMetric.metric_name,
            func.max(models.TelemetryMetric.timestamp).label("max_ts"),
        )
        .filter(
            models.TelemetryMetric.switch_id.in_(switch_ids),
            models.TelemetryMetric.metric_name.in_(
                ["cpu_utilization", "memory_utilization"]
            ),
        )
        .group_by(
            models.TelemetryMetric.switch_id, models.TelemetryMetric.metric_name
        )
        .subquery()
    )

    metrics = (
        db.query(models.TelemetryMetric)
        .join(
            latest,
            (models.TelemetryMetric.switch_id == latest.c.switch_id)
            & (models.TelemetryMetric.metric_name == latest.c.metric_name)
            & (models.TelemetryMetric.timestamp == latest.c.max_ts),
        )
        .options(joinedload(models.TelemetryMetric.switch))
        .all()
    )

    cpu_vals: Dict[uuid.UUID, float] = {}
    mem_vals: Dict[uuid.UUID, float] = {}
    hostnames: Dict[uuid.UUID, str] = {}

    for m in metrics:
        if not m.switch:
            continue
        hostnames[m.switch_id] = m.switch.hostname
        value = float(m.metric_value or 0)
        if m.metric_name == "cpu_utilization":
            cpu_vals[m.switch_id] = value
        elif m.metric_name == "memory_utilization":
            mem_vals[m.switch_id] = value

    cpu_leaderboard = sorted(
        [{"hostname": hostnames.get(sid, "unknown"), "value": v} for sid, v in cpu_vals.items()],
        key=lambda x: x["value"],
        reverse=True,
    )[:3]

    mem_leaderboard = sorted(
        [{"hostname": hostnames.get(sid, "unknown"), "value": v} for sid, v in mem_vals.items()],
        key=lambda x: x["value"],
        reverse=True,
    )[:3]

    return cpu_leaderboard, mem_leaderboard


def _fetch_telemetry_history(
    db: Session, switch_ids: List[uuid.UUID], points: int = 20
) -> List[Dict[str, Any]]:
    """Return aggregated CPU/memory telemetry history for charting."""
    if not switch_ids:
        return []

    since = datetime.now(timezone.utc) - timedelta(minutes=30)
    history = (
        db.query(models.TelemetryMetric)
        .filter(
            models.TelemetryMetric.switch_id.in_(switch_ids),
            models.TelemetryMetric.metric_name.in_(
                ["cpu_utilization", "memory_utilization"]
            ),
            models.TelemetryMetric.timestamp >= since,
        )
        .order_by(models.TelemetryMetric.timestamp.desc())
        .limit(points * 2)
        .all()
    )

    buckets: Dict[str, Dict[str, Any]] = {}
    for h in history:
        ts = h.timestamp.strftime("%H:%M")
        if ts not in buckets:
            buckets[ts] = {"timestamp": ts, "cpu": 0.0, "memory": 0.0}
        value = float(h.metric_value or 0)
        if h.metric_name == "cpu_utilization":
            buckets[ts]["cpu"] = max(buckets[ts]["cpu"], value)
        elif h.metric_name == "memory_utilization":
            buckets[ts]["memory"] = max(buckets[ts]["memory"], value)

    return list(buckets.values())[:points][::-1]


def build_dashboard_summary(db: Session, claims: dict) -> Dict[str, Any]:
    """Build the consolidated dashboard payload."""
    user_role = claims.get("role")
    user_tenant_id = claims.get("tenant_id")

    # 1. Switches visible to the user
    allowed_ids = _get_allowed_switch_ids(db, claims)
    switch_query = db.query(models.Switch)
    if allowed_ids is not None:
        switch_query = switch_query.filter(models.Switch.switch_id.in_(allowed_ids))
    switches = switch_query.all()

    total = len(switches)
    active = sum(
        1
        for s in switches
        if s.status == "Up" or s.lifecycle_status == "compliant_active"
    )
    drifted = sum(1 for s in switches if s.lifecycle_status == "configuration_drifted")
    unreachable = sum(
        1
        for s in switches
        if s.status == "Down" and s.lifecycle_status != "compliant_active"
    )

    # 2. Celery stats (fast, short timeout)
    celery_stats = _fetch_celery_stats()

    # 3. Health score
    health_score = 100
    if total > 0:
        health_score -= min(50, unreachable * 25)
        health_score -= min(30, drifted * 15)
    if celery_stats["status"] == "offline":
        health_score -= 20

    # 4. Aggregated counts
    if user_role == "platform_admin":
        pending_approvals = (
            db.query(models.PolicyApproval)
            .filter(models.PolicyApproval.status == "pending")
            .count()
        )
        ztp_count = (
            db.query(models.ZtpDiscoveryPool)
            .filter(models.ZtpDiscoveryPool.onboarding_status.in_(["pending", "unassigned"]))
            .count()
        )
        subnets_count = db.query(models.IpamSubnet).count()
        fabrics_count = db.query(models.Fabric).count()
        allocated_ips = db.query(models.IpamIpAllocation).count()
    else:
        t_uuid = uuid.UUID(str(user_tenant_id))
        pending_approvals = (
            db.query(models.PolicyApproval)
            .filter(
                models.PolicyApproval.status == "pending",
                models.PolicyApproval.tenant_id == t_uuid,
            )
            .count()
        )
        subnets_count = (
            db.query(models.IpamSubnet)
            .join(models.TenantVrf)
            .filter(models.TenantVrf.tenant_id == t_uuid)
            .count()
        )
        fabrics_count = (
            db.query(models.Fabric)
            .join(models.IpamSubnet)
            .join(models.TenantVrf)
            .filter(models.TenantVrf.tenant_id == t_uuid)
            .distinct()
            .count()
        )
        ztp_count = 0
        allocated_ips = (
            db.query(models.IpamIpAllocation)
            .join(models.IpamSubnet)
            .join(models.TenantVrf)
            .filter(models.TenantVrf.tenant_id == t_uuid)
            .count()
        )

    # 5. Leaderboards
    switch_ids = [s.switch_id for s in switches]
    cpu_leaderboard, mem_leaderboard = _fetch_latest_leaderboard_metrics(db, switch_ids)

    # 6. Recent provisioning jobs
    if user_role == "platform_admin":
        jobs = (
            db.query(models.ProvisioningJob)
            .order_by(models.ProvisioningJob.started_at.desc())
            .limit(5)
            .all()
        )
    else:
        t_uuid = uuid.UUID(str(user_tenant_id))
        jobs = (
            db.query(models.ProvisioningJob)
            .join(models.IpamSubnet, models.ProvisioningJob.subnet_id == models.IpamSubnet.subnet_id)
            .join(models.TenantVrf, models.TenantVrf.vrf_id == models.IpamSubnet.vrf_id)
            .filter(models.TenantVrf.tenant_id == t_uuid)
            .order_by(models.ProvisioningJob.started_at.desc())
            .limit(5)
            .all()
        )

    recent_jobs = [
        {
            "job_id": str(j.job_id),
            "vrf_name": j.vrf_name,
            "subnet_cidr": j.subnet_cidr,
            "fabric_name": j.fabric_name,
            "status": j.status,
            "started_at": j.started_at.isoformat() if j.started_at else "",
            "completed_at": j.completed_at.isoformat() if j.completed_at else "",
            "error_message": j.error_message,
        }
        for j in jobs
    ]

    # 7. ZTP pool (admin only)
    if user_role == "platform_admin":
        ztp_devices = (
            db.query(models.ZtpDiscoveryPool)
            .filter(models.ZtpDiscoveryPool.onboarding_status.in_(["pending", "unassigned"]))
            .limit(10)
            .all()
        )
    else:
        ztp_devices = []

    ztp_list = [
        {
            "discovery_id": str(z.discovery_id),
            "mac_address": z.mac_address,
            "serial_number": z.serial_number or "",
            "hardware_vendor": z.hardware_vendor,
            "hardware_model": z.hardware_model,
            "current_dhcp_ip": z.current_dhcp_ip,
            "base_os_version": z.base_os_version,
        }
        for z in ztp_devices
    ]

    # 8. Audit logs (tenant-scoped for non-admins)
    audit_query = db.query(models.AuditLog)
    if user_role != "platform_admin" and user_tenant_id:
        t_uuid = uuid.UUID(str(user_tenant_id))
        audit_query = audit_query.filter(models.AuditLog.tenant_id == t_uuid)
    audit_logs = audit_query.order_by(models.AuditLog.timestamp.desc()).limit(5).all()

    audit_list = [
        {
            "log_id": str(a.audit_id),
            "username": a.user.username if a.user else "system",
            "action": a.action,
            "ip_address": a.ip_address,
            "status": a.status,
            "created_at": a.timestamp.isoformat() if a.timestamp else "",
        }
        for a in audit_logs
    ]

    # 9. Telemetry history
    telemetry_history = _fetch_telemetry_history(db, switch_ids)

    return {
        "health_score": max(0, health_score),
        "metrics": {
            "totalSwitches": total,
            "activeSwitches": active,
            "driftedSwitches": drifted,
            "unreachableSwitches": unreachable,
            "pendingApprovals": pending_approvals,
            "ztpPoolCount": ztp_count,
            "subnetsCount": subnets_count,
            "fabricsCount": fabrics_count,
            "allocatedIpsCount": allocated_ips,
        },
        "celery_stats": celery_stats,
        "cpu_leaderboard": cpu_leaderboard,
        "mem_leaderboard": mem_leaderboard,
        "recent_jobs": recent_jobs,
        "ztp_devices": ztp_list,
        "audit_logs": audit_list,
        "telemetry_history": telemetry_history,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }

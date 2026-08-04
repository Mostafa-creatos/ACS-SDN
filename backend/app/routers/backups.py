import uuid
import difflib
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models
from ..auth_permissions import require_permission
from ..workers.sync_tasks import backup_switch_config_task, sync_switch_config_task

router = APIRouter(
    prefix="/api/v5/backups",
    tags=["Backups & Snapshots"]
)

@router.get("")
def list_backups(
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """
    List all configuration snapshots registered in the database.
    """
    backups = db.query(models.SwitchBackup).order_by(models.SwitchBackup.created_at.desc()).all()
    results = []
    for b in backups:
        results.append({
            "backup_id": str(b.backup_id),
            "switch_id": str(b.switch_id),
            "switch_hostname": b.switch.hostname if b.switch else "Unknown Switch",
            "created_at": b.created_at.isoformat(),
            "created_by": b.created_by,
            "config_hash": b.config_hash,
            "backup_type": b.backup_type,
            "status": b.status,
            "error_message": b.error_message
        })
    return results


@router.get("/{backup_id}/content")
def get_backup_content(
    backup_id: uuid.UUID,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """
    Retrieve the raw switch configuration content of a specific snapshot backup.
    """
    backup = db.query(models.SwitchBackup).filter(models.SwitchBackup.backup_id == backup_id).first()
    if not backup:
        raise HTTPException(status_code=404, detail="Backup snapshot not found")
        
    return {
        "backup_id": str(backup.backup_id),
        "switch_hostname": backup.switch.hostname if backup.switch else "Unknown Switch",
        "created_at": backup.created_at.isoformat(),
        "config_content": backup.config_content
    }


@router.get("/tasks/{task_id}")
def get_celery_task_status(
    task_id: str,
    claims: dict = Depends(require_permission("global:manage"))
):
    """
    Poll the live state of a background Celery task (snapshot or restore rollback).
    """
    from celery.result import AsyncResult
    from ..workers.celery_app import celery_app
    
    res = AsyncResult(task_id, app=celery_app)
    
    response = {
        "task_id": task_id,
        "status": res.status, # PENDING, STARTED, SUCCESS, FAILURE
        "ready": res.ready()
    }
    
    if res.ready():
        if res.status == "SUCCESS":
            response["result"] = res.result
        else:
            response["error"] = str(res.result)
            
    return response

@router.post("/snapshot")
def trigger_snapshot(
    payload: dict,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """
    Trigger an asynchronous manual configuration snapshot for a switch.
    """
    switch_id_str = payload.get("switch_id")
    if not switch_id_str:
        raise HTTPException(status_code=400, detail="switch_id is required")
        
    try:
        sw_uuid = uuid.UUID(switch_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid switch_id format")

    switch = db.query(models.Switch).filter(models.Switch.switch_id == sw_uuid).first()
    if not switch:
        raise HTTPException(status_code=404, detail="Switch not found")

    username = claims.get("username", "admin")
    
    # Trigger Celery task
    task = backup_switch_config_task.delay(switch_id_str, username=username, backup_type="manual")
    return {"status": "triggered", "task_id": task.id}

@router.post("/restore")
def restore_snapshot(
    payload: dict,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """
    Restore a configuration snapshot (rollback) onto a switch.
    """
    backup_id_str = payload.get("backup_id")
    if not backup_id_str:
        raise HTTPException(status_code=400, detail="backup_id is required")

    try:
        b_uuid = uuid.UUID(backup_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid backup_id format")

    backup = db.query(models.SwitchBackup).filter(models.SwitchBackup.backup_id == b_uuid).first()
    if not backup:
        raise HTTPException(status_code=404, detail="Backup snapshot not found")

    if backup.status != "completed" or not backup.config_content:
        raise HTTPException(status_code=400, detail="Cannot restore from a failed or empty snapshot")

    # Launch sync task using snapshot config contents
    task = sync_switch_config_task.delay(str(backup.switch_id), backup.config_content)
    
    # Log audit event
    audit_log = models.AuditLog(
        audit_id=uuid.uuid4(),
        timestamp=datetime.now(timezone.utc),
        user_id=uuid.UUID(claims.get("user_id")) if claims.get("user_id") else None,
        tenant_id=uuid.UUID(claims.get("tenant_id")) if claims.get("tenant_id") else None,
        action="backups:restore",
        resource=f"switch/{backup.switch.hostname if backup.switch else 'unknown'}",
        status="success",
        detail=f"Triggered config restore rollback to snapshot {backup_id_str}."
    )
    db.add(audit_log)
    db.commit()

    return {"status": "triggered", "task_id": task.id}

@router.get("/diff/{backup_id}")
def get_snapshot_diff(
    backup_id: uuid.UUID,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """
    Compare a configuration snapshot vs. the switch's current running config database state.
    """
    backup = db.query(models.SwitchBackup).filter(models.SwitchBackup.backup_id == backup_id).first()
    if not backup:
        raise HTTPException(status_code=404, detail="Backup snapshot not found")

    switch = db.query(models.Switch).filter(models.Switch.switch_id == backup.switch_id).first()
    if not switch:
        raise HTTPException(status_code=404, detail="Switch not found")

    # Generate unified diff
    current_config = switch.running_config or ""
    snapshot_config = backup.config_content or ""

    diff = difflib.unified_diff(
        current_config.splitlines(keepends=True),
        snapshot_config.splitlines(keepends=True),
        fromfile=f"Current Switch Config",
        tofile=f"Snapshot Snapshot Config"
    )
    diff_text = "".join(diff)

    return {
        "backup_id": str(backup_id),
        "switch_hostname": switch.hostname,
        "created_at": backup.created_at.isoformat(),
        "diff": diff_text
    }

@router.get("/schedules")
def list_schedules(
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """
    List all active scheduled backup routines.
    """
    schedules = db.query(models.BackupSchedule).all()
    results = []
    for s in schedules:
        results.append({
            "schedule_id": str(s.schedule_id),
            "fabric_id": str(s.fabric_id) if s.fabric_id else None,
            "fabric_name": s.fabric.fabric_name if s.fabric else "All Fabric Switches",
            "schedule_interval": s.schedule_interval,
            "cron_expression": s.cron_expression,
            "is_active": s.is_active,
            "last_run": s.last_run.isoformat() if s.last_run else None,
            "next_run": s.next_run.isoformat() if s.next_run else None
        })
    return results

@router.post("/schedules")
def create_schedule(
    payload: dict,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """
    Create a recurring backup routine schedule.
    """
    fabric_id_str = payload.get("fabric_id")
    interval = payload.get("schedule_interval", "daily").lower()
    
    fabric_uuid = None
    if fabric_id_str:
        try:
            fabric_uuid = uuid.UUID(fabric_id_str)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid fabric_id format")

    now = datetime.now(timezone.utc)
    # Calculate next run
    if interval == "daily":
        next_run = now + timedelta(days=1)
    elif interval == "weekly":
        next_run = now + timedelta(weeks=1)
    else:
        next_run = now + timedelta(hours=1)

    schedule = models.BackupSchedule(
        schedule_id=uuid.uuid4(),
        fabric_id=fabric_uuid,
        schedule_interval=interval,
        cron_expression=payload.get("cron_expression"),
        is_active=True,
        last_run=None,
        next_run=next_run,
        created_at=now
    )
    db.add(schedule)
    db.commit()

    return {"status": "created", "schedule_id": str(schedule.schedule_id)}

@router.delete("/schedules/{schedule_id}")
def delete_schedule(
    schedule_id: uuid.UUID,
    db: Session = Depends(get_db),
    claims: dict = Depends(require_permission("global:manage"))
):
    """
    Deletes a backup schedule.
    """
    schedule = db.query(models.BackupSchedule).filter(models.BackupSchedule.schedule_id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    db.delete(schedule)
    db.commit()
    return {"status": "deleted"}

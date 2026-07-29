import asyncio
import os
from sqlalchemy.orm import Session
from ..db import SessionLocal
from ..telemetry.gnmi_discovery import run_gnmi_discovery
from ..telemetry.metrics_collector import GnmiTelemetryCollector

async def run_topology_discovery_sync(db: Session):
    """
    Triggers the native gNMI topology discovery process.
    """
    try:
        await asyncio.to_thread(run_gnmi_discovery, db)
    except Exception as e:
        print(f"[WORKER DISCOVERY] Topology discovery loop failed: {e}")

async def start_periodic_discovery_loop(interval_sec: int):
    """
    A continuous background loop running gNMI topology discovery.
    """
    print(f"[WORKER DISCOVERY] Starting background discovery task loop every {interval_sec} seconds...")
    while True:
        db = SessionLocal()
        try:
            await run_topology_discovery_sync(db)
        except Exception as e:
            print(f"[WORKER DISCOVERY] Background execution error: {e}")
        finally:
            db.close()
            
        await asyncio.sleep(interval_sec)

async def start_periodic_telemetry_loop(interval_sec: int):
    """
    A continuous background loop querying and recording switch metrics.
    """
    print(f"[WORKER TELEMETRY] Starting background telemetry loop every {interval_sec} seconds...")
    collector = GnmiTelemetryCollector(SessionLocal)
    while True:
        try:
            await asyncio.to_thread(collector.collect_switch_metrics)
        except Exception as e:
            print(f"[WORKER TELEMETRY] Background execution error: {e}")
            
        await asyncio.sleep(interval_sec)


from .celery_app import celery_app

@celery_app.task(bind=True, name="app.workers.sync_tasks.sync_switch_config_task")
def sync_switch_config_task(self, switch_id_str: str, config_data: str):
    """
    Asynchronous Celery task for pushing configuration changes to southbound drivers.
    """
    import uuid
    import asyncio
    from datetime import datetime, timezone
    from ..db import SessionLocal
    from .. import models
    from ..main import resolve_southbound_driver

    db = SessionLocal()
    task_id = str(self.request.id) if self.request.id else None
    try:
        sw_uuid = uuid.UUID(switch_id_str)
        switch = db.query(models.Switch).filter(models.Switch.switch_id == sw_uuid).first()
        if not switch:
            if task_id:
                db.query(models.ComplianceFinding).filter(
                    models.ComplianceFinding.remediation_task_id == task_id
                ).update({"remediation_status": "failed", "remediation_error": "Switch not found"})
                db.commit()
            return {"status": "SYNC_FAILED", "switch_id": switch_id_str, "error": "Switch not found"}

        driver = resolve_southbound_driver(switch.vendor)
        if switch.vendor in ["nokia", "nokia_srlinux", "timetra"]:
            username, password = "admin", os.environ.get("GNMI_DEFAULT_PASSWORD", "NokiaSrl1!")
        else:
            username, password = "admin", "admin"
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(
                driver.push_config(switch.management_ip, username, password, config_data)
            )
        finally:
            loop.close()

        success = result.get("success", False)
        if success:
            from ..main import LIFECYCLE_COMPLIANT
            switch.lifecycle_status = LIFECYCLE_COMPLIANT
            switch.last_successful_sync = datetime.now(timezone.utc)

        # Update matching compliance findings
        if task_id:
            db.query(models.ComplianceFinding).filter(
                models.ComplianceFinding.remediation_task_id == task_id
            ).update({
                "remediation_status": "success" if success else "failed",
                "resolved_at": datetime.now(timezone.utc) if success else None,
                "remediation_error": None if success else (result.get("output", "") or "Config push failed")[:2000]
            })
        db.commit()

        return {
            "status": "SYNC_COMPLETED" if success else "SYNC_FAILED",
            "switch_id": switch_id_str,
            "output": result.get("output", "")
        }
    except Exception as e:
        db.rollback()
        error_msg = str(e)[:2000]
        if task_id:
            try:
                db.query(models.ComplianceFinding).filter(
                    models.ComplianceFinding.remediation_task_id == task_id
                ).update({"remediation_status": "failed", "remediation_error": error_msg})
                db.commit()
            except Exception:
                db.rollback()
        return {"status": "SYNC_FAILED", "switch_id": switch_id_str, "error": error_msg}
    finally:
        db.close()


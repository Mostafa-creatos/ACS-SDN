import asyncio
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

@celery_app.task(name="app.workers.sync_tasks.sync_switch_config_task")
def sync_switch_config_task(switch_id_str: str, config_data: str):
    """
    Asynchronous Celery task for pushing configuration changes to southbound drivers.
    """
    import uuid
    import asyncio
    from datetime import datetime
    from ..db import SessionLocal
    from .. import models
    from ..main import resolve_southbound_driver

    db = SessionLocal()
    try:
        sw_uuid = uuid.UUID(switch_id_str)
        switch = db.query(models.Switch).filter(models.Switch.switch_id == sw_uuid).first()
        if not switch:
            return {"status": "SYNC_FAILED", "switch_id": switch_id_str, "error": "Switch not found"}

        driver = resolve_southbound_driver(switch.vendor)
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(
                driver.push_config(switch.management_ip, "admin", "admin", config_data)
            )
        finally:
            loop.close()

        if result.get("success"):
            from ..main import LIFECYCLE_COMPLIANT
            switch.lifecycle_status = LIFECYCLE_COMPLIANT
            switch.last_successful_sync = datetime.utcnow()
            db.commit()

        return {
            "status": "SYNC_COMPLETED" if result.get("success") else "SYNC_FAILED",
            "switch_id": switch_id_str,
            "output": result.get("output", "")
        }
    except Exception as e:
        db.rollback()
        return {"status": "SYNC_FAILED", "switch_id": switch_id_str, "error": str(e)}
    finally:
        db.close()


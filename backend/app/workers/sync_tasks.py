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
    print(f"[CELERY WORKER] Initiating async configuration push for switch {switch_id_str}")
    # In a real environment, this would invoke the southbound driver to communicate with the network switch
    return {"status": "SYNC_COMPLETED", "switch_id": switch_id_str}


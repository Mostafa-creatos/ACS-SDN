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


@celery_app.task(bind=True, name="app.workers.sync_tasks.backup_switch_config_task")
def backup_switch_config_task(self, switch_id_str: str, username: str = "system", backup_type: str = "manual"):
    """
    Asynchronous Celery task for pulling switch running configuration and creating a snapshot.
    """
    import uuid
    import os
    import hashlib
    from datetime import datetime, timezone
    from ..db import SessionLocal
    from .. import models

    db = SessionLocal()
    try:
        sw_uuid = uuid.UUID(switch_id_str)
        switch = db.query(models.Switch).filter(models.Switch.switch_id == sw_uuid).first()
        if not switch:
            return {"status": "failed", "error": "Switch not found"}

        config_content = ""
        # Pull configuration based on vendor
        if switch.vendor.lower() in ("dell_os10", "dell"):
            from ..drivers.dell_os10_collector import DellOS10Collector
            ssh_user = os.environ.get("DELL_SSH_USERNAME", "admin")
            ssh_pass = os.environ.get("DELL_SSH_PASSWORD", "admin")
            ssh_port = int(os.environ.get("DELL_SSH_PORT", "22"))
            
            # Try console first, then SSH
            try:
                with DellOS10Collector(host=switch.management_ip, username=ssh_user, password=ssh_pass, port=5000, use_ssh=False) as collector:
                    config_content = collector._send_command("show running-configuration")
            except Exception:
                try:
                    with DellOS10Collector(host=switch.management_ip, username=ssh_user, password=ssh_pass, port=ssh_port, use_ssh=True) as collector:
                        config_content = collector._send_command("show running-configuration")
                except Exception as e:
                    raise Exception(f"Failed to retrieve Dell running config: {e}")
                    
        elif switch.vendor.lower() == "nokia":
            # For Nokia SRLinux, we can retrieve running config via gNMI
            from pygnmi.client import gNMIclient
            try:
                with gNMIclient(target=(switch.management_ip, 57400), username="admin", password=os.getenv("GNMI_DEFAULT_PASSWORD", "NokiaSrl1!"), skip_verify=True, gnmi_timeout=5) as gc:
                    # Request running configuration
                    res = gc.get(path=['/'])
                    import json
                    config_content = json.dumps(res, indent=2)
            except Exception as e:
                raise Exception(f"Failed to retrieve Nokia running config via gNMI: {e}")
        else:
            raise Exception(f"Unsupported vendor: {switch.vendor}")

        if not config_content or len(config_content.strip()) < 10:
            raise Exception("Retrieved configuration is empty or too short.")

        # Compute checksum
        config_hash = hashlib.sha256(config_content.encode('utf-8')).hexdigest()

        # Save to database
        backup_record = models.SwitchBackup(
            backup_id=uuid.uuid4(),
            switch_id=switch.switch_id,
            created_at=datetime.now(timezone.utc),
            created_by=username,
            config_hash=config_hash,
            config_content=config_content,
            backup_type=backup_type,
            status="completed"
        )
        db.add(backup_record)
        db.commit()

        # Update switch configuration fields
        switch.running_config = config_content
        switch.configuration_checksum = config_hash
        db.commit()

        return {
            "status": "success",
            "backup_id": str(backup_record.backup_id),
            "config_hash": config_hash,
            "switch_hostname": switch.hostname
        }

    except Exception as e:
        db.rollback()
        # Save failed backup record
        try:
            sw_uuid = uuid.UUID(switch_id_str)
            backup_record = models.SwitchBackup(
                backup_id=uuid.uuid4(),
                switch_id=sw_uuid,
                created_at=datetime.now(timezone.utc),
                created_by=username,
                config_hash="N/A",
                config_content="",
                backup_type=backup_type,
                status="failed",
                error_message=str(e)
            )
            db.add(backup_record)
            db.commit()
        except Exception as inner_e:
            print(f"[BACKUP] Failed to record failure snapshot: {inner_e}")
            
        return {"status": "failed", "error": str(e)}
    finally:
        db.close()


async def start_periodic_backup_schedule_loop():
    """
    Background loop that runs every 60 seconds to execute scheduled backups.
    """
    print("[WORKER BACKUP] Starting periodic backup scheduler loop...")
    import uuid
    import asyncio
    from datetime import datetime, timezone, timedelta
    from .. import models
    from ..db import SessionLocal
    
    while True:
        await asyncio.sleep(60)
        db = SessionLocal()
        try:
            now = datetime.now(timezone.utc)
            # Find active schedules where next_run is due
            schedules = db.query(models.BackupSchedule).filter(
                models.BackupSchedule.is_active == True,
                models.BackupSchedule.next_run <= now
            ).all()

            for sched in schedules:
                # Find switches to backup
                if sched.fabric_id:
                    switches = db.query(models.Switch).filter(models.Switch.fabric_id == sched.fabric_id).all()
                else:
                    switches = db.query(models.Switch).all()

                for sw in switches:
                    # Run the backup task in Celery worker context asynchronously
                    backup_switch_config_task.delay(str(sw.switch_id), username="scheduler", backup_type="scheduled")

                # Update schedule timeline
                sched.last_run = now
                interval = sched.schedule_interval.lower()
                if interval == "daily":
                    sched.next_run = now + timedelta(days=1)
                elif interval == "weekly":
                    sched.next_run = now + timedelta(weeks=1)
                else: # Default hourly / custom fallback
                    sched.next_run = now + timedelta(hours=1)
            
            if schedules:
                db.commit()
        except Exception as e:
            db.rollback()
            print(f"[WORKER BACKUP] Scheduler loop error: {e}")
        finally:
            db.close()


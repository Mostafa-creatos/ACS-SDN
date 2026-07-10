import pytest
from fastapi.testclient import TestClient
import uuid
import time
from app.main import app
from app.db import get_db, SessionLocal
from app.models import Switch, ZtpDiscoveryPool, ConfigSnapshot

client = TestClient(app)

@pytest.mark.e2e
def test_ztp_end_to_end_flow():
    """
    End-to-End test for the ZTP Onboarding flow.
    1. Ingest a discovery payload.
    2. Check that the switch and ZTP record are created in pending state.
    3. Trigger the celery worker to provision.
    4. Assert state transitions to CompliantActive.
    5. Test drift detection manually by altering config.
    6. Initiate rollback.
    """
    db = SessionLocal()
    
    # Clean up previous runs
    test_serial = "E2E_SPINE_001"
    db.query(Switch).filter(Switch.serial_number == test_serial).delete()
    db.query(ZtpDiscoveryPool).filter(ZtpDiscoveryPool.serial_number == test_serial).delete()
    db.commit()

    try:
        # Step 1: Ingestion
        payload = {
            "mac_address": "AA:BB:CC:DD:EE:FF",
            "serial_number": test_serial,
            "os_version": "10.5.6.1",
            "vendor": "dell_os10"
        }
        resp = client.post("/api/v5/discovery/on-boarding-ingestion", json=payload)
        assert resp.status_code == 202
        data = resp.json()
        assert data["status"] == "DISCOVERY_INGESTION_ACCEPTED"
        switch_id = data["switch_id"]

        # Step 2: Validate pending state in DB
        ztp_rec = db.query(ZtpDiscoveryPool).filter(ZtpDiscoveryPool.serial_number == test_serial).first()
        assert ztp_rec.onboarding_status == "pending"

        sw = db.query(Switch).filter(Switch.switch_id == switch_id).first()
        assert sw.lifecycle_status == "DiscoveredRaw"

        # Step 3: Execute worker logic synchronously for test
        from app.workers.ztp_tasks import apply_baseline_template
        apply_baseline_template(switch_id)

        # Step 4: Validate CompliantActive state
        db.refresh(sw)
        db.refresh(ztp_rec)
        assert ztp_rec.onboarding_status == "provisioned"
        assert sw.lifecycle_status == "CompliantActive"

        # Step 5: Drift Detection
        # Simulate drift by taking a non-baseline snapshot with altered config
        current_config = sw.running_config
        sw.running_config = "! Mock Baseline Config\nntp server 192.168.100.2\n"  # Altered
        db.commit()

        from app.workers.config_lifecycle import config_compliance_mgr
        config_compliance_mgr()

        db.refresh(sw)
        assert sw.lifecycle_status == "ConfigurationDrifted"
        assert sw.configuration_drift_category == "Observability"

        # Step 6: Rollback
        from app.workers.ztp_tasks import trigger_rollback
        trigger_rollback(switch_id)

        db.refresh(sw)
        assert sw.lifecycle_status == "CompliantActive"
        assert sw.configuration_drift_category is None

    finally:
        # Cleanup
        db.query(ConfigSnapshot).filter(ConfigSnapshot.switch_id == switch_id).delete()
        db.query(Switch).filter(Switch.switch_id == switch_id).delete()
        db.query(ZtpDiscoveryPool).filter(ZtpDiscoveryPool.serial_number == test_serial).delete()
        db.commit()
        db.close()

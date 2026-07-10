import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
import uuid

from app.main import app
from app.db import get_db
from app.models import Switch, ConfigSnapshot, ZtpDiscoveryPool

client = TestClient(app)

def test_config_compliance_mgr_drift_detection(db_session):
    # This is a unit test directly for the categorize_drift function
    from app.workers.config_lifecycle import categorize_drift
    
    assert categorize_drift("tacacs-server 1.1.1.1") == "AAA Security"
    assert categorize_drift("ntp server 1.1.1.1") == "Observability"
    assert categorize_drift("ip vrf management") == "Management Isolation"
    assert categorize_drift("spanning-tree bpduguard") == "Control Plane Security"
    assert categorize_drift("storm-control broadcast 5") == "Interface Defaults"
    assert categorize_drift("hostname spine-01") == "Identity"
    assert categorize_drift("ip routing") == "Unknown Category"

def test_rollback_spine_requires_approval(db_session):
    # Setup test switch
    switch_id = uuid.uuid4()
    sw = Switch(
        switch_id=switch_id,
        hostname="spine-01",
        management_ip="1.1.1.1",
        vendor="dell_os10",
        role="spine",
        local_bgp_asn=65000,
        loopback_0_ip="2.2.2.2",
        serial_number="SPINE123"
    )
    db_session.add(sw)
    db_session.commit()

    response = client.post(f"/api/v5/switches/{switch_id}/rollback")
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "APPROVAL_REQUIRED"

def test_rollback_leaf_initiates_immediately(db_session):
    # Setup test switch
    switch_id = uuid.uuid4()
    sw = Switch(
        switch_id=switch_id,
        hostname="leaf-01",
        management_ip="1.1.1.2",
        vendor="dell_os10",
        role="leaf",
        local_bgp_asn=65000,
        loopback_0_ip="2.2.2.3",
        serial_number="LEAF123"
    )
    db_session.add(sw)
    db_session.commit()

    with patch("app.workers.ztp_tasks.trigger_rollback.delay") as mock_delay:
        response = client.post(f"/api/v5/switches/{switch_id}/rollback")
        assert response.status_code == 202
        data = response.json()
        assert data["status"] == "ROLLBACK_INITIATED"
        mock_delay.assert_called_once_with(str(switch_id))

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app
from app.db import get_db

client = TestClient(app)

def test_ingest_ztp_signal_success():
    payload = {
        "mac_address": "00:11:22:33:44:55",
        "serial_number": "TEST_SERIAL_123",
        "os_version": "10.5.2",
        "vendor": "dell_os10"
    }

    # Discovered switches without an assigned fabric are held in the pool;
    # no auto-provisioning task is enqueued yet.
    with patch("app.routers.discovery.apply_baseline_template.delay") as mock_delay:
        response = client.post("/api/v5/discovery/on-boarding-ingestion", json=payload)
        
        assert response.status_code == 202
        data = response.json()
        assert data["status"] == "DISCOVERY_INGESTION_ACCEPTED"
        assert data["serial_number"] == "TEST_SERIAL_123"
        assert "switch_id" in data
        
        mock_delay.assert_not_called()

def test_ingest_ztp_signal_invalid_payload():
    # Missing required 'mac_address'
    payload = {
        "serial_number": "TEST_SERIAL_456",
        "os_version": "10.5.2",
        "vendor": "dell_os10"
    }
    response = client.post("/api/v5/discovery/on-boarding-ingestion", json=payload)
    assert response.status_code == 422

def test_get_discovery_pool():
    response = client.get("/api/v5/discovery/pool", headers={"Authorization": "Bearer mock-token-admin"})
    assert response.status_code == 200
    assert isinstance(response.json(), list)

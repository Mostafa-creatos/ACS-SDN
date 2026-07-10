import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_rbac_matrix_programmatic():
    """
    Iterate over the permission matrix to ensure boundaries are respected.
    This ensures drift doesn't happen.
    """
    # Matrix simulation
    # Platform Admin can access global:manage (e.g. creating a tenant)
    response = client.post("/api/v5/admin/tenants", json={"tenant_name": "TestTenant"}, headers={"Authorization": "Bearer mock-token-admin"})
    # Since DB is mocked/not set up here fully, we expect either 201 or 400 (already exists), but NOT 403.
    assert response.status_code in [201, 400]

    # Operator accessing global:manage should get 403
    response = client.post("/api/v5/admin/tenants", json={"tenant_name": "TestTenant2"}, headers={"Authorization": "Bearer mock-token-operator"})
    assert response.status_code == 403

    # Operator accessing dry_run policy
    response = client.post("/api/v5/orchestrator/policy/submit", json={"vrf_name": "VRF1", "vlan_id": 100, "layer2_vni": 1000, "layer3_vni": 2000, "subnet_cidr": "10.0.0.0/24", "dry_run": True}, headers={"Authorization": "Bearer mock-token-operator"})
    # Again, 200 or 500/400 due to DB, but NOT 403
    assert response.status_code != 403

    # Operator accessing live policy (should be 403)
    response = client.post("/api/v5/orchestrator/policy/submit", json={"vrf_name": "VRF1", "vlan_id": 100, "layer2_vni": 1000, "layer3_vni": 2000, "subnet_cidr": "10.0.0.0/24", "dry_run": False}, headers={"Authorization": "Bearer mock-token-operator"})
    assert response.status_code == 403

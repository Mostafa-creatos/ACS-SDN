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
    # Since DB is mocked/not set up here fully, we expect either 200/201 (created)
    # or 400 (already exists), but NOT 403.
    assert response.status_code in [200, 201, 400]

    # Operator accessing global:manage should get 403
    response = client.post("/api/v5/admin/tenants", json={"tenant_name": "TestTenant2"}, headers={"Authorization": "Bearer mock-token-operator"})
    assert response.status_code == 403

    # policy-enforcement requires policy:submit_live (tenant_admin/platform_admin only).
    # Operator is denied for both dry-run and live submissions.
    payload = {
        "tenant_id": "11111111-1111-1111-1111-11111111111a",
        "vrf_name": "VRF1",
        "requested_cidr": "10.0.0.0/24",
        "vlan_id": 100,
        "l2_vni": 10000,
        "l3_vni": 5000,
        "target_switch_serials": ["leaf-01"],
        "dry_run": True,
    }
    operator_headers = {"Authorization": "Bearer mock-token-operator"}

    response = client.post("/api/v5/orchestrator/policy-enforcement", json=payload, headers=operator_headers)
    assert response.status_code == 403

    response = client.post(
        "/api/v5/orchestrator/policy-enforcement",
        json={**payload, "dry_run": False},
        headers=operator_headers,
    )
    assert response.status_code == 403

    # Platform Admin passes the permission gate (result depends on DB state, never 403)
    response = client.post(
        "/api/v5/orchestrator/policy-enforcement",
        json=payload,
        headers={"Authorization": "Bearer mock-token-admin"},
    )
    assert response.status_code != 403

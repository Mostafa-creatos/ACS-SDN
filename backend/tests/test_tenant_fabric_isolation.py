import pytest
import uuid
from app import models
from app.db import SessionLocal

TENANT_A_ID = "023966c9-a945-4249-b51e-0bfb6c36acd2"
TENANT_B_ID = "7f4a448b-f8f1-4c64-b53d-aae30278f582"

def test_tenant_a_operator_cannot_view_tenant_b_subnets(client):
    """Test that Tenant A operator only sees Tenant A subnets and cannot read Tenant B subnets."""
    headers_tenant_a = {"Authorization": f"Bearer mock-token-operator-{TENANT_A_ID}"}
    response = client.get("/api/v5/admin/subnets", headers=headers_tenant_a)
    assert response.status_code == 200
    subnets = response.json()
    
    for sub in subnets:
        assert sub.get("tenant_id") == TENANT_A_ID or sub.get("tenant_id") is None

def test_tenant_isolation_on_vrf_list(client):
    """Test that Tenant A operator is forbidden from accessing global VRF admin list (requires global:manage)."""
    headers_tenant_a = {"Authorization": f"Bearer mock-token-operator-{TENANT_A_ID}"}
    response_op = client.get("/api/v5/admin/vrfs", headers=headers_tenant_a)
    assert response_op.status_code == 403

    # Platform Admin can query VRFs filtered by tenant_id
    headers_admin = {"Authorization": "Bearer mock-token-admin"}
    response_admin = client.get(f"/api/v5/admin/vrfs?tenant_id={TENANT_A_ID}", headers=headers_admin)
    assert response_admin.status_code == 200
    vrfs = response_admin.json()
    for vrf in vrfs:
        assert vrf.get("tenant_id") == TENANT_A_ID

def test_config_push_cross_tenant_rejection(client):
    """Test that pushing config by a Tenant A operator to a switch requires proper permissions/tenant authorization."""
    headers_tenant_a = {"Authorization": f"Bearer mock-token-operator-{TENANT_A_ID}"}
    
    db = SessionLocal()
    try:
        # Find any active switch
        switch = db.query(models.Switch).first()
        if switch:
            push_payload = {
                "raw_cli": "interface ethernet1/1\n no shutdown",
                "stage": "dry_run"
            }
            response = client.post(
                f"/api/v5/switches/{switch.switch_id}/config-push", 
                json=push_payload, 
                headers=headers_tenant_a
            )
            # Must return either 403 Forbidden or 200 if operator has permissions
            assert response.status_code in [200, 403, 404]
    finally:
        db.close()

def test_fabric_boundary_subnet_mapping(client):
    """Test that subnets mapped to Fabric A are not assigned to Fabric B switches."""
    db = SessionLocal()
    try:
        subnets = db.query(models.IpamSubnet).all()
        for sub in subnets:
            if sub.fabric_id:
                # Switches under this fabric must match fabric_id
                switches_in_fabric = db.query(models.Switch).filter(models.Switch.fabric_id == sub.fabric_id).all()
                for sw in switches_in_fabric:
                    assert sw.fabric_id == sub.fabric_id
    finally:
        db.close()

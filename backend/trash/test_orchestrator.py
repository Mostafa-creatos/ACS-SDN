import sys
import os
import uuid
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Clean up any existing test DB file from previous runs first
if os.path.exists("test_sdn.db"):
    try:
        os.remove("test_sdn.db")
    except Exception:
        pass

# Add workspace directory to python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.main import app, get_db
from app.db import Base
from app import models

# Use a local SQLite database for validation testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_sdn.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

# Create SQLite tables
Base.metadata.create_all(bind=engine)

client = TestClient(app)

def run_tests():
    db = TestingSessionLocal()
    
    # 1. Seed initial workspace data (Tenant, Blueprint, Fabric, switches)
    tenant_id = str(uuid.uuid4())
    tenant = models.Tenant(tenant_id=uuid.UUID(tenant_id), tenant_name="Acme-Enterprise")
    db.add(tenant)
    
    blueprint = models.FabricBlueprint(
        name="L3-Leaf-Spine-Dev",
        underlay_p2p_cidr="10.100.0.0/16",
        loopback_cidr="10.200.0.0/16",
        vtep_cidr="10.250.0.0/16"
    )
    db.add(blueprint)
    db.flush()
    
    fabric = models.Fabric(fabric_name="DataCenter-East", blueprint_id=blueprint.blueprint_id, global_bgp_asn=65000)
    db.add(fabric)
    db.flush()
    
    switch1 = models.Switch(
        fabric_id=fabric.fabric_id,
        hostname="SW-LEAF-01",
        management_ip="10.254.11.1",
        vendor="dell_os10",
        role="leaf",
        local_bgp_asn=65001,
        loopback_0_ip="10.200.1.1",
        vtep_ip="10.250.1.1"
    )
    switch2 = models.Switch(
        fabric_id=fabric.fabric_id,
        hostname="SW-LEAF-02",
        management_ip="10.254.11.2",
        vendor="arista_eos",
        role="leaf",
        local_bgp_asn=65002,
        loopback_0_ip="10.200.1.2",
        vtep_ip="10.250.1.2"
    )
    switch_spine = models.Switch(
        fabric_id=fabric.fabric_id,
        hostname="SW-SPINE-01",
        management_ip="10.254.11.10",
        vendor="nokia",
        role="spine",
        local_bgp_asn=65010,
        loopback_0_ip="10.200.1.10",
        vtep_ip="10.250.1.10"
    )
    db.add(switch1)
    db.add(switch2)
    db.add(switch_spine)
    db.commit()
    db.close()

    print("[TEST SEED] Seeding completed.")

    # Build auth tokens
    headers_admin = {"Authorization": "Bearer mock-token-admin"}
    headers_operator = {"Authorization": "Bearer mock-token-operator-" + tenant_id}

    # 2. Test Policy Ingestion - Stage 4 Dry-run
    payload = {
        "tenant_id": tenant_id,
        "vrf_name": "VRF-A",
        "l3_vni": 5001,
        "l2_vni": 10001,
        "vlan_id": 100,
        "requested_cidr": "10.0.1.0/24",
        "target_switch_serials": ["SW-LEAF-01", "SW-LEAF-02"],
        "dry_run": True
    }
    
    print("\n--- TEST: Stage 4 Dry-Run Ingestion (Dell & Arista CLI/XML payloads) ---")
    response = client.post("/api/v5/orchestrator/policy-enforcement", json=payload, headers=headers_admin)
    print("Response Status Code:", response.status_code)
    assert response.status_code == 202
    res_data = response.json()
    assert res_data["policy_verification"] == "SUCCESS_PASSED"
    assert len(res_data["diff_matrix"]) == 2
    print("-> Switch 1 Dell XML Diff:\n", res_data["diff_matrix"][0]["generated_payload"])
    print("-> Switch 2 Arista CLI Diff:\n", res_data["diff_matrix"][1]["generated_payload"])

    # 3. Test Policy Ingestion - Active Enforcement (Commit to DB)
    print("\n--- TEST: Active Policy Enforcement Commit (Saves subnet to state) ---")
    payload["dry_run"] = False
    response = client.post("/api/v5/orchestrator/policy-enforcement", json=payload, headers=headers_operator)
    print("Response Status Code:", response.status_code)
    assert response.status_code == 202
    assert response.json()["policy_verification"] == "SUCCESS_COMMITTED"

    # 4. Test Stage 2 IP Overlap Rejection
    print("\n--- TEST: Stage 2 Subnet Overlap Enforcement (Blocks conflicts within VRF) ---")
    payload_overlap = {
        "tenant_id": tenant_id,
        "vrf_name": "VRF-A",
        "l3_vni": 5001,
        "l2_vni": 10002,
        "vlan_id": 101,
        "requested_cidr": "10.0.1.128/25",  # Overlaps within the 10.0.1.0/24 allocation!
        "target_switch_serials": ["SW-LEAF-01"],
        "dry_run": False
    }
    response = client.post("/api/v5/orchestrator/policy-enforcement", json=payload_overlap, headers=headers_operator)
    print("Response Status Code:", response.status_code)
    assert response.status_code == 400
    print("Overlap error details:", response.json()["detail"])

    # 5. Test ZTP Phone-Home Discovery Ingestion
    print("\n--- TEST: ZTP Discovery Ingestion (DHCP switch signal collection) ---")
    ztp_payload = {
        "serial_number": "SN-DELL-ZTP-999",
        "mac_address": "00:11:22:33:44:55",
        "hardware_vendor": "dell_os10",
        "hardware_model": "S5248F-ON",
        "base_os_version": "10.5.2.0"
    }
    response = client.post("/api/v5/discovery/on-boarding-ingestion", json=ztp_payload)
    print("Response Status Code:", response.status_code)
    assert response.status_code == 202
    assert response.json()["status"] == "DISCOVERY_INGESTION_ACCEPTED"
    print("ZTP registration verified.")

    # 6. Test Policy Reconciliation Deallocation & Rollback payload generation
    print("\n--- TEST: Lifecycle Reconciliation (IPAM deallocation & config rollback) ---")
    recon_payload = {
        "tenant_id": tenant_id,
        "vrf_name": "VRF-A",
        "subnet_cidr": "10.0.1.0/24"
    }
    response = client.post("/api/v5/orchestrator/policy-reconciliation", json=recon_payload, headers=headers_operator)
    print("Response Status Code:", response.status_code)
    assert response.status_code == 200
    recon_data = response.json()
    assert recon_data["policy_reconciliation"] == "SUCCESS_RECONCILED"
    assert len(recon_data["rollback_matrix"]) == 3
    print("-> Switch 1 Dell XML Rollback:\n", recon_data["rollback_matrix"][0]["rollback_payload"])
    print("-> Switch 2 Arista CLI Rollback:\n", recon_data["rollback_matrix"][1]["rollback_payload"])

    # 7. Test User Authentication
    print("\n--- TEST: User Authentication API /api/v5/auth/login ---")
    db = TestingSessionLocal()
    import bcrypt
    admin_pwd = bcrypt.hashpw("admin_password_123!".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    operator_pwd = bcrypt.hashpw("operator_password_123!".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    auditor_pwd = bcrypt.hashpw("auditor_password_123!".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    
    admin_user = models.User(username="admin_test", hashed_password=admin_pwd, role="Platform Admin")
    operator_user = models.User(username="operator_test", hashed_password=operator_pwd, role="Tenant Operator", tenant_id=uuid.UUID(tenant_id))
    auditor_user = models.User(username="auditor_test", hashed_password=auditor_pwd, role="Tenant Auditor", tenant_id=uuid.UUID(tenant_id))
    db.add(admin_user)
    db.add(operator_user)
    db.add(auditor_user)
    db.commit()
    db.close()

    # Login with correct admin credentials
    login_payload = {"username": "admin_test", "password": "admin_password_123!"}
    response = client.post("/api/v5/auth/login", json=login_payload)
    print("Admin login status:", response.status_code)
    assert response.status_code == 200
    token = response.json()["access_token"]
    assert token is not None

    # Login with incorrect password
    bad_login_payload = {"username": "admin_test", "password": "wrong_password"}
    response = client.post("/api/v5/auth/login", json=bad_login_payload)
    print("Bad password login status:", response.status_code)
    assert response.status_code == 401

    # Login with non-existing user
    non_user_payload = {"username": "ghost", "password": "some_password"}
    response = client.post("/api/v5/auth/login", json=non_user_payload)
    print("Non-existing user login status:", response.status_code)
    assert response.status_code == 401

    # 8. Test Platform Admin Tenant Creation
    print("\n--- TEST: Platform Admin Tenant Creation ---")
    headers_real_admin = {"Authorization": f"Bearer {token}"}
    tenant_payload = {"tenant_name": "New-Test-Tenant"}
    response = client.post("/api/v5/admin/tenants", json=tenant_payload, headers=headers_real_admin)
    print("Tenant creation status (Admin):", response.status_code)
    assert response.status_code == 201
    new_tenant_id = response.json()["tenant_id"]
    print("Created tenant ID:", new_tenant_id)

    # Attempt tenant creation as a non-admin (Tenant Operator)
    response = client.post("/api/v5/admin/tenants", json=tenant_payload, headers=headers_operator)
    print("Tenant creation status (Operator):", response.status_code)
    assert response.status_code == 403

    # 9. Test Tenant Auditor Restrictions (RBAC write protection)
    print("\n--- TEST: Tenant Auditor Write Restrictions ---")
    headers_auditor = {"Authorization": f"Bearer mock-token-auditor-{tenant_id}"}
    
    # Try to enforce policy as Auditor (should fail with 403)
    policy_payload = {
        "tenant_id": tenant_id,
        "vrf_name": "VRF-A",
        "l3_vni": 5002,
        "l2_vni": 10002,
        "vlan_id": 102,
        "requested_cidr": "10.0.2.0/24",
        "target_switch_serials": ["SW-LEAF-01"],
        "dry_run": True
    }
    response = client.post("/api/v5/orchestrator/policy-enforcement", json=policy_payload, headers=headers_auditor)
    print("Auditor policy enforcement write status:", response.status_code)
    assert response.status_code == 403

    # Try to delete/reconcile subnet as Auditor (should fail with 403)
    response = client.post("/api/v5/orchestrator/policy-reconciliation", json=recon_payload, headers=headers_auditor)
    print("Auditor policy reconciliation write status:", response.status_code)
    assert response.status_code == 403

    # 10. Test Northbound Pipeline - Blast-Radius Protection & Platform Admin Approvals
    print("\n--- TEST: Stage 4 Blast-Radius Suspension & Platform Admin Approvals ---")
    spine_policy_payload = {
        "tenant_id": tenant_id,
        "vrf_name": "VRF-A",
        "l3_vni": 5002,
        "l2_vni": 10002,
        "vlan_id": 102,
        "requested_cidr": "10.0.2.0/24",
        "target_switch_serials": ["SW-SPINE-01"],  # Spine switch! Blast radius = 6
        "dry_run": False
    }
    
    # Try to commit as Tenant Operator -> must be suspended
    response = client.post("/api/v5/orchestrator/policy-enforcement", json=spine_policy_payload, headers=headers_operator)
    print("Operator spine enforcement status (Suspended):", response.status_code)
    assert response.status_code == 202
    res_data = response.json()
    assert res_data["policy_verification"] == "PENDING_APPROVAL"
    assert res_data["blast_radius_score"] == 6
    print("Policy successfully suspended. Detail:", res_data["detail"])

    # List pending approvals as Operator (should work)
    response = client.get("/api/v5/orchestrator/approvals", headers=headers_operator)
    print("Operator approvals list status:", response.status_code)
    assert response.status_code == 200
    approvals_list = response.json()
    assert len(approvals_list) == 1
    approval_id = approvals_list[0]["id"]
    print("Pending approval ID found:", approval_id)

    # Attempt to approve as Operator -> must fail with 403
    response = client.post(f"/api/v5/orchestrator/approvals/{approval_id}/approve", headers=headers_operator)
    print("Operator attempt to approve status (403):", response.status_code)
    assert response.status_code == 403

    # Approve as Platform Admin -> must succeed with 200
    response = client.post(f"/api/v5/orchestrator/approvals/{approval_id}/approve", headers=headers_real_admin)
    print("Admin approval execution status (200):", response.status_code)
    assert response.status_code == 200
    assert response.json()["status"] == "APPROVED_COMMITTED"
    
    # Verify subnet was committed to DB
    db = TestingSessionLocal()
    subnet = db.query(models.IpamSubnet).filter(models.IpamSubnet.vlan_id == 102).first()
    assert subnet is not None
    assert subnet.subnet_cidr == "10.0.2.0/24"
    db.close()
    print("Verified: Subnet successfully committed to state after approval.")

    # Cleanup test db file
    db.close()
    if os.path.exists("test_sdn.db"):
        try:
            os.remove("test_sdn.db")
        except PermissionError:
            pass


    print("\n=============================================")
    print("ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!")
    print("=============================================")

if __name__ == "__main__":
    run_tests()

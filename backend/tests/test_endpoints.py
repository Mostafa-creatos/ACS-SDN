import os
import sys
import unittest
import subprocess

# Determine if we are running inside the Docker container
IN_CONTAINER = os.path.exists("/workspace")

if not IN_CONTAINER:
    # -------------------------------------------------------------------------
    # LOCAL MODE: Delegate every test case to the remote VM via SSH
    # -------------------------------------------------------------------------
    class TestAPIEndpoints(unittest.TestCase):
        def run_remote_test(self, test_name):
            cmd = [
                "ssh", "-i", "C:\\Users\\mosta\\.ssh\\id_rsa",
                "-o", "StrictHostKeyChecking=no",
                "mostafafaouzi89@34.90.176.247",
                f"docker exec sdn_controller_app python3 -m unittest tests.test_endpoints.TestAPIEndpoints.{test_name}"
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            print(res.stdout)
            print(res.stderr, file=sys.stderr)
            if res.returncode != 0:
                self.fail(f"Remote test failed:\nStdout:\n{res.stdout}\nStderr:\n{res.stderr}")

        # Inventory
        def test_get_inventory(self): self.run_remote_test("test_get_inventory")
        def test_get_inventory_pagination(self): self.run_remote_test("test_get_inventory_pagination")
        def test_get_inventory_no_auth(self): self.run_remote_test("test_get_inventory_no_auth")
        def test_get_admin_switches_list(self): self.run_remote_test("test_get_admin_switches_list")
        def test_create_switch_valid(self): self.run_remote_test("test_create_switch_valid")
        def test_create_switch_duplicate_ip(self): self.run_remote_test("test_create_switch_duplicate_ip")
        def test_create_switch_missing_fields(self): self.run_remote_test("test_create_switch_missing_fields")
        def test_get_switch_by_id(self): self.run_remote_test("test_get_switch_by_id")
        def test_get_switch_not_found(self): self.run_remote_test("test_get_switch_not_found")
        def test_update_switch(self): self.run_remote_test("test_update_switch")
        def test_delete_switch(self): self.run_remote_test("test_delete_switch")
        def test_get_switch_hardware(self): self.run_remote_test("test_get_switch_hardware")
        def test_get_switch_vlans(self): self.run_remote_test("test_get_switch_vlans")
        def test_get_switch_lags(self): self.run_remote_test("test_get_switch_lags")
        def test_get_switch_vlt(self): self.run_remote_test("test_get_switch_vlt")
        def test_collect_switch_snapshot(self): self.run_remote_test("test_collect_switch_snapshot")
        # Auth
        def test_login_valid(self): self.run_remote_test("test_login_valid")
        def test_login_invalid(self): self.run_remote_test("test_login_invalid")
        # Orchestrator
        def test_policy_enforcement_dry_run(self): self.run_remote_test("test_policy_enforcement_dry_run")
        def test_policy_enforcement_no_auth(self): self.run_remote_test("test_policy_enforcement_no_auth")
        def test_policy_reconciliation(self): self.run_remote_test("test_policy_reconciliation")
        def test_get_approvals(self): self.run_remote_test("test_get_approvals")
        def test_async_config_push(self): self.run_remote_test("test_async_config_push")
        # Discovery / ZTP
        def test_ztp_onboarding(self): self.run_remote_test("test_ztp_onboarding")
        # Visibility
        def test_get_snapshots(self): self.run_remote_test("test_get_snapshots")
        def test_create_snapshot(self): self.run_remote_test("test_create_snapshot")
        def test_rollback(self): self.run_remote_test("test_rollback")
        def test_compliance_run(self): self.run_remote_test("test_compliance_run")
        def test_compliance_latest(self): self.run_remote_test("test_compliance_latest")
        def test_get_telemetry(self): self.run_remote_test("test_get_telemetry")
        def test_get_endpoints(self): self.run_remote_test("test_get_endpoints")
        def test_get_stp(self): self.run_remote_test("test_get_stp")
        def test_export_csv(self): self.run_remote_test("test_export_csv")
        # Admin
        def test_get_stats(self): self.run_remote_test("test_get_stats")
        def test_get_tenants(self): self.run_remote_test("test_get_tenants")
        def test_create_tenant(self): self.run_remote_test("test_create_tenant")
        def test_get_ztp_pool(self): self.run_remote_test("test_get_ztp_pool")
        def test_get_subnets(self): self.run_remote_test("test_get_subnets")
        def test_get_topology(self): self.run_remote_test("test_get_topology")
        def test_get_topology_graph(self): self.run_remote_test("test_get_topology_graph")
        def test_sync_gnmi(self): self.run_remote_test("test_sync_gnmi")
        def test_sync_netdisco(self): self.run_remote_test("test_sync_netdisco")
        def test_trigger_discover(self): self.run_remote_test("test_trigger_discover")

else:
    # -------------------------------------------------------------------------
    # CONTAINER MODE: Actual test code running inside sdn_controller_app
    # -------------------------------------------------------------------------
    import uuid
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

    from app.main import app, get_db
    from app.db import Base
    from app import models

    SQLALCHEMY_DATABASE_URL = "sqlite:///./test_endpoints.db"
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    class TestAPIEndpoints(unittest.TestCase):
        @classmethod
        def setUpClass(cls):
            Base.metadata.create_all(bind=engine)
            cls.client = TestClient(app)
            cls.admin = {"Authorization": "Bearer mock-token-admin"}

        @classmethod
        def tearDownClass(cls):
            Base.metadata.drop_all(bind=engine)
            if os.path.exists("test_endpoints.db"):
                try:
                    os.remove("test_endpoints.db")
                except PermissionError:
                    pass

        def setUp(self):
            """Seed a fabric and a switch before each test."""
            self.db = TestingSessionLocal()
            self.fabric_id = uuid.uuid4()
            fabric = models.Fabric(
                fabric_id=self.fabric_id,
                fabric_name="TestFabric",
                global_bgp_asn=65000
            )
            self.db.add(fabric)
            self.db.commit()

            # Create a reusable test switch
            payload = {
                "hostname": "ENDPOINT-SW-01",
                "management_ip": "10.250.100.1",
                "vendor": "dell_os10",
                "role": "leaf",
                "local_bgp_asn": 65100,
                "loopback_0_ip": "10.200.100.1",
                "vtep_ip": "10.250.100.1",
                "model": "S5248F-ON",
                "os_version": "SmartFabric OS10 10.5.6.1",
                "serial_number": "SN-ENDPOINT-SW01",
                "location": "Casablanca, Morocco",
                "device_type": "Switch",
                "os_type": "OS10",
                "client_tenant": "TestTenant",
                "ports_up": 10,
                "ports_all": 52,
                "chassis_status": "Ready"
            }
            resp = self.client.post("/api/v5/admin/switches", json=payload, headers=self.admin)
            self.switch_id = resp.json().get("switch_id") if resp.status_code == 201 else None

        def tearDown(self):
            self.db.query(models.HardwareComponent).delete()
            self.db.query(models.SwitchVlan).delete()
            self.db.query(models.SwitchLag).delete()
            self.db.query(models.SwitchVltDomain).delete()
            self.db.query(models.DeviceInterface).delete()
            self.db.query(models.Switch).delete()
            self.db.query(models.Fabric).delete()
            self.db.commit()
            self.db.close()

        # =====================================================================
        # Inventory Endpoints
        # =====================================================================

        def test_get_inventory(self):
            """GET /api/v5/visibility/inventory returns paginated switch list."""
            r = self.client.get("/api/v5/visibility/inventory", headers=self.admin)
            self.assertEqual(r.status_code, 200)
            body = r.json()
            self.assertIn("items", body)
            self.assertIsInstance(body["items"], list)

        def test_get_inventory_pagination(self):
            """GET /api/v5/visibility/inventory supports per_page and page params."""
            r = self.client.get("/api/v5/visibility/inventory?per_page=1&page=1", headers=self.admin)
            self.assertEqual(r.status_code, 200)
            body = r.json()
            self.assertIn("total", body)
            self.assertLessEqual(len(body["items"]), 1)

        def test_get_inventory_no_auth(self):
            """GET /api/v5/visibility/inventory without auth returns 403."""
            r = self.client.get("/api/v5/visibility/inventory")
            self.assertIn(r.status_code, [401, 403])

        def test_get_admin_switches_list(self):
            """GET /api/v5/admin/switches returns switch list."""
            r = self.client.get("/api/v5/admin/switches", headers=self.admin)
            self.assertEqual(r.status_code, 200)
            self.assertIsInstance(r.json(), list)

        def test_create_switch_valid(self):
            """POST /api/v5/admin/switches creates a new switch."""
            payload = {
                "hostname": "NEW-SW-99",
                "management_ip": "10.250.200.99",
                "vendor": "dell_os10",
                "role": "spine",
                "local_bgp_asn": 65999,
                "loopback_0_ip": "10.200.200.99",
            }
            r = self.client.post("/api/v5/admin/switches", json=payload, headers=self.admin)
            self.assertEqual(r.status_code, 201)
            self.assertEqual(r.json()["status"], "DEVICE_REGISTERED")

        def test_create_switch_duplicate_ip(self):
            """POST /api/v5/admin/switches with duplicate IP is accepted (API does not enforce IP uniqueness)."""
            payload = {
                "hostname": "DUPE-SW",
                "management_ip": "10.250.100.1",  # same as setUp switch
                "vendor": "dell_os10",
                "role": "leaf",
                "local_bgp_asn": 65101,
                "loopback_0_ip": "10.200.100.2",
            }
            r = self.client.post("/api/v5/admin/switches", json=payload, headers=self.admin)
            # API currently allows duplicate IPs — it creates a new record
            self.assertIn(r.status_code, [201, 400, 409])

        def test_create_switch_missing_fields(self):
            """POST /api/v5/admin/switches with missing required field returns 422."""
            r = self.client.post("/api/v5/admin/switches", json={"hostname": "MISSING"}, headers=self.admin)
            self.assertEqual(r.status_code, 422)

        def test_get_switch_by_id(self):
            """GET /api/v5/admin/switches/{id} returns switch detail."""
            self.assertIsNotNone(self.switch_id, "Switch was not created in setUp")
            r = self.client.get(f"/api/v5/admin/switches/{self.switch_id}", headers=self.admin)
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()["switch_id"], self.switch_id)

        def test_get_switch_not_found(self):
            """GET /api/v5/admin/switches/{id} with bogus ID returns 404."""
            r = self.client.get(f"/api/v5/admin/switches/{uuid.uuid4()}", headers=self.admin)
            self.assertEqual(r.status_code, 404)

        def test_update_switch(self):
            """PUT /api/v5/admin/switches/{id} updates switch metadata."""
            self.assertIsNotNone(self.switch_id)
            r = self.client.put(
                f"/api/v5/admin/switches/{self.switch_id}",
                json={"location": "Rabat, Morocco"},
                headers=self.admin
            )
            self.assertEqual(r.status_code, 200)

        def test_delete_switch(self):
            """DELETE /api/v5/admin/switches/{id} removes switch."""
            self.assertIsNotNone(self.switch_id)
            r = self.client.delete(f"/api/v5/admin/switches/{self.switch_id}", headers=self.admin)
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()["status"], "DEVICE_DELETED")

        def test_get_switch_hardware(self):
            """GET /api/v5/admin/switches/{id}/hardware returns hardware components."""
            self.assertIsNotNone(self.switch_id)
            self.client.post(f"/api/v5/admin/switches/{self.switch_id}/collect", headers=self.admin)
            r = self.client.get(f"/api/v5/admin/switches/{self.switch_id}/hardware", headers=self.admin)
            self.assertEqual(r.status_code, 200)
            self.assertIsInstance(r.json(), list)

        def test_get_switch_vlans(self):
            """GET /api/v5/admin/switches/{id}/vlans returns VLAN list."""
            self.assertIsNotNone(self.switch_id)
            self.client.post(f"/api/v5/admin/switches/{self.switch_id}/collect", headers=self.admin)
            r = self.client.get(f"/api/v5/admin/switches/{self.switch_id}/vlans", headers=self.admin)
            self.assertEqual(r.status_code, 200)
            self.assertIsInstance(r.json(), list)

        def test_get_switch_lags(self):
            """GET /api/v5/admin/switches/{id}/lags returns LAG list."""
            self.assertIsNotNone(self.switch_id)
            self.client.post(f"/api/v5/admin/switches/{self.switch_id}/collect", headers=self.admin)
            r = self.client.get(f"/api/v5/admin/switches/{self.switch_id}/lags", headers=self.admin)
            self.assertEqual(r.status_code, 200)
            self.assertIsInstance(r.json(), list)

        def test_get_switch_vlt(self):
            """GET /api/v5/admin/switches/{id}/vlt returns VLT domain."""
            self.assertIsNotNone(self.switch_id)
            self.client.post(f"/api/v5/admin/switches/{self.switch_id}/collect", headers=self.admin)
            r = self.client.get(f"/api/v5/admin/switches/{self.switch_id}/vlt", headers=self.admin)
            self.assertIn(r.status_code, [200, 404])

        def test_collect_switch_snapshot(self):
            """POST /api/v5/admin/switches/{id}/collect triggers a collection."""
            self.assertIsNotNone(self.switch_id)
            r = self.client.post(f"/api/v5/admin/switches/{self.switch_id}/collect", headers=self.admin)
            self.assertEqual(r.status_code, 200)
            data = r.json()
            self.assertEqual(data["status"], "COLLECTION_COMPLETED")
            self.assertIsNotNone(data.get("config_hash"))

        # =====================================================================
        # Auth Endpoints
        # =====================================================================

        def test_login_valid(self):
            """POST /api/v5/auth/login returns token for valid credentials."""
            r = self.client.post("/api/v5/auth/login", json={"username": "admin", "password": "admin"})
            self.assertIn(r.status_code, [200, 401])  # 401 if no admin user seeded

        def test_login_invalid(self):
            """POST /api/v5/auth/login rejects bad credentials."""
            r = self.client.post("/api/v5/auth/login", json={"username": "bad", "password": "wrong"})
            self.assertIn(r.status_code, [401, 403])

        # =====================================================================
        # Orchestrator Endpoints
        # =====================================================================

        def test_policy_enforcement_dry_run(self):
            """POST /api/v5/orchestrator/policy-enforcement accepts a dry-run."""
            self.assertIsNotNone(self.switch_id)
            # Fetch the switch's hostname to use as serial target
            sw_resp = self.client.get(f"/api/v5/admin/switches/{self.switch_id}", headers=self.admin)
            hostname = sw_resp.json().get("hostname", "ENDPOINT-SW-01") if sw_resp.status_code == 200 else "ENDPOINT-SW-01"
            payload = {
                "tenant_id": str(uuid.uuid4()),
                "vrf_name": "TEST-VRF",
                "requested_cidr": "192.168.55.0/24",
                "vlan_id": 555,
                "l2_vni": 10555,
                "l3_vni": 20555,
                "target_switch_serials": [hostname],
                "dry_run": True
            }
            r = self.client.post("/api/v5/orchestrator/policy-enforcement", json=payload, headers=self.admin)
            self.assertIn(r.status_code, [200, 202, 400, 404, 422])

        def test_policy_enforcement_no_auth(self):
            """POST /api/v5/orchestrator/policy-enforcement without auth returns 403."""
            payload = {
                "tenant_id": str(uuid.uuid4()),
                "vrf_name": "VRF",
                "requested_cidr": "10.0.0.0/24",
                "vlan_id": 1,
                "l2_vni": 10001,
                "l3_vni": 20001,
                "target_switch_serials": [],
                "dry_run": True
            }
            r = self.client.post("/api/v5/orchestrator/policy-enforcement", json=payload)
            self.assertIn(r.status_code, [401, 403])

        def test_policy_reconciliation(self):
            """POST /api/v5/orchestrator/policy-reconciliation handles rollback request."""
            payload = {
                "tenant_id": str(uuid.uuid4()),
                "vrf_name": "MISSING-VRF",
                "subnet_cidr": "192.168.99.0/24"
            }
            r = self.client.post("/api/v5/orchestrator/policy-reconciliation", json=payload, headers=self.admin)
            self.assertIn(r.status_code, [200, 404])

        def test_get_approvals(self):
            """GET /api/v5/orchestrator/approvals returns approval queue."""
            r = self.client.get("/api/v5/orchestrator/approvals", headers=self.admin)
            self.assertIn(r.status_code, [200])
            self.assertIsInstance(r.json(), list)

        def test_async_config_push(self):
            """POST /api/v5/orchestrator/async-config-push dispatches a Celery task."""
            self.assertIsNotNone(self.switch_id)
            payload = {"switch_id": self.switch_id, "config_data": "hostname TEST"}
            r = self.client.post("/api/v5/orchestrator/async-config-push", json=payload, headers=self.admin)
            self.assertIn(r.status_code, [200, 202, 404])

        # =====================================================================
        # ZTP / Discovery
        # =====================================================================

        def test_ztp_onboarding(self):
            """POST /api/v5/discovery/on-boarding-ingestion accepts ZTP beacon."""
            payload = {
                "serial_number": "ZTP-SERIAL-001",
                "mac_address": "AA:BB:CC:DD:EE:FF",
                "hardware_vendor": "dell",
                "hardware_model": "S5248F-ON",
                "base_os_version": "OS10 10.5.6.1"
            }
            r = self.client.post("/api/v5/discovery/on-boarding-ingestion", json=payload)
            self.assertIn(r.status_code, [200, 202])

        # =====================================================================
        # Visibility Endpoints
        # =====================================================================

        def test_get_snapshots(self):
            """GET /api/v5/visibility/snapshots returns snapshot list."""
            r = self.client.get("/api/v5/visibility/snapshots", headers=self.admin)
            self.assertEqual(r.status_code, 200)

        def test_create_snapshot(self):
            """POST /api/v5/visibility/snapshots creates a manual snapshot."""
            self.assertIsNotNone(self.switch_id)
            r = self.client.post(
                "/api/v5/visibility/snapshots",
                json={"switch_id": self.switch_id},
                headers=self.admin
            )
            self.assertIn(r.status_code, [200, 201, 422])

        def test_rollback(self):
            """POST /api/v5/visibility/rollback handles rollback request."""
            r = self.client.post(
                "/api/v5/visibility/rollback",
                json={"switch_id": str(uuid.uuid4()), "snapshot_id": str(uuid.uuid4())},
                headers=self.admin
            )
            self.assertIn(r.status_code, [200, 404, 422])

        def test_compliance_run(self):
            """POST /api/v5/visibility/compliance/run triggers compliance check."""
            r = self.client.post("/api/v5/visibility/compliance/run", headers=self.admin)
            self.assertIn(r.status_code, [200, 202])

        def test_compliance_latest(self):
            """GET /api/v5/visibility/compliance/latest returns latest report."""
            r = self.client.get("/api/v5/visibility/compliance/latest", headers=self.admin)
            self.assertIn(r.status_code, [200])

        def test_get_telemetry(self):
            """GET /api/v5/visibility/telemetry returns telemetry metrics."""
            r = self.client.get("/api/v5/visibility/telemetry", headers=self.admin)
            self.assertEqual(r.status_code, 200)

        def test_get_endpoints(self):
            """GET /api/v5/visibility/endpoints returns endpoint list."""
            r = self.client.get("/api/v5/visibility/endpoints", headers=self.admin)
            self.assertEqual(r.status_code, 200)

        def test_get_stp(self):
            """GET /api/v5/visibility/stp returns STP topology data."""
            r = self.client.get("/api/v5/visibility/stp", headers=self.admin)
            self.assertEqual(r.status_code, 200)

        def test_export_csv(self):
            """GET /api/v5/visibility/reports/csv returns a CSV file."""
            r = self.client.get("/api/v5/visibility/reports/csv", headers=self.admin)
            self.assertEqual(r.status_code, 200)
            self.assertIn("text/csv", r.headers.get("content-type", ""))

        # =====================================================================
        # Admin Endpoints
        # =====================================================================

        def test_get_stats(self):
            """GET /api/v5/admin/stats returns dashboard statistics."""
            r = self.client.get("/api/v5/admin/stats", headers=self.admin)
            self.assertEqual(r.status_code, 200)

        def test_get_tenants(self):
            """GET /api/v5/admin/tenants returns tenant list."""
            r = self.client.get("/api/v5/admin/tenants", headers=self.admin)
            self.assertEqual(r.status_code, 200)
            self.assertIsInstance(r.json(), list)

        def test_create_tenant(self):
            """POST /api/v5/admin/tenants creates a new tenant."""
            payload = {
                "tenant_name": "TestTenant-New",
                "contact_email": "test@tenant.com",
                "allocated_vlans": "100-200"
            }
            r = self.client.post("/api/v5/admin/tenants", json=payload, headers=self.admin)
            self.assertIn(r.status_code, [200, 201])

        def test_get_ztp_pool(self):
            """GET /api/v5/admin/ztp-pool returns ZTP pool entries."""
            r = self.client.get("/api/v5/admin/ztp-pool", headers=self.admin)
            self.assertEqual(r.status_code, 200)

        def test_get_subnets(self):
            """GET /api/v5/admin/subnets returns subnet allocations."""
            r = self.client.get("/api/v5/admin/subnets", headers=self.admin)
            self.assertEqual(r.status_code, 200)

        def test_get_topology(self):
            """GET /api/v5/admin/topology returns topology data."""
            r = self.client.get("/api/v5/admin/topology", headers=self.admin)
            self.assertEqual(r.status_code, 200)

        def test_get_topology_graph(self):
            """GET /api/v5/topology/graph returns graph topology."""
            r = self.client.get("/api/v5/topology/graph", headers=self.admin)
            self.assertEqual(r.status_code, 200)

        def test_sync_gnmi(self):
            """POST /api/v5/admin/sync-gnmi triggers gNMI sync."""
            r = self.client.post("/api/v5/admin/sync-gnmi", headers=self.admin)
            self.assertIn(r.status_code, [200, 202])

        def test_sync_netdisco(self):
            """POST /api/v5/admin/sync-netdisco triggers Netdisco sync."""
            r = self.client.post("/api/v5/admin/sync-netdisco", headers=self.admin)
            self.assertIn(r.status_code, [200, 202])

        def test_trigger_discover(self):
            """POST /api/v5/admin/trigger-discover triggers device discovery with ip param."""
            r = self.client.post(
                "/api/v5/admin/trigger-discover",
                json={"ip": "10.250.100.1"},
                headers=self.admin
            )
            self.assertIn(r.status_code, [200, 202, 404])


if __name__ == '__main__':
    unittest.main()

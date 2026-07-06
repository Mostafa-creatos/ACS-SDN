import os
import sys
import unittest
import subprocess

# Determine if we are running inside the Docker container
IN_CONTAINER = os.path.exists("/workspace")

if not IN_CONTAINER:
    class TestDeviceInventory(unittest.TestCase):
        def run_remote_test(self, test_name):
            cmd = [
                "ssh", "-i", "C:\\Users\\mosta\\.ssh\\id_rsa",
                "-o", "StrictHostKeyChecking=no",
                "mostafafaouzi89@34.90.176.247",
                f"docker exec sdn_controller_app python3 -m unittest tests.test_device_inventory.TestDeviceInventory.{test_name}"
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            print(res.stdout)
            print(res.stderr, file=sys.stderr)
            if res.returncode != 0:
                self.fail(f"Remote test failed:\nStdout:\n{res.stdout}\nStderr:\n{res.stderr}")

        def test_create_and_delete_switch(self):
            self.run_remote_test("test_create_and_delete_switch")

        def test_collect_snapshot(self):
            self.run_remote_test("test_collect_snapshot")

else:
    # Actual test code running inside the container
    import uuid
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    # Add app directory to python path
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

    from app.main import app, get_db
    from app.db import Base
    from app import models

    # Use a local SQLite database for validation testing
    SQLALCHEMY_DATABASE_URL = "sqlite:///./test_inventory.db"
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    class TestDeviceInventory(unittest.TestCase):
        @classmethod
        def setUpClass(cls):
            # Create database tables
            Base.metadata.create_all(bind=engine)
            cls.client = TestClient(app)

        @classmethod
        def tearDownClass(cls):
            # Cleanup
            Base.metadata.drop_all(bind=engine)
            if os.path.exists("test_inventory.db"):
                try:
                    os.remove("test_inventory.db")
                except PermissionError:
                    pass

        def setUp(self):
            # Seed basic fabric and switches
            self.db = TestingSessionLocal()
            self.fabric_id = uuid.uuid4()
            
            # Add basic fabric
            fabric = models.Fabric(
                fabric_id=self.fabric_id,
                fabric_name="TestFabric",
                global_bgp_asn=65000
            )
            self.db.add(fabric)
            self.db.commit()
            
            # Auth headers
            self.headers_admin = {"Authorization": "Bearer mock-token-admin"}
            self.headers_operator = {"Authorization": "Bearer mock-token-operator-11111111-1111-1111-1111-11111111111a"}

        def tearDown(self):
            self.db.query(models.DeviceInterface).delete()
            self.db.query(models.Switch).delete()
            self.db.query(models.Fabric).delete()
            self.db.commit()
            self.db.close()

        def test_create_and_delete_switch(self):
            # Register a switch manually
            payload = {
                "hostname": "TEST-SW-01",
                "management_ip": "10.250.90.1",
                "vendor": "cisco",
                "role": "Switch",
                "local_bgp_asn": 65200,
                "loopback_0_ip": "10.200.90.1",
                "vtep_ip": None,
                "model": "C9300-48P",
                "os_version": "IOS XE 17.9.4",
                "serial_number": "SN-TEST-SW01",
                "location": "Casablanca, Morocco",
                "device_type": "Switch",
                "os_type": "IOS-XE",
                "client_tenant": "AtlasWave Maroc Demo",
                "ports_up": 5,
                "ports_all": 48,
                "chassis_status": "Ready"
            }
            
            # Test creation
            response = self.client.post("/api/v5/admin/switches", json=payload, headers=self.headers_admin)
            self.assertEqual(response.status_code, 201)
            data = response.json()
            self.assertEqual(data["status"], "DEVICE_REGISTERED")
            switch_id = data["switch_id"]
            
            # Test inventory list endpoint includes this new switch
            response = self.client.get("/api/v5/visibility/inventory", headers=self.headers_admin)
            self.assertEqual(response.status_code, 200)
            sw_list = response.json()["items"]
            found = any(sw["switch_id"] == switch_id for sw in sw_list)
            self.assertTrue(found)
            
            # Test editing metadata
            update_payload = {"location": "Rabat, Morocco"}
            response = self.client.put(f"/api/v5/admin/switches/{switch_id}", json=update_payload, headers=self.headers_admin)
            self.assertEqual(response.status_code, 200)
            
            # Verify it was updated
            response = self.client.get("/api/v5/visibility/inventory", headers=self.headers_admin)
            sw = next(s for s in response.json()["items"] if s["switch_id"] == switch_id)
            self.assertEqual(sw["location"], "Rabat, Morocco")
            
            # Test deletion
            response = self.client.delete(f"/api/v5/admin/switches/{switch_id}", headers=self.headers_admin)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], "DEVICE_DELETED")
            
            # Verify it is gone
            response = self.client.get("/api/v5/visibility/inventory", headers=self.headers_admin)
            found = any(sw["switch_id"] == switch_id for sw in response.json()["items"])
            self.assertFalse(found)

        def test_collect_snapshot(self):
            # Add a switch directly to db
            switch_id = uuid.uuid4()
            sw = models.Switch(
                switch_id=switch_id,
                fabric_id=self.fabric_id,
                hostname="TEST-SW-COLLECT",
                management_ip="10.250.90.2",
                vendor="dell_os10",
                role="leaf",
                local_bgp_asn=65201,
                loopback_0_ip="10.200.90.2",
                vtep_ip="10.250.90.2"
            )
            self.db.add(sw)
            self.db.commit()
            
            # Trigger collection
            response = self.client.post(f"/api/v5/admin/switches/{switch_id}/collect", headers=self.headers_admin)
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["status"], "COLLECTION_COMPLETED")
            self.assertIsNotNone(data["config_hash"])
            
            # Query inventory to see collection timestamp is set
            response = self.client.get("/api/v5/visibility/inventory", headers=self.headers_admin)
            sw_details = next(s for s in response.json()["items"] if s["switch_id"] == str(switch_id))
            self.assertIsNotNone(sw_details["last_collection_timestamp"])
            self.assertTrue(len(sw_details["interfaces"]) > 0)

if __name__ == '__main__':
    unittest.main()

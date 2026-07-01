import os
import sys
import asyncio
from unittest.mock import MagicMock

# Mock pygnmi to allow local testing without internet/sandbox issues
class MockGNMIClient:
    def __init__(self, *args, **kwargs):
        pass
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        pass
    def get(self, *args, **kwargs):
        return {
            "notification": [{
                "update": [{
                    "val": {
                        "interface": [{
                            "name": "ethernet-1/1",
                            "neighbor": [{
                                "system-name": "spine-01",
                                "port-id": "ethernet-1/1"
                            }]
                        }]
                    }
                }]
            }]
        }

mock_pygnmi = MagicMock()
mock_pygnmi.client.gNMIclient = MockGNMIClient
sys.modules['pygnmi'] = mock_pygnmi
sys.modules['pygnmi.client'] = mock_pygnmi.client

test_db_filename = "test_sync.db"
if os.path.exists(test_db_filename):
    try:
        os.remove(test_db_filename)
    except Exception:
        pass

# Add workspace directory to python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

test_engine = create_engine(f"sqlite:///./{test_db_filename}", connect_args={"check_same_thread": False})
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

import app.db
app.db.engine = test_engine
app.db.SessionLocal = TestSessionLocal

from app.db import Base
from app import models
from app.workers.sync_tasks import run_topology_discovery_sync

# Create schemas in the test database
Base.metadata.create_all(bind=test_engine)

async def test_sync_loop():
    print("--- [TEST] Starting Native gNMI Topology Discovery Sync Integration Test ---")
    db = TestSessionLocal()
    
    # Seed switches in the inventory
    spine = models.Switch(
        switch_id=models.uuid.uuid4(),
        fabric_id=models.uuid.uuid4(),
        hostname="spine-01",
        management_ip="172.20.20.10",
        vendor="nokia",
        role="spine",
        local_bgp_asn=65000,
        loopback_0_ip="10.200.1.10",
        vtep_ip="10.250.1.10",
        lifecycle_status="compliant_active"
    )
    leaf = models.Switch(
        switch_id=models.uuid.uuid4(),
        fabric_id=spine.fabric_id,
        hostname="leaf-01",
        management_ip="172.20.20.11",
        vendor="nokia",
        role="leaf",
        local_bgp_asn=65001,
        loopback_0_ip="10.200.1.11",
        vtep_ip="10.250.1.11",
        lifecycle_status="compliant_active"
    )
    db.add(spine)
    db.add(leaf)
    db.commit()

    # Verify initial topology nodes/edges count
    assert db.query(models.TopologyNode).count() == 0
    assert db.query(models.TopologyEdge).count() == 0

    # Run native topology discovery
    print("[TEST] Running native gNMI discovery sync...")
    await run_topology_discovery_sync(db)
    
    # Assert nodes and edges were built
    node_count = db.query(models.TopologyNode).count()
    edge_count = db.query(models.TopologyEdge).count()
    print(f"[TEST] Discovered Topology Nodes: {node_count}, Edges: {edge_count}")
    
    assert node_count == 2
    assert edge_count > 0
    
    edges = db.query(models.TopologyEdge).all()
    for edge in edges:
        print(f"[TEST] Link: {edge.local_switch}:{edge.local_port} <-> {edge.remote_switch}:{edge.remote_port} (State: {edge.state})")
        assert edge.state == "up"

    db.close()
    print("\n[TEST] ---> ALL NATIVE TOPOLOGY DISCOVERY INTEGRATION TESTS PASSED SUCCESSFULLY! <---")

if __name__ == "__main__":
    asyncio.run(test_sync_loop())
    
    # Cleanup test db file
    if os.path.exists(test_db_filename):
        try:
            os.remove(test_db_filename)
            print("[TEST] Cleaned up temporary test database.")
        except PermissionError:
            pass

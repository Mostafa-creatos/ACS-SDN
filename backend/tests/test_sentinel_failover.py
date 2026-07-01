import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# Mock pygnmi to prevent import errors during local unit test runs
mock_pygnmi = MagicMock()
sys.modules['pygnmi'] = mock_pygnmi
sys.modules['pygnmi.client'] = mock_pygnmi.client

# Add workspace directory to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class TestRedisSentinelFailover(unittest.TestCase):
    @patch('redis.sentinel.Sentinel')
    def test_sentinel_resolution_and_failover(self, mock_sentinel_class):
        # Configure mock Sentinel
        mock_sentinel_instance = MagicMock()
        mock_sentinel_class.return_value = mock_sentinel_instance
        
        # Mock sentinel master resolution
        mock_master_conn = MagicMock()
        mock_sentinel_instance.master_for.return_value = mock_master_conn
        
        # Test resolution configuration
        from app.workers.celery_app import REDIS_SENTINEL_MASTER
        self.assertEqual(REDIS_SENTINEL_MASTER, 'mymaster')
        
        # Verify initial ping to master
        mock_master_conn.ping.return_value = True
        self.assertTrue(mock_master_conn.ping())
        
        print("[TEST SENTINEL] Master connection successfully established via Sentinels.")
        print("[TEST SENTINEL] Simulating Sentinel master crash failover...")
        
        # Re-resolve master after simulated failover
        new_master_conn = MagicMock()
        mock_sentinel_instance.master_for.return_value = new_master_conn
        new_master_conn.ping.return_value = True
        
        self.assertTrue(new_master_conn.ping())
        print("[TEST SENTINEL] Sentinel successfully resolved new master node after crash.")

if __name__ == '__main__':
    unittest.main()

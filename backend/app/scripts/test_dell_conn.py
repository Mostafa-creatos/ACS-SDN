import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.drivers.dell_os10 import connect_os10_collector

print("Testing Dell OS10 collector connection on 172.20.20.12...")
try:
    collector, transport = connect_os10_collector("172.20.20.12", "admin", "admin")
    print(f"Connected successfully via transport: {transport}!")
    cfg = collector.collect_running_config()
    print(f"Collected running config length: {len(cfg)} bytes")
    collector.close()
except Exception as e:
    print(f"Connection failed: {e}")

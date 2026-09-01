import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.drivers.dell_os10_collector import DellOS10Collector

print("Testing console port 5000 on 172.20.20.12...")
try:
    c = DellOS10Collector("172.20.20.12", "admin", "admin", port=5000, use_ssh=False)
    c.connect()
    print("Console connected successfully!")
    cfg = c.collect_running_config()
    print("Collected config bytes:", len(cfg))
    c.close()
except Exception as e:
    print("Console connection failed:", e)

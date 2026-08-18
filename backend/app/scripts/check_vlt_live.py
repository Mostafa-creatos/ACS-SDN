import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.drivers.dell_os10_collector import DellOS10Collector

try:
    with DellOS10Collector("172.20.20.12", "admin", "admin", 5000, use_ssh=False) as c:
        out = c._send_command("show running-configuration | grep vlt")
        print("Running Config VLT Output on switch-12:")
        print(out)
except Exception as e:
    print("Running Config Error:", e)

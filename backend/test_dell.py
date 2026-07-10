import sys
sys.path.append('/workspace/app')
from drivers.dell_os10_collector import DellOS10Collector
c = DellOS10Collector('172.20.20.10', port=5000, use_ssh=False)
c.connect()
print(c.collect_running_config()[:200])

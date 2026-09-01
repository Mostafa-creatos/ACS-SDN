import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.workers.config_lifecycle import config_compliance_mgr

print("Dispatching Celery compliance audit task...")
task = config_compliance_mgr.delay()
print(f"Task dispatched successfully! ID: {task.id}")

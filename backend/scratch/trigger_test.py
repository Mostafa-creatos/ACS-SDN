import os
if os.path.exists("/proc/1/environ"):
    with open("/proc/1/environ", "r") as f:
        for line in f.read().split("\0"):
            if "=" in line:
                k, v = line.split("=", 1)
                os.environ[k] = v

from app.workers.celery_app import celery_app
from app.workers.ztp_tasks import trigger_rollback
res = trigger_rollback.delay("07ce3c2b-3ec1-4956-ba18-4ae5f1606116")
print(f"Task triggered! Task ID: {res.id}")

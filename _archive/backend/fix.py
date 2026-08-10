from app.db import SessionLocal
from app import models
from app.workers.ztp_tasks import provision_baseline

db = SessionLocal()
s1 = db.query(models.Switch).filter_by(hostname="spine-01").first()
s2 = db.query(models.Switch).filter_by(hostname="spine-02").first()

if s1:
    print(f"Queueing ZTP for {s1.hostname} (ID {s1.switch_id})")
    provision_baseline.delay(s1.switch_id)

if s2:
    print(f"Queueing ZTP for {s2.hostname} (ID {s2.switch_id})")
    provision_baseline.delay(s2.switch_id)

print("ZTP tasks successfully queued via Celery!")

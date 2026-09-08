import time
from app import db, models
from app.workers.sync_tasks import sync_switch_config_task
from celery.result import AsyncResult
from app.workers.celery_app import celery_app

def run_test():
    s = db.SessionLocal()
    sw = s.query(models.Switch).filter(models.Switch.hostname == "DC1-Leaf-3").first()
    if not sw:
        print("DC1-Leaf-3 not found!")
        return
    
    valid_os10_config = "interface vlan 101\ndescription APP-VLAN-101\nno shutdown"
    print(f"Triggering config push for {sw.hostname} ({sw.management_ip}) with multi-line commands...")
    t = sync_switch_config_task.delay(str(sw.switch_id), valid_os10_config)
    print(f"Task ID: {t.id}")
    for i in range(15):
        time.sleep(1)
        res = AsyncResult(t.id, app=celery_app)
        print(f"[{i+1}s] Task State: {res.state}, Result: {res.result}")
        if res.ready():
            break

if __name__ == "__main__":
    run_test()

import time
from app import db, models
from app.workers.ztp_tasks import apply_baseline_template

def run_ztp():
    s = db.SessionLocal()
    sw = s.query(models.Switch).filter_by(hostname="DC2-Leaf-1").first()
    if not sw:
        print("DC2-Leaf-1 not found in DB!")
        return

    print(f"Triggering apply_baseline_template for {sw.hostname} ({sw.switch_id})...")
    task = apply_baseline_template.delay(str(sw.switch_id))
    print(f"Task ID: {task.id}")
    
    for i in range(25):
        time.sleep(1)
        s.refresh(sw)
        rec = s.query(models.ZtpDiscoveryPool).filter_by(discovery_id=sw.discovery_id).first()
        print(f"[{i+1}s] Status: {rec.onboarding_status if rec else 'N/A'}")
        if task.ready():
            print("Task completed!")
            print("Final Result:", task.result)
            if rec and rec.ztp_logs:
                print("--- ZTP LOGS ---")
                print(rec.ztp_logs)
            break

if __name__ == "__main__":
    run_ztp()

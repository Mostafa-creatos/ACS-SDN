from app.db import SessionLocal
from app import models

def sync_tags():
    db = SessionLocal()
    try:
        sw11 = db.query(models.Switch).filter(models.Switch.hostname == "switch-11").first()
        if sw11:
            sw11.configured_vrfs = ["VRF_TEST_01", "VRF_GUEST_01"]

        sw14 = db.query(models.Switch).filter(models.Switch.hostname == "switch-14").first()
        if sw14:
            sw14.configured_vrfs = ["VRF_TEST_01", "VRF_FINANCE_SECURE"]

        sw15 = db.query(models.Switch).filter(models.Switch.hostname == "switch-15").first()
        if sw15:
            sw15.configured_vrfs = ["VRF_TEST_01", "VRF_FINANCE_SECURE"]

        db.commit()
        print("SYNC_TAGS_SUCCESS")
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    sync_tags()

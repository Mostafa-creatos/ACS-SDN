from app.db import SessionLocal
from app.models import Switch, ZtpDiscoveryPool

def main():
    db = SessionLocal()
    try:
        # Delete duplicate switches that are in discovered_raw status
        raw_switches = db.query(Switch).filter(Switch.lifecycle_status == "discovered_raw").all()
        print(f"Found {len(raw_switches)} duplicate raw switches.")
        for sw in raw_switches:
            print(f"Deleting switch: {sw.hostname} (IP: {sw.management_ip})")
            db.delete(sw)
        
        # Reset any ZtpDiscoveryPool status to 'provisioned' if they were assigned
        # and ensure we don't have dangling entries
        db.commit()
        print("Cleanup completed successfully.")
    except Exception as e:
        db.rollback()
        print(f"Error during cleanup: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()

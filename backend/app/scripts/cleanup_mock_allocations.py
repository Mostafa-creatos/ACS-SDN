from app.db import SessionLocal
from app.models import IpamIpAllocation

def cleanup():
    db = SessionLocal()
    deleted = db.query(IpamIpAllocation).filter(IpamIpAllocation.bound_entity_id.like("Host-Device-%")).delete(synchronize_session=False)
    db.commit()
    print(f"Cleanup completed: removed {deleted} mock allocations.")
    db.close()

if __name__ == "__main__":
    cleanup()

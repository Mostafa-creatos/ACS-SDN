import uuid
from app.db import SessionLocal
from app.models import Tenant

def seed_custom_tenants():
    db = SessionLocal()
    try:
        t1 = db.query(Tenant).filter(Tenant.tenant_name == "Test-Enterprise-01").first()
        if not t1:
            db.add(Tenant(tenant_id=uuid.UUID("023966c9-a945-4249-b51e-0bfb6c36acd2"), tenant_name="Test-Enterprise-01"))
        
        t2 = db.query(Tenant).filter(Tenant.tenant_name == "Finance-Dept-Tenant").first()
        if not t2:
            db.add(Tenant(tenant_id=uuid.UUID("7f4a448b-f8f1-4c64-b53d-aae30278f582"), tenant_name="Finance-Dept-Tenant"))
            
        db.commit()
        print("RESEED_SUCCESS")
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_custom_tenants()

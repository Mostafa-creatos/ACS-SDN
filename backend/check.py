from app.database import SessionLocal
from app.models import Switch, Fabric, IpamSubnet, TenantVrf, Tenant
db = SessionLocal()
tenants = db.query(Tenant).all()
for t in tenants:
    print(t.tenant_name)
    switches = db.query(Switch).join(Fabric).join(IpamSubnet).join(TenantVrf).filter(TenantVrf.tenant_id == t.tenant_id).all()
    print("Switches:", len(switches))

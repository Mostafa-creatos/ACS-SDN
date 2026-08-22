from app.db import SessionLocal
from app.models import Switch, IpamSubnet, TenantVrf, Fabric

def sync_vrfs():
    db = SessionLocal()
    
    # 1. Fetch Fabric A & Fabric B
    fab_a = db.query(Fabric).filter(Fabric.fabric_name.ilike("%Fabric A%")).first()
    fab_b = db.query(Fabric).filter(Fabric.fabric_name.ilike("%Fabric B%")).first()
    
    if fab_a:
        # Assign Fabric A subnets
        db.query(IpamSubnet).filter(IpamSubnet.subnet_cidr.in_(["10.10.1.0/24", "10.10.2.0/24", "192.168.99.0/24"])).update(
            {IpamSubnet.fabric_id: fab_a.fabric_id}, synchronize_session=False
        )
    if fab_b:
        # Assign Fabric B subnets
        db.query(IpamSubnet).filter(IpamSubnet.subnet_cidr.in_(["172.16.10.0/24", "172.16.20.0/24"])).update(
            {IpamSubnet.fabric_id: fab_b.fabric_id}, synchronize_session=False
        )
    db.commit()

    # 2. Sync configured_vrfs to all Leaf switches based on fabric subnets
    switches = db.query(Switch).all()
    print(f"Syncing leaf VRFs for {len(switches)} switches...")
    
    for s in switches:
        if s.role and s.role.lower() == "leaf":
            subnets = db.query(IpamSubnet).filter(IpamSubnet.fabric_id == s.fabric_id).all()
            vrf_names = set()
            for sub in subnets:
                if sub.vrf_id:
                    vrf = db.query(TenantVrf).filter(TenantVrf.vrf_id == sub.vrf_id).first()
                    if vrf:
                        vrf_names.add(vrf.vrf_name)
            s.configured_vrfs = sorted(list(vrf_names))
            print(f"Leaf Switch {s.hostname} ({s.vendor}): assigned VRFs = {s.configured_vrfs}")
        elif s.role and s.role.lower() == "spine":
            s.configured_vrfs = []
            print(f"Spine Switch {s.hostname} ({s.vendor}): pure IP transit spine (no tenant VRFs)")
    
    db.commit()
    print("Leaf VRF sync completed.")
    db.close()

if __name__ == "__main__":
    sync_vrfs()

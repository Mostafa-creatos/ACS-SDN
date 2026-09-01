import uuid
from app.db import SessionLocal
from app.models import IpamSubnet, IpamIpAllocation

def seed_allocations():
    db = SessionLocal()
    subnets = db.query(IpamSubnet).all()
    print(f"Found {len(subnets)} subnets.")
    
    # Subnet allocation targets to demonstrate progress bar filling
    counts = [42, 125, 78, 185, 210]
    
    for s, count in zip(subnets, counts):
        base_prefix = s.subnet_cidr.rsplit(".", 1)[0]
        added = 0
        for i in range(count):
            host_ip = f"{base_prefix}.{i + 2}"
            existing = db.query(IpamIpAllocation).filter_by(
                subnet_id=s.subnet_id, 
                ip_address=host_ip
            ).first()
            if not existing:
                alloc = IpamIpAllocation(
                    allocation_id=uuid.uuid4(),
                    subnet_id=s.subnet_id,
                    ip_address=host_ip,
                    assignment_type="static_assigned",
                    bound_entity_id=f"Host-Device-{i + 1}"
                )
                db.add(alloc)
                added += 1
        db.commit()
        total_used = db.query(IpamIpAllocation).filter_by(subnet_id=s.subnet_id).count()
        pct = (total_used / 254.0) * 100
        print(f"Subnet {s.subnet_cidr}: added {added} IPs. Total allocated: {total_used}/254 ({pct:.1f}%)")

    db.close()

if __name__ == "__main__":
    seed_allocations()

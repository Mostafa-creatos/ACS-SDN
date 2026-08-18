import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.db import SessionLocal
from app import models

def sync_gateway_allocations():
    db = SessionLocal()
    try:
        subnets = db.query(models.IpamSubnet).all()
        print(f"Found {len(subnets)} subnets in database.")
        
        added_count = 0
        for s in subnets:
            if not s.anycast_gateway_ip:
                continue
            
            # Check if gateway IP already exists in ipam_ip_allocations
            existing = db.query(models.IpamIpAllocation).filter(
                models.IpamIpAllocation.subnet_id == s.subnet_id,
                models.IpamIpAllocation.ip_address == s.anycast_gateway_ip
            ).first()
            
            if not existing:
                alloc = models.IpamIpAllocation(
                    subnet_id=s.subnet_id,
                    ip_address=s.anycast_gateway_ip,
                    assignment_type="anycast_gateway",
                    bound_entity_id="gateway"
                )
                db.add(alloc)
                added_count += 1
                print(f"Added gateway allocation {s.anycast_gateway_ip} for subnet {s.subnet_cidr}")
        
        db.commit()
        print(f"Successfully synced {added_count} gateway IP allocations.")
    except Exception as e:
        db.rollback()
        print(f"Error syncing gateway allocations: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    sync_gateway_allocations()

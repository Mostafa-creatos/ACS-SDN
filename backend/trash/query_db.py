from app.db import SessionLocal
from app import models

db = SessionLocal()
try:
    switches = db.query(models.Switch).all()
    print(f"Total Switches in DB: {len(switches)}")
    for sw in switches:
        print(f"  {sw.hostname}:")
        print(f"    Vendor: {sw.vendor}")
        print(f"    Model: {sw.model}")
        print(f"    OS Version: {sw.os_version}")
        print(f"    Serial: {sw.serial_number}")
        print(f"    Uptime: {sw.uptime}")
        print(f"    Status: {sw.status}")
finally:
    db.close()

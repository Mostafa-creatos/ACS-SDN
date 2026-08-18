import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.db import SessionLocal
from app.models import Switch
from app.telemetry.gnmi_discovery import discover_dell_switch

db = SessionLocal()
try:
    sw = db.query(Switch).filter(Switch.hostname == "switch-12").first()
    if sw:
        print(f"Triggering dynamic discovery on {sw.hostname} ({sw.management_ip})...")
        discover_dell_switch(sw, db)
        print("Dynamic discovery finished successfully!")
    else:
        print("switch-12 not found in DB.")
finally:
    db.close()

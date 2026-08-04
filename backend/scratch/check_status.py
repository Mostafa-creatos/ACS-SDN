from app.db import SessionLocal
from app.models import Switch
db = SessionLocal()
for s in db.query(Switch).all():
    print(f"Switch: {s.hostname} -> {s.lifecycle_status}")

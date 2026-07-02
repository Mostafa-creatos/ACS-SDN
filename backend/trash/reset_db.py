from app.db import SessionLocal
from app import models

db = SessionLocal()
try:
    print("Clearing database tables...")
    db.query(models.TopologyNode).delete()
    db.query(models.TopologyEdge).delete()
    db.query(models.DeviceInterface).delete()
    db.query(models.Switch).delete()
    db.query(models.Fabric).delete()
    db.query(models.FabricBlueprint).delete()
    db.query(models.Tenant).delete()
    db.query(models.User).delete()
    db.commit()
    print("Database tables cleared successfully.")
except Exception as e:
    db.rollback()
    print("Error resetting database:", e)
finally:
    db.close()

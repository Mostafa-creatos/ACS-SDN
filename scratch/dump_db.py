import sys
sys.path.append("/workspace")
from app.db import SessionLocal
from app import models

db = SessionLocal()
switches = db.query(models.Switch).all()
print("Switches in DB:")
for sw in switches:
    print(f"ID: {sw.switch_id} Host: {sw.hostname} IP: {sw.management_ip} Vendor: {sw.vendor} Role: {sw.role} Status: {sw.status}")

endpoints = db.query(models.DiscoveredEndpoint).all()
print("\nDiscovered Endpoints in DB:")
for ep in endpoints:
    print(f"MAC: {ep.mac_address} IP: {ep.ip_address} Port: {ep.port} Switch: {ep.switch_id} VLAN: {ep.vlan_id}")

users = db.query(models.User).all()
print("\nUsers in DB:")
for u in users:
    print(f"Username: {u.username} Role: {u.role} Tenant: {u.tenant_id}")

db.close()

"""
Standalone database seeding script for the SDN Controller.

Usage:
    python -m scripts.seed_database

Environment variables:
    SEED_ON_STARTUP=true  — auto-seed on app startup (set in docker-compose)
    SEED_ADMIN_PASSWORD   — override auto-generated admin password
    SEED_OPERATOR_PASSWORD — override auto-generated operator password
    SEED_AUDITOR_PASSWORD  — override auto-generated auditor password
"""
import os
import sys
import uuid
import secrets
import bcrypt
from datetime import datetime, timezone

# Allow running as standalone script
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.db import SessionLocal
from app import models


def seed_all():
    """Seed the database with default developer records if empty."""
    db = SessionLocal()
    try:
        # 1. Seed tenant and fabric if empty
        if db.query(models.Tenant).count() == 0:
            print("[SDN SEED] Seeding default tenant and fabric...")
            tenant = models.Tenant(
                tenant_id=uuid.UUID("11111111-1111-1111-1111-11111111111a"),
                tenant_name="Acme-Enterprise"
            )
            db.add(tenant)
            db.flush()

            fabric = models.Fabric(
                fabric_id=uuid.UUID("33333333-3333-3333-3333-33333333333c"),
                fabric_name="DataCenter-East",
                global_bgp_asn=65000
            )
            db.add(fabric)
            db.commit()
            print("[SDN SEED] Default tenant and fabric seeding completed.")

        # 2. Seed detailed multi-vendor switches if missing
        if db.query(models.Switch).filter(models.Switch.hostname == "spine-01").count() == 0:
            print("[SDN SEED] Seeding detailed multi-vendor inventory switches...")
            fabric = db.query(models.Fabric).filter(models.Fabric.fabric_name == "DataCenter-East").first()
            fabric_id = fabric.fabric_id if fabric else uuid.UUID("33333333-3333-3333-3333-33333333333c")

            switches = [
                models.Switch(
                    switch_id=uuid.uuid4(), fabric_id=fabric_id, hostname="spine-01",
                    management_ip="172.20.20.10", vendor="dell_os10", role="spine",
                    local_bgp_asn=65000, loopback_0_ip="10.200.1.10", vtep_ip="10.250.1.10",
                    lifecycle_status="compliant_active", model="S5248F-ON", os_version="10.5.2.0",
                    location="Casablanca, Morocco", serial_number="SN-DELL-SPINE1",
                    service_tag="6KH8XZ2", part_number="S5248F-ON",
                    ppid="TW-0GKK8W-28298-713-0026", express_service_code="909 144 413 2",
                    management_mac="90:B1:1C:F4:A5:8C", os10_license_status="Licensed",
                    temperature="Normal", device_type="Router", os_type="OS10",
                    client_tenant="Acme-Enterprise", ports_up=8, ports_all=48, chassis_status="Ready"
                ),
                models.Switch(
                    switch_id=uuid.uuid4(), fabric_id=fabric_id, hostname="spine-02",
                    management_ip="172.20.20.13", vendor="dell_os10", role="spine",
                    local_bgp_asn=65000, loopback_0_ip="10.200.1.13", vtep_ip="10.250.1.13",
                    lifecycle_status="compliant_active", model="S5248F-ON", os_version="10.5.2.0",
                    location="Casablanca, Morocco", serial_number="SN-DELL-SPINE2",
                    service_tag="7PI8Z3K", part_number="S5248F-ON",
                    ppid="TW-0GKK8W-28298-713-0027", express_service_code="909 144 413 3",
                    management_mac="90:B1:1C:F4:A5:8D", os10_license_status="Licensed",
                    temperature="Normal", device_type="Router", os_type="OS10",
                    client_tenant="Acme-Enterprise", ports_up=8, ports_all=48, chassis_status="Ready"
                ),
                models.Switch(
                    switch_id=uuid.uuid4(), fabric_id=fabric_id, hostname="leaf-01",
                    management_ip="172.20.20.11", vendor="nokia", role="leaf",
                    local_bgp_asn=65001, loopback_0_ip="10.200.1.11", vtep_ip="10.250.1.11",
                    lifecycle_status="compliant_active", model="7220 IXR-D2", os_version="23.10.1",
                    location="Casablanca, Morocco", serial_number="SN-NOKIA-LEAF1",
                    device_type="Switch", os_type="SR-Linux", client_tenant="Acme-Enterprise",
                    ports_up=16, ports_all=32, chassis_status="Ready"
                ),
                models.Switch(
                    switch_id=uuid.uuid4(), fabric_id=fabric_id, hostname="leaf-02",
                    management_ip="172.20.20.12", vendor="nokia", role="leaf",
                    local_bgp_asn=65002, loopback_0_ip="10.200.1.12", vtep_ip="10.250.1.12",
                    lifecycle_status="compliant_active", model="7220 IXR-D2", os_version="23.10.1",
                    location="Rabat, Morocco", serial_number="SN-NOKIA-LEAF2",
                    device_type="Switch", os_type="SR-Linux", client_tenant="Acme-Enterprise",
                    ports_up=16, ports_all=32, chassis_status="Ready"
                ),
                models.Switch(
                    switch_id=uuid.uuid4(), fabric_id=fabric_id, hostname="leaf-03",
                    management_ip="172.20.20.14", vendor="nokia", role="leaf",
                    local_bgp_asn=65003, loopback_0_ip="10.200.1.14", vtep_ip="10.250.1.14",
                    lifecycle_status="compliant_active", model="7220 IXR-D2", os_version="23.10.1",
                    location="Casablanca, Morocco", serial_number="SN-NOKIA-LEAF3",
                    device_type="Switch", os_type="SR-Linux", client_tenant="Acme-Enterprise",
                    ports_up=16, ports_all=32, chassis_status="Ready"
                ),
                models.Switch(
                    switch_id=uuid.uuid4(), fabric_id=fabric_id, hostname="leaf-04",
                    management_ip="172.20.20.15", vendor="nokia", role="leaf",
                    local_bgp_asn=65004, loopback_0_ip="10.200.1.15", vtep_ip="10.250.1.15",
                    lifecycle_status="compliant_active", model="7220 IXR-D2", os_version="23.10.1",
                    location="Agadir, Morocco", serial_number="SN-NOKIA-LEAF4",
                    device_type="Switch", os_type="SR-Linux", client_tenant="Acme-Enterprise",
                    ports_up=16, ports_all=32, chassis_status="Ready"
                ),
                models.Switch(
                    switch_id=uuid.uuid4(), fabric_id=fabric_id, hostname="leaf-05",
                    management_ip="172.20.20.16", vendor="nokia", role="leaf",
                    local_bgp_asn=65005, loopback_0_ip="10.200.1.16", vtep_ip="10.250.1.16",
                    lifecycle_status="compliant_active", model="7220 IXR-D2", os_version="23.10.1",
                    location="Rabat, Morocco", serial_number="SN-NOKIA-LEAF5",
                    device_type="Switch", os_type="SR-Linux", client_tenant="Acme-Enterprise",
                    ports_up=16, ports_all=32, chassis_status="Ready"
                ),
                models.Switch(
                    switch_id=uuid.uuid4(), fabric_id=fabric_id, hostname="leaf-06",
                    management_ip="172.20.20.17", vendor="nokia", role="leaf",
                    local_bgp_asn=65006, loopback_0_ip="10.200.1.17", vtep_ip="10.250.1.17",
                    lifecycle_status="compliant_active", model="7220 IXR-D2", os_version="23.10.1",
                    location="Tangier, Morocco", serial_number="SN-NOKIA-LEAF6",
                    device_type="Switch", os_type="SR-Linux", client_tenant="Acme-Enterprise",
                    ports_up=16, ports_all=32, chassis_status="Ready"
                ),
            ]
            for sw in switches:
                db.add(sw)
            db.commit()
            print("[SDN SEED] Seeding completed. Tenant ID: 11111111-1111-1111-1111-11111111111a available.")

        # 3. Seed default users if empty
        if db.query(models.User).count() == 0:
            print("[SDN SEED] Seeding default users (admin, operator, auditor)...")
            admin_pwd_str = os.getenv("SEED_ADMIN_PASSWORD", secrets.token_urlsafe(24))
            operator_pwd_str = os.getenv("SEED_OPERATOR_PASSWORD", secrets.token_urlsafe(24))
            auditor_pwd_str = os.getenv("SEED_AUDITOR_PASSWORD", secrets.token_urlsafe(24))
            admin_pwd = bcrypt.hashpw(admin_pwd_str.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            operator_pwd = bcrypt.hashpw(operator_pwd_str.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            auditor_pwd = bcrypt.hashpw(auditor_pwd_str.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

            acme_tenant = db.query(models.Tenant).filter(models.Tenant.tenant_name == "Acme-Enterprise").first()
            acme_tenant_id = acme_tenant.tenant_id if acme_tenant else uuid.UUID("11111111-1111-1111-1111-11111111111a")

            admin_user = models.User(username="admin", hashed_password=admin_pwd, role="Platform Admin", tenant_id=None)
            operator_user = models.User(username="operator", hashed_password=operator_pwd, role="Tenant Operator", tenant_id=acme_tenant_id)
            auditor_user = models.User(username="auditor", hashed_password=auditor_pwd, role="Tenant Auditor", tenant_id=acme_tenant_id)
            db.add(admin_user)
            db.add(operator_user)
            db.add(auditor_user)
            db.commit()
            print("[SDN SEED] Users seeding completed.")
            print(f"[SDN SEED] Generated admin password: {admin_pwd_str}")
            print(f"[SDN SEED] Generated operator password: {operator_pwd_str}")
            print(f"[SDN SEED] Generated auditor password: {auditor_pwd_str}")
    except Exception as e:
        db.rollback()
        print(f"[SDN SEED] Failed to seed database: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_all()

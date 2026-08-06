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

def clean_and_seed():
    db = SessionLocal()
    try:
        print("[SDN SEED] Cleaning database tables...")
        # Delete existing data in reverse order of foreign keys
        db.query(models.ComplianceFinding).delete()
        db.query(models.ComplianceRule).delete()
        db.query(models.ConfigSnapshot).delete()
        db.query(models.ProvisioningJob).delete()
        db.query(models.IpamSubnet).delete()
        db.query(models.Switch).delete()
        db.query(models.ZtpDiscoveryPool).delete()
        db.query(models.TenantVrf).delete()
        db.query(models.UserTenantMembership).delete()
        db.query(models.User).delete()
        db.query(models.Tenant).delete()
        db.query(models.Fabric).delete()
        db.commit()
        print("[SDN SEED] Clean up completed.")

        print("[SDN SEED] Seeding tenant, VRFs, and fabrics...")
        tenant = models.Tenant(
            tenant_id=uuid.UUID("11111111-1111-1111-1111-11111111111a"),
            tenant_name="Acme-Enterprise"
        )
        db.add(tenant)
        db.flush()

        vrf1 = models.TenantVrf(
            vrf_id=uuid.UUID("22222222-2222-2222-2222-22222222222b"),
            tenant_id=tenant.tenant_id,
            vrf_name="VRF-Acme",
            layer3_vni=5000
        )
        vrf2 = models.TenantVrf(
            vrf_id=uuid.UUID("22222222-2222-2222-2222-22222222222c"),
            tenant_id=tenant.tenant_id,
            vrf_name="vrf-test-policy",
            layer3_vni=5001
        )
        db.add(vrf1)
        db.add(vrf2)

        fabric1 = models.Fabric(
            fabric_id=uuid.UUID("33333333-3333-3333-3333-33333333333a"),
            fabric_name="Fabric-NokiaSpine",
            global_bgp_asn=65000
        )
        fabric2 = models.Fabric(
            fabric_id=uuid.UUID("33333333-3333-3333-3333-33333333333b"),
            fabric_name="Fabric-DellSpine",
            global_bgp_asn=65100
        )
        db.add(fabric1)
        db.add(fabric2)
        db.flush()

        print("[SDN SEED] Seeding switches in discovered_raw state...")
        switches = [
            # Fabric 1 (Nokia Spine + Nokia Leaf + Dell Leaf)
            models.Switch(
                switch_id=uuid.uuid4(), fabric_id=fabric1.fabric_id, hostname="spine-01",
                management_ip="172.20.20.10", vendor="nokia", role="spine",
                local_bgp_asn=65000, loopback_0_ip="10.200.1.10", vtep_ip="10.250.1.10",
                lifecycle_status="discovered_raw", model="7220 IXR-D2", os_version="23.10.1",
                location="Casablanca, Morocco", serial_number="SN-NOKIA-SPINE1",
                device_type="Switch", os_type="SR-Linux", client_tenant="Acme-Enterprise",
                ports_up=0, ports_all=32, chassis_status="Ready"
            ),
            models.Switch(
                switch_id=uuid.uuid4(), fabric_id=fabric1.fabric_id, hostname="leaf-01",
                management_ip="172.20.20.11", vendor="nokia", role="leaf",
                local_bgp_asn=65001, loopback_0_ip="10.200.1.11", vtep_ip="10.250.1.11",
                lifecycle_status="discovered_raw", model="7220 IXR-D2", os_version="23.10.1",
                location="Casablanca, Morocco", serial_number="SN-NOKIA-LEAF1",
                device_type="Switch", os_type="SR-Linux", client_tenant="Acme-Enterprise",
                ports_up=0, ports_all=32, chassis_status="Ready"
            ),
            models.Switch(
                switch_id=uuid.uuid4(), fabric_id=fabric1.fabric_id, hostname="leaf-02",
                management_ip="172.20.20.12", vendor="dell_os10", role="leaf",
                local_bgp_asn=65002, loopback_0_ip="10.200.1.12", vtep_ip="10.250.1.12",
                lifecycle_status="discovered_raw", model="S5248F-ON", os_version="10.5.2.0",
                location="Casablanca, Morocco", serial_number="SN-DELL-LEAF2",
                service_tag="LEAF2ST", part_number="S5248F-ON",
                management_mac="90:B1:1C:F4:A5:02", os10_license_status="Licensed",
                temperature="Normal", device_type="Router", os_type="OS10",
                client_tenant="Acme-Enterprise", ports_up=0, ports_all=48, chassis_status="Ready"
            ),
            # Fabric 2 (Dell Spine + Nokia Leafs)
            models.Switch(
                switch_id=uuid.uuid4(), fabric_id=fabric2.fabric_id, hostname="spine-02",
                management_ip="172.20.20.13", vendor="dell_os10", role="spine",
                local_bgp_asn=65100, loopback_0_ip="10.200.1.13", vtep_ip="10.250.1.13",
                lifecycle_status="discovered_raw", model="S5248F-ON", os_version="10.5.2.0",
                location="Casablanca, Morocco", serial_number="SN-DELL-SPINE2",
                service_tag="SPINE2ST", part_number="S5248F-ON",
                management_mac="90:B1:1C:F4:A5:03", os10_license_status="Licensed",
                temperature="Normal", device_type="Router", os_type="OS10",
                client_tenant="Acme-Enterprise", ports_up=0, ports_all=48, chassis_status="Ready"
            ),
            models.Switch(
                switch_id=uuid.uuid4(), fabric_id=fabric2.fabric_id, hostname="leaf-03",
                management_ip="172.20.20.14", vendor="nokia", role="leaf",
                local_bgp_asn=65101, loopback_0_ip="10.200.1.14", vtep_ip="10.250.1.14",
                lifecycle_status="discovered_raw", model="7220 IXR-D2", os_version="23.10.1",
                location="Casablanca, Morocco", serial_number="SN-NOKIA-LEAF3",
                device_type="Switch", os_type="SR-Linux", client_tenant="Acme-Enterprise",
                ports_up=0, ports_all=32, chassis_status="Ready"
            ),
            models.Switch(
                switch_id=uuid.uuid4(), fabric_id=fabric2.fabric_id, hostname="leaf-04",
                management_ip="172.20.20.15", vendor="nokia", role="leaf",
                local_bgp_asn=65102, loopback_0_ip="10.200.1.15", vtep_ip="10.250.1.15",
                lifecycle_status="discovered_raw", model="7220 IXR-D2", os_version="23.10.1",
                location="Agadir, Morocco", serial_number="SN-NOKIA-LEAF4",
                device_type="Switch", os_type="SR-Linux", client_tenant="Acme-Enterprise",
                ports_up=0, ports_all=32, chassis_status="Ready"
            ),
        ]
        for sw in switches:
            db.add(sw)
        db.commit()

        print("[SDN SEED] Seeding users...")
        admin_pwd = bcrypt.hashpw(b"admin_password_123!", bcrypt.gensalt()).decode("utf-8")
        operator_pwd = bcrypt.hashpw(b"operator_password_123!", bcrypt.gensalt()).decode("utf-8")
        auditor_pwd = bcrypt.hashpw(b"auditor_password_123!", bcrypt.gensalt()).decode("utf-8")

        admin_user = models.User(username="admin", hashed_password=admin_pwd, role="Platform Admin", tenant_id=None)
        operator_user = models.User(username="operator", hashed_password=operator_pwd, role="Tenant Operator", tenant_id=tenant.tenant_id)
        auditor_user = models.User(username="auditor", hashed_password=auditor_pwd, role="Tenant Auditor", tenant_id=tenant.tenant_id)
        db.add(admin_user)
        db.add(operator_user)
        db.add(auditor_user)
        db.flush()

        membership_operator = models.UserTenantMembership(
            user_id=operator_user.user_id,
            tenant_id=tenant.tenant_id,
            role="operator"
        )
        membership_auditor = models.UserTenantMembership(
            user_id=auditor_user.user_id,
            tenant_id=tenant.tenant_id,
            role="readonly"
        )
        db.add(membership_operator)
        db.add(membership_auditor)
        db.commit()

        print("[SDN SEED] Seeding compliance rules...")
        rules = [
            models.ComplianceRule(
                name="NTP Server Configuration", category="Security", severity="critical", match_type="contains",
                template_pattern="ntp server {fabric.expected_ntp_servers}", remediation_guide="Configure an NTP server pointing to the fabric NTP peer.", is_active=True
            ),
            models.ComplianceRule(
                name="DNS Name Servers", category="Security", severity="critical", match_type="contains",
                template_pattern="ip name-server {fabric.expected_dns_servers}", remediation_guide="Add the fabric DNS resolver under ip name-server.", is_active=True
            ),
            models.ComplianceRule(
                name="AAA Local Authentication", category="Security", severity="critical", match_type="contains",
                template_pattern="aaa authentication login default local", remediation_guide="Enable AAA local login authentication on the device.", is_active=True
            ),
            models.ComplianceRule(
                name="Syslog Logging Server", category="Observability", severity="warning", match_type="contains",
                template_pattern="logging host {fabric.expected_syslog_server}", remediation_guide="Point centralized logging at the fabric syslog collector.", is_active=True
            ),
            models.ComplianceRule(
                name="LLDP Global Enable", category="Observability", severity="warning", match_type="contains",
                template_pattern="lldp enable", remediation_guide="Enable LLDP globally on the switch.", is_active=True
            ),
            models.ComplianceRule(
                name="Hostname Match", category="Routing", severity="warning", match_type="contains",
                template_pattern="hostname {switch.hostname}", remediation_guide="Ensure the running hostname matches the controller inventory.", is_active=True
            ),
        ]
        db.add_all(rules)
        db.commit()
        print("[SDN SEED] Database seeding completed successfully.")
    except Exception as e:
        db.rollback()
        print(f"[SDN SEED] Failed to clean and seed database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clean_and_seed()

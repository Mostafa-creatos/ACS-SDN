# file:///c:/Users/mosta/OneDrive/Desktop/Antigravity/SDN-Front-End/backend/app/scripts/clean_and_seed_new_fabrics.py
import os
import sys
import uuid
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

        print("[SDN SEED] Seeding users...")
        admin_pwd = bcrypt.hashpw(b"admin_password_123!", bcrypt.gensalt()).decode("utf-8")
        admin_user = models.User(
            username="admin", 
            hashed_password=admin_pwd, 
            role="Platform Admin", 
            tenant_id=None
        )
        db.add(admin_user)
        db.commit()
        print(f"[SDN SEED] Created Platform Admin user: admin")

        print("[SDN SEED] Seeding global compliance rule templates (13 Dell OS10 Golden Rules)...")
        rules = [
            models.ComplianceRule(
                name="NTP Server Configuration", category="Security", severity="critical", match_type="contains",
                template_pattern="ntp server {fabric.expected_ntp_servers}", remediation_guide="Configure an NTP server pointing to the fabric NTP peer.", is_active=True
            ),
            models.ComplianceRule(
                name="TACACS Server Configuration", category="Security", severity="critical", match_type="regex",
                template_pattern=r"tacacs-server host 10\\.10\\.10\\.10", remediation_guide="Configure primary TACACS+ server for AAA.", is_active=True
            ),
            models.ComplianceRule(
                name="AAA Authentication", category="Security", severity="critical", match_type="contains",
                template_pattern="aaa authentication login default group tacacs+ local", remediation_guide="Enable AAA authentication with TACACS+ fallback to local.", is_active=True
            ),
            models.ComplianceRule(
                name="SSH Server Enable", category="Security", severity="critical", match_type="contains",
                template_pattern="ip ssh server enable", remediation_guide="Enable SSH server for secure management access.", is_active=True
            ),
            models.ComplianceRule(
                name="Telnet Server Disabled", category="Security", severity="critical", match_type="regex",
                template_pattern=r"no ip telnet server", remediation_guide="Disable insecure Telnet management server.", is_active=True
            ),
            models.ComplianceRule(
                name="Syslog Logging Server", category="Observability", severity="warning", match_type="regex",
                template_pattern=r"logging server {fabric.expected_syslog_server}", remediation_guide="Point centralized logging at the fabric syslog collector.", is_active=True
            ),
            models.ComplianceRule(
                name="Hostname Match", category="System", severity="warning", match_type="contains",
                template_pattern="hostname {switch.hostname}", remediation_guide="Ensure the running hostname matches controller inventory.", is_active=True
            ),
            models.ComplianceRule(
                name="Management VRF", category="System", severity="warning", match_type="contains",
                template_pattern="ip vrf management", remediation_guide="Configure dedicated management VRF.", is_active=True
            ),
            models.ComplianceRule(
                name="Spanning-Tree BPDU Guard", category="Layer-2", severity="warning", match_type="contains",
                template_pattern="spanning-tree bpduguard disable-timeout 300", remediation_guide="Configure BPDU Guard disable timeout for edge ports.", is_active=True
            ),
            models.ComplianceRule(
                name="Errdisable BPDU Guard Recovery", category="Layer-2", severity="warning", match_type="contains",
                template_pattern="errdisable recovery cause bpduguard", remediation_guide="Enable errdisable recovery for BPDU Guard violations.", is_active=True
            ),
            models.ComplianceRule(
                name="SNMPv3 Group", category="Observability", severity="warning", match_type="contains",
                template_pattern="snmp-server group READ_ONLY v3 auth read RESTRICTED_VIEW", remediation_guide="Configure SNMPv3 read-only group with restricted view.", is_active=True
            ),
            models.ComplianceRule(
                name="Management ACL", category="Security", severity="critical", match_type="contains",
                template_pattern="ip access-list MGMT-ACL", remediation_guide="Configure management access control list.", is_active=True
            ),
            models.ComplianceRule(
                name="Control Plane Policing", category="Security", severity="warning", match_type="contains",
                template_pattern="policy-map type control-plane COPP_POLICY", remediation_guide="Apply control plane policing policy.", is_active=True
            ),
        ]
        db.add_all(rules)
        db.commit()
        print("[SDN SEED] Database seeding completed successfully (Platform Admin + Compliance templates).")
    except Exception as e:
        db.rollback()
        print(f"[SDN SEED] Failed to clean and seed database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clean_and_seed()

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

        print("[SDN SEED] Seeding global compliance rule templates...")
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
        print("[SDN SEED] Database seeding completed successfully (Platform Admin + Compliance templates).")
    except Exception as e:
        db.rollback()
        print(f"[SDN SEED] Failed to clean and seed database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clean_and_seed()

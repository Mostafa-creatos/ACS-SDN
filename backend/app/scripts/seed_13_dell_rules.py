import sys
import os
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.db import SessionLocal
from app import models

def seed_dell_rules():
    db = SessionLocal()
    try:
        # Clear existing rules
        db.query(models.ComplianceRule).delete()
        db.commit()

        dell_rules = [
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="NTP Server Configuration", category="Security", severity="critical", match_type="contains",
                template_pattern="ntp server {fabric.expected_ntp_servers}", remediation_guide="Configure an NTP server pointing to the fabric NTP peer.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="TACACS Server Configuration", category="Security", severity="critical", match_type="regex",
                template_pattern=r"tacacs-server host 10\.10\.10\.10", remediation_guide="Configure primary TACACS+ server for AAA.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="AAA Authentication", category="Security", severity="critical", match_type="contains",
                template_pattern="aaa authentication login default group tacacs+ local", remediation_guide="Enable AAA authentication with TACACS+ fallback to local.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="SSH Server Enable", category="Security", severity="critical", match_type="regex",
                template_pattern=r"SSH Server:\s+Enabled", remediation_guide="Enable SSH server for secure management access.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="Syslog Logging Server", category="Observability", severity="warning", match_type="regex",
                template_pattern=r"logging server {fabric.expected_syslog_server}", remediation_guide="Point centralized logging at the fabric syslog collector.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="Hostname Match", category="System", severity="warning", match_type="contains",
                template_pattern="hostname {switch.hostname}", remediation_guide="Ensure the running hostname matches controller inventory.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="Management VRF", category="System", severity="warning", match_type="contains",
                template_pattern="ip vrf management", remediation_guide="Configure dedicated management VRF.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="Errdisable BPDU Guard Recovery", category="Layer-2", severity="warning", match_type="contains",
                template_pattern="errdisable recovery cause bpduguard", remediation_guide="Enable errdisable recovery for BPDU Guard violations.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="SNMPv3 Group", category="Observability", severity="warning", match_type="contains",
                template_pattern="snmp-server group READ_ONLY 3 auth read RESTRICTED_VIEW", remediation_guide="Configure SNMPv3 read-only group with restricted view.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="Management ACL", category="Security", severity="critical", match_type="contains",
                template_pattern="ip access-list MGMT-ACL", remediation_guide="Configure management access control list.", is_active=True
            ),
        ]

        db.add_all(dell_rules)
        db.commit()
        print(f"[COMPLIANCE SEED] Successfully seeded {len(dell_rules)} Dell OS10 Golden Compliance Rules!")
    except Exception as e:
        db.rollback()
        print(f"[COMPLIANCE SEED ERROR] {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_dell_rules()

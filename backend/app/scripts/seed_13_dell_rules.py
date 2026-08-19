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
                name="DNS Name Servers", category="Security", severity="critical", match_type="contains",
                template_pattern="ip name-server {fabric.expected_dns_servers}", remediation_guide="Add the fabric DNS resolver under ip name-server.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="AAA Local Authentication", category="Security", severity="critical", match_type="contains",
                template_pattern="aaa authentication login default local", remediation_guide="Enable AAA local login authentication on the device.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="SSH Server Enable", category="Security", severity="critical", match_type="contains",
                template_pattern="ip ssh server enable", remediation_guide="Enable SSH server for secure management access.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="Syslog Logging Server", category="Observability", severity="warning", match_type="contains",
                template_pattern="logging host {fabric.expected_syslog_server}", remediation_guide="Point centralized logging at the fabric syslog collector.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="LLDP Global Enable", category="Observability", severity="warning", match_type="contains",
                template_pattern="lldp enable", remediation_guide="Enable LLDP globally on the switch.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="Hostname Match", category="System", severity="warning", match_type="contains",
                template_pattern="hostname {switch.hostname}", remediation_guide="Ensure the running hostname matches controller inventory.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="Spanning-Tree RSTP Mode", category="Layer-2", severity="critical", match_type="contains",
                template_pattern="spanning-tree mode rstp", remediation_guide="Configure Rapid Spanning Tree Protocol (RSTP) mode.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="Spanning-Tree BPDU Guard", category="Layer-2", severity="warning", match_type="contains",
                template_pattern="spanning-tree disable-map", remediation_guide="Configure BPDU Guard to protect edge access ports.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="VLT Domain 1 Configured", category="Redundancy", severity="critical", match_type="contains",
                template_pattern="vlt-domain 1", remediation_guide="Configure Virtual Link Trunking (VLT) Domain 1.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="BGP Local ASN Match", category="Routing", severity="critical", match_type="contains",
                template_pattern="router bgp {switch.local_bgp_asn}", remediation_guide="Ensure BGP router process uses assigned local ASN.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="BGP Router ID", category="Routing", severity="warning", match_type="contains",
                template_pattern="bgp router-id {switch.loopback_0_ip}", remediation_guide="Set BGP router ID to loopback 0 IP address.", is_active=True
            ),
            models.ComplianceRule(
                rule_id=uuid.uuid4(),
                name="Default Management Route", category="Routing", severity="warning", match_type="contains",
                template_pattern="ip route 0.0.0.0/0", remediation_guide="Ensure a default static route is configured for out-of-band management.", is_active=True
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

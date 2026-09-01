import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.db import SessionLocal
from app import models
from app.workers.config_lifecycle import _fetch_switch_running_config
import re

db = SessionLocal()
sw = db.query(models.Switch).filter(models.Switch.management_ip == "172.20.20.12").first()
rules = db.query(models.ComplianceRule).filter(models.ComplianceRule.is_active == True).all()

print(f"Auditing {sw.hostname} ({sw.management_ip}) against {len(rules)} active rules...")
cfg = _fetch_switch_running_config(sw)
print(f"Collected running config length: {len(cfg)} bytes")

context = {
    "switch.hostname": sw.hostname,
    "switch.management_ip": sw.management_ip,
    "switch.local_bgp_asn": str(sw.local_bgp_asn),
    "switch.loopback_0_ip": sw.loopback_0_ip or ""
}

passed = 0
failed = 0
for r in rules:
    expected_str = r.template_pattern
    for key, val in context.items():
        expected_str = expected_str.replace("{" + key + "}", val)
        
    is_compliant = False
    if r.match_type == "contains":
        is_compliant = expected_str.lower() in cfg.lower()
    elif r.match_type == "regex":
        is_compliant = bool(re.search(expected_str, cfg, re.IGNORECASE))
        
    if is_compliant:
        passed += 1
        print(f"[PASS] {r.name:<32} | Expected: {expected_str}")
    else:
        failed += 1
        print(f"[FAIL] {r.name:<32} | Expected: {expected_str}")

print(f"\nSummary for {sw.hostname}: {passed} PASSED, {failed} FAILED.")
db.close()

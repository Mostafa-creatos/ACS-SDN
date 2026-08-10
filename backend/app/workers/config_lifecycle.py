import uuid
import hashlib
import json
import datetime
import asyncio
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.orm import Session
from .. import models

from celery import shared_task
import difflib

def generate_golden_config(switch: models.Switch) -> str:
    """
    Helper to generate simulated config containing required golden configuration blocks.
    """
    if switch.vendor == "nokia":
        return (
            "/ system ntp network-instance mgmt\n"
            "/ system ntp admin-state enable\n"
            "/ system ntp server 192.168.100.1\n"
            "/ delete system dns-instance clab-default\n"
            "/ delete system dns-instance default\n"
            "/ delete system dns-instance mgmt\n"
            "/ system dns-instance mgmt network-instance mgmt\n"
            "/ system dns-instance mgmt server-list [ 8.8.8.8 ]\n"
            "/ system logging remote-server 10.10.100.5 remote-port 514\n"
            "/ system lldp admin-state enable\n"
            f"/ system name host-name {switch.hostname}\n"
        )
    elif switch.vendor == "dell_os10":
        return (
            "ntp server 192.168.100.1\n"
            "ip name-server 8.8.8.8\n"
            "aaa authentication login default local\n"
            "logging server 10.10.100.5\n"
            "lldp enable\n"
            "spanning-tree mode mst\n"
            f"hostname {switch.hostname}\n"
        )
    else:
        return (
            "ntp server 192.168.100.1\n"
            "ip name-server 8.8.8.8\n"
            "logging server 10.10.100.5\n"
            "lldp enable\n"
            f"hostname {switch.hostname}\n"
        )

def _flatten_srlinux_info(config_text: str) -> str:
    """Flatten SR Linux `info` CLI output into one full statement path per line.

    e.g. nested `server-list [ 8.8.8.8 ]` becomes `... server-list 8.8.8.8`.
    """
    lines_out = []
    stack = []
    for raw in config_text.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith(("!", "#", "--", "*")):
            continue
        indent = len(line) - len(line.lstrip())
        depth = indent // 4
        while stack and stack[-1][1] >= depth:
            stack.pop()
        if stripped in ("}", "]"):
            continue
        if stripped.endswith("[") or stripped.endswith("{"):
            name = stripped[:-1].strip()
            if len(name.split()) > 1:
                path = " ".join(s[0] for s in stack)
                lines_out.append(f"{path} {name}".strip() if path else name)
            stack.append((name, depth))
            continue
        path = " ".join(s[0] for s in stack)
        lines_out.append(f"{path} {stripped}".strip() if path else stripped)
    return "\n".join(lines_out)

def _adapt_nokia_expected_pattern(expected_str: str) -> str:
    """Translate Dell-CLI style compliance patterns into SR Linux equivalents."""
    adapted = expected_str
    if adapted.strip() == "aaa authentication login default local":
        adapted = "aaa"
    replacements = [
        ("logging server ", "logging remote-server "),
        ("ip name-server ", "server-list "),
        ("name-server ", "server-list "),
        ("lldp enable", "lldp admin-state enable"),
        ("hostname ", "host-name "),
    ]
    for old, new in replacements:
        adapted = adapted.replace(old, new)
    return adapted

def build_remediation_config(switch: models.Switch, rule_name: str, context: dict) -> str:
    """Generate a targeted config block for the given violated compliance rule.

    Only the missing block is emitted (smaller blast radius than re-pushing the
    full golden config). Falls back to the full golden config for unknown rules.
    """
    name = (rule_name or "").lower()

    if switch.vendor in ("nokia", "nokia_srlinux", "timetra"):
        if "hostname" in name or "host-name" in name or "identity" in name:
            return f"/ system name host-name {context.get('switch.hostname', switch.hostname)}\n"
        if "ntp" in name:
            return (
                "/ system ntp network-instance mgmt\n"
                "/ system ntp admin-state enable\n"
                f"/ system ntp server {context.get('fabric.expected_ntp_servers', '192.168.100.1')}\n"
            )
        if "dns" in name:
            return (
                "/ delete system dns-instance clab-default\n"
                "/ delete system dns-instance default\n"
                "/ delete system dns-instance mgmt\n"
                "/ system dns-instance mgmt network-instance mgmt\n"
                f"/ system dns-instance mgmt server-list [ {context.get('fabric.expected_dns_servers', '8.8.8.8')} ]\n"
            )
        if "syslog" in name or "logging" in name:
            return f"/ system logging remote-server {context.get('fabric.expected_syslog_server', '10.10.100.5')} remote-port 514\n"
        if "lldp" in name:
            return "/ system lldp admin-state enable\n"
        if "aaa" in name:
            return "/ system aaa authentication method local\n"
    else:
        if "hostname" in name or "host-name" in name or "identity" in name:
            return f"hostname {context.get('switch.hostname', switch.hostname)}\n"
        if "ntp" in name:
            return f"ntp server {context.get('fabric.expected_ntp_servers', '192.168.100.1')}\n"
        if "dns" in name:
            return f"ip name-server {context.get('fabric.expected_dns_servers', '8.8.8.8')}\n"
        if "syslog" in name or "logging" in name:
            return f"logging server {context.get('fabric.expected_syslog_server', '10.10.100.5')}\n"
        if "lldp" in name:
            return "lldp enable\n"
        if "aaa" in name:
            return "aaa authentication login default local\n"
        if "spanning" in name or "mst" in name:
            return "spanning-tree mode mst\n"

    return generate_golden_config(switch)

def _strip_control_nuls(text: str) -> str:
    """PostgreSQL text columns reject NUL (0x00) bytes; raw device output
    (notably Dell console streams) can contain them."""
    return text.replace("\x00", "")

def _fetch_switch_running_config(switch: models.Switch) -> str:
    """Fetch a switch's live running config from the device.

    Pure network I/O with no DB access, so it is safe to run concurrently from
    worker threads. Raises on transport failure so callers can mark the switch
    as unreachable instead of treating error text as configuration.
    """
    if switch.vendor == "dell_os10" or switch.vendor == "dell":
        from app.drivers.dell_os10 import connect_os10_collector
        collector, _transport = connect_os10_collector(switch.management_ip, "admin", "admin")
        try:
            return collector.collect_running_config()
        finally:
            collector.close()
    elif switch.vendor == "nokia":
        import os
        from app.drivers.nokia_srlinux import NokiaSrlinuxDriver
        driver = NokiaSrlinuxDriver()
        return asyncio.run(driver.fetch_config(
            switch.management_ip,
            username="admin",
            password=os.environ.get("GNMI_DEFAULT_PASSWORD", "NokiaSrl1!")
        ))
    else:
        return switch.running_config or ""

def take_config_snapshot(db: Session, switch_id: uuid.UUID, taken_by: str = "system", raw_config: str = None) -> models.ConfigSnapshot:
    """
    Takes a snapshot of a switch's configuration.
    If the switch is online, connects via gNMI / NETCONF to dump config.
    Falls back to a simulated config block containing fabric subnets config.
    """
    switch = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
    if not switch:
        raise ValueError("Switch not found")

    # Fetch live configuration from the device unless the caller already pulled
    # it (parallel audit fetch). On transport failure we raise so callers can
    # mark the switch as unreachable instead of treating error text as config.
    if raw_config is None:
        raw_config = _fetch_switch_running_config(switch)
    raw_config = _strip_control_nuls(raw_config)
    switch.running_config = raw_config
    config_hash = hashlib.sha256(raw_config.encode('utf-8')).hexdigest()

    # If the orchestrator/system itself pushed the config or performed ZTP,
    # the new snapshot represents the intended golden baseline configuration.
    is_baseline = taken_by in ("system_auto_provision", "system_config_push", "ztp_provisioning", "system")

    if is_baseline:
        # Clear previous baselines for this switch
        db.query(models.ConfigSnapshot).filter(
            models.ConfigSnapshot.switch_id == switch_id,
            models.ConfigSnapshot.is_baseline == True
        ).update({"is_baseline": False})

    snapshot = models.ConfigSnapshot(
        snapshot_id=uuid.uuid4(),
        switch_id=switch_id,
        taken_at=datetime.datetime.now(datetime.timezone.utc),
        raw_config=raw_config,
        config_hash=config_hash,
        is_baseline=is_baseline,
        taken_by=taken_by
    )
    db.add(snapshot)
    
    # Update switch model fields
    switch.configuration_checksum = config_hash
    switch.last_successful_sync = datetime.datetime.now(datetime.timezone.utc)
    switch.lifecycle_status = "compliant_active"
    
    # Parse active VRF names from configuration
    vrfs_found = []
    vendor_lower = (switch.vendor or "").lower()
    if vendor_lower in ("dell", "dell_os10"):
        import re
        for match in re.finditer(r'^ip vrf (\S+)', raw_config, re.MULTILINE):
            name = match.group(1).strip()
            if name.lower() not in ("default", "mgmt"):
                vrfs_found.append(name)
    elif vendor_lower in ("nokia", "nokia_srlinux"):
        import re
        # Nokia configs can have "/ network-instance name" or "network-instance name"
        for match in re.finditer(r'(?:/ )?network-instance (\S+)', raw_config):
            name = match.group(1).strip()
            # Clean braces or semicolons
            name = name.replace("{", "").replace("}", "").replace(";", "").strip()
            if name.lower() not in ("default", "mgmt") and name not in vrfs_found:
                if name:
                    vrfs_found.append(name)
    switch.configured_vrfs = list(set(vrfs_found))
    
    db.commit()
    db.refresh(snapshot)
    return snapshot

def run_compliance_check(db: Session, fabric_id: uuid.UUID = None, tenant_id: uuid.UUID = None) -> models.ComplianceRun:
    """
    Executes golden config rules auditing across target switches.
    Saves findings in the database.
    """
    # Create ComplianceRun record
    run = models.ComplianceRun(
        run_id=uuid.uuid4(),
        fabric_id=fabric_id,
        tenant_id=tenant_id,
        started_at=datetime.datetime.now(datetime.timezone.utc),
        status="running"
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Fetch active compliance rules
    rules = db.query(models.ComplianceRule).filter(models.ComplianceRule.is_active == True).all()

    query = db.query(models.Switch)
    if fabric_id:
        query = query.filter(models.Switch.fabric_id == fabric_id)
    switches = query.all()

    total_rules = 0
    passed_rules = 0
    findings_list = []
    unreachable_switches = []
    unreachable_switch_ids = set()

    # Fetch every switch's running config concurrently: dead switches (their
    # SSH/console ports are closed) now fail their 3s TCP probe in parallel
    # instead of stacking 10-30s connect timeouts sequentially.
    fetched_configs = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(_fetch_switch_running_config, sw): sw for sw in switches}
        for fut in futures:
            sw = futures[fut]
            try:
                fetched_configs[sw.switch_id] = fut.result()
            except Exception as e:
                print(f"[COMPLIANCE] Switch {sw.hostname} unreachable, skipping audit: {e}")
                unreachable_switches.append(sw.hostname)
                unreachable_switch_ids.add(sw.switch_id)

    for sw in switches:
        if sw.switch_id in unreachable_switch_ids:
            continue

        # Load switch's associated fabric
        fabric = db.query(models.Fabric).filter(models.Fabric.fabric_id == sw.fabric_id).first()

        # Always pull a fresh live configuration snapshot during compliance audit.
        # An unreachable switch is reported separately instead of being audited
        # against an empty/error config, which used to produce fake failures.
        snapshot = take_config_snapshot(db, sw.switch_id, "compliance-auditor", raw_config=fetched_configs[sw.switch_id])

        config = snapshot.raw_config or ""

        # Nokia SR Linux configs are CLI `info` dumps: flatten them so Dell-style
        # compliance patterns can be matched against full statement paths.
        if sw.vendor == "nokia":
            config = _flatten_srlinux_info(config)

        # Interpolation context dictionary
        context = {
            "fabric.expected_ntp_servers": fabric.expected_ntp_servers if fabric and fabric.expected_ntp_servers else "192.168.100.1",
            "fabric.expected_dns_servers": fabric.expected_dns_servers if fabric and fabric.expected_dns_servers else "8.8.8.8",
            "fabric.expected_syslog_server": fabric.expected_syslog_server if fabric and fabric.expected_syslog_server else "10.10.100.5",
            "fabric.global_bgp_asn": str(fabric.global_bgp_asn) if fabric else "65000",
            "switch.hostname": sw.hostname,
            "switch.management_ip": sw.management_ip,
            "switch.local_bgp_asn": str(sw.local_bgp_asn),
            "switch.loopback_0_ip": sw.loopback_0_ip
        }

        for rule in rules:
            total_rules += 1

            # Interpolate variables in pattern
            expected_str = rule.template_pattern
            for key, val in context.items():
                expected_str = expected_str.replace("{" + key + "}", val)

            # Nokia SR Linux patterns use different CLI wording than the Dell-style rules
            if sw.vendor == "nokia":
                expected_str = _adapt_nokia_expected_pattern(expected_str)

            # Match evaluation
            is_compliant = False
            if sw.vendor in ["dell_os10", "dell"] and expected_str == "lldp enable":
                # On Dell OS10, LLDP is enabled by default. It is compliant unless disabled explicitly.
                is_compliant = "disable" not in config.lower() and "no protocol lldp" not in config.lower()
            elif rule.match_type == "contains":
                is_compliant = expected_str in config or expected_str.lower() in config.lower()
            elif rule.match_type == "not_contains":
                is_compliant = expected_str not in config and expected_str.lower() not in config.lower()
            elif rule.match_type == "regex":
                import re
                try:
                    is_compliant = bool(re.search(expected_str, config, re.IGNORECASE))
                except:
                    is_compliant = False

            if not is_compliant:
                # Custom descriptive details for default rules
                detail_msg = f"Configuration requirement missing: '{expected_str}'."
                if "ntp" in rule.name.lower():
                    detail_msg = f"No NTP server configuration parsed in running config (Expected: {expected_str})."
                elif "dns" in rule.name.lower():
                    detail_msg = f"DNS server IP ({expected_str}) is not defined."
                elif "aaa" in rule.name.lower():
                    detail_msg = "AAA local login verification rules are missing from config."
                elif "mtu" in rule.name.lower():
                    detail_msg = f"Jumbo Frames (MTU >= 9000) are not configured on fabric link interfaces."
                elif "syslog" in rule.name.lower():
                    detail_msg = f"Centralized Syslog logging server target ({expected_str}) is not configured."
                elif "lldp" in rule.name.lower():
                    detail_msg = "LLDP protocol is not enabled globally on this device."

                finding = models.ComplianceFinding(
                    finding_id=uuid.uuid4(),
                    compliance_run_id=run.run_id,
                    switch_id=sw.switch_id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    detail=detail_msg,
                    expected=expected_str
                )
                db.add(finding)
                findings_list.append(finding)
            else:
                passed_rules += 1

    summary_data = {
        "switches_audited": len(switches),
        "switches_reachable": len(switches) - len(unreachable_switches),
        "unreachable_switches": unreachable_switches,
        "total_checks": total_rules,
        "passed_checks": passed_rules,
        "failed_checks": total_rules - passed_rules,
        "compliance_score_pct": round((passed_rules / total_rules) * 100, 1) if total_rules > 0 else 100.0
    }

    run.status = "completed"
    run.summary = json.dumps(summary_data)
    db.commit()
    db.refresh(run)
    return run

def restore_config_snapshot(db: Session, snapshot_id: uuid.UUID, operator_claims: dict, dry_run: bool = True) -> dict:
    """
    Verifies policy context (blast-radius, four-eyes rules) and restores a configuration snapshot.
    """
    snapshot = db.query(models.ConfigSnapshot).filter(models.ConfigSnapshot.snapshot_id == snapshot_id).first()
    if not snapshot:
        raise ValueError("Configuration snapshot not found")

    switch = db.query(models.Switch).filter(models.Switch.switch_id == snapshot.switch_id).first()
    
    # Blast radius check
    max_concurrent_changes = 2
    # In a simplified scope, if we are restoring a spine snapshot, it might impact many leaf switches.
    # If the target switch role is spine, flag a higher blast radius.
    blast_radius_devices_affected = 6 if switch.role == "spine" else 1
    
    four_eyes_approval_required = False
    if blast_radius_devices_affected > max_concurrent_changes:
        four_eyes_approval_required = True

    eval_status = "PASSED"
    if four_eyes_approval_required:
        eval_status = "WARNING_APPROVAL_REQUIRED"

    if dry_run:
        return {
            "snapshot_id": str(snapshot_id),
            "target_switch": switch.hostname,
            "role": switch.role,
            "blast_radius_affected": blast_radius_devices_affected,
            "four_eyes_required": four_eyes_approval_required,
            "status": eval_status,
            "diff_payload": snapshot.raw_config
        }

    # Perform actual commit (dry_run = False)
    if four_eyes_approval_required and operator_claims.get("role") != "platform_admin":
        raise PermissionError("Approval Exception: High blast radius rollback requires Platform Admin authorization.")

    # Push config to the switch via southbound driver
    from ..main import resolve_southbound_driver
    driver = resolve_southbound_driver(switch.vendor)
    loop = asyncio.new_event_loop()
    try:
        push_result = loop.run_until_complete(
            driver.push_config(switch.management_ip, "admin", "admin", snapshot.raw_config)
        )
    finally:
        loop.close()

    if not push_result.get("success"):
        raise Exception(f"Config push failed: {push_result.get('output', 'unknown error')}")

    # Register new snapshot capturing the restore action
    new_snapshot = models.ConfigSnapshot(
        snapshot_id=uuid.uuid4(),
        switch_id=switch.switch_id,
        taken_at=datetime.datetime.now(datetime.timezone.utc),
        raw_config=snapshot.raw_config,
        config_hash=snapshot.config_hash,
        taken_by=operator_claims.get("email", "operator")
    )
    db.add(new_snapshot)
    
    # Update switch status
    switch.configuration_checksum = snapshot.config_hash
    switch.last_successful_sync = datetime.datetime.now(datetime.timezone.utc)
    switch.lifecycle_status = "compliant_active"
    db.commit()

    return {
        "status": "RESTORED_COMMITTED",
        "snapshot_id": str(new_snapshot.snapshot_id),
        "target_switch": switch.hostname,
        "config_hash": snapshot.config_hash
    }

def categorize_drift(diff_text: str) -> str:
    """
    Heuristically categorizes the drift based on the diff.
    """
    diff_lower = diff_text.lower()
    if any(keyword in diff_lower for keyword in ["tacacs", "aaa", "password", "ssh"]):
        return "AAA Security"
    if any(keyword in diff_lower for keyword in ["ntp", "snmp", "syslog", "telemetry", "grpc"]):
        return "Observability"
    if any(keyword in diff_lower for keyword in ["vrf management", "mgmt", "access-list mgmt"]):
        return "Management Isolation"
    if any(keyword in diff_lower for keyword in ["bpduguard", "control-plane", "copp"]):
        return "Control Plane Security"
    if any(keyword in diff_lower for keyword in ["storm-control", "errdisable"]):
        return "Interface Defaults"
    if any(keyword in diff_lower for keyword in ["hostname", "banner", "timezone"]):
        return "Identity"
    return "Unknown Category"

@shared_task
def config_compliance_mgr():
    """
    Periodic task to detect config drift for all compliant switches.
    """
    from ..db import SessionLocal
    db = SessionLocal()
    try:
        switches = db.query(models.Switch).filter(models.Switch.lifecycle_status == "compliant_active").all()
        for switch in switches:
            # 1. Fetch latest baseline snapshot
            baseline_snapshot = db.query(models.ConfigSnapshot).filter(
                models.ConfigSnapshot.switch_id == switch.switch_id,
                models.ConfigSnapshot.is_baseline == True
            ).order_by(models.ConfigSnapshot.taken_at.desc()).first()
            
            if not baseline_snapshot:
                continue

            # 2. Get current running config (simulated for now by getting latest snapshot that is not baseline, or we just simulate a fetch)
            # In a real scenario we use the driver to fetch it. For now, let's use the switch.running_config or take a new snapshot.
            current_config = switch.running_config
            if not current_config:
                continue

            # 3. Check for drift
            if current_config != baseline_snapshot.raw_config:
                # Drift detected!
                from ..main import LIFECYCLE_DRIFTED
                switch.lifecycle_status = LIFECYCLE_DRIFTED
                
                # Simple diff
                baseline_lines = baseline_snapshot.raw_config.splitlines(keepends=True)
                current_lines = current_config.splitlines(keepends=True)
                diff = "".join(difflib.unified_diff(baseline_lines, current_lines))
                
                category = categorize_drift(diff)
                switch.configuration_drift_category = category
                
                print(f"[DRIFT DETECTED] Switch {switch.hostname} drifted in category: {category}")
        
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[DRIFT MGR] Error: {e}")
    finally:
        db.close()

@shared_task(bind=True, name="app.workers.config_lifecycle.apply_remediation")
def apply_remediation(self, finding_id_str: str):
    """
    Celery task that pushes the golden config to the affected switch to resolve
    a compliance finding. Updates the finding status to success/failed.
    """
    from ..db import SessionLocal

    db = SessionLocal()
    try:
        finding = db.query(models.ComplianceFinding).filter(
            models.ComplianceFinding.finding_id == uuid.UUID(finding_id_str)
        ).first()
        if not finding:
            return {"status": "FAILED", "error": "Finding not found"}

        switch = db.query(models.Switch).filter(models.Switch.switch_id == finding.switch_id).first()
        if not switch:
            finding.remediation_status = "failed"
            finding.remediation_error = "Switch not found"
            db.commit()
            return {"status": "FAILED", "error": "Switch not found"}

        from ..main import resolve_southbound_driver
        driver = resolve_southbound_driver(switch.vendor)

        fabric = db.query(models.Fabric).filter(models.Fabric.fabric_id == switch.fabric_id).first()
        context = {
            "fabric.expected_ntp_servers": fabric.expected_ntp_servers if fabric and fabric.expected_ntp_servers else "192.168.100.1",
            "fabric.expected_dns_servers": fabric.expected_dns_servers if fabric and fabric.expected_dns_servers else "8.8.8.8",
            "fabric.expected_syslog_server": fabric.expected_syslog_server if fabric and fabric.expected_syslog_server else "10.10.100.5",
            "fabric.global_bgp_asn": str(fabric.global_bgp_asn) if fabric else "65000",
            "switch.hostname": switch.hostname,
            "switch.management_ip": switch.management_ip,
            "switch.local_bgp_asn": str(switch.local_bgp_asn),
            "switch.loopback_0_ip": switch.loopback_0_ip
        }
        config_payload = build_remediation_config(switch, finding.rule_name, context)

        import os
        if switch.vendor in ["nokia", "nokia_srlinux", "timetra"]:
            username, password = "admin", os.environ.get("GNMI_DEFAULT_PASSWORD", "NokiaSrl1!")
        else:
            username, password = "admin", "admin"

        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(
                driver.push_config(switch.management_ip, username, password, config_payload)
            )
        finally:
            loop.close()

        success = result.get("success", False)
        finding.remediation_status = "success" if success else "failed"
        finding.remediation_error = None if success else (result.get("output", "") or "Config push failed")[:2000]
        finding.resolved_at = datetime.datetime.now(datetime.timezone.utc) if success else None
        db.commit()

        return {
            "status": "REMEDIATED" if success else "FAILED",
            "finding_id": finding_id_str,
            "output": result.get("output", "")
        }
    except Exception as e:
        db.rollback()
        error_msg = str(e)[:2000]
        try:
            finding = db.query(models.ComplianceFinding).filter(
                models.ComplianceFinding.finding_id == uuid.UUID(finding_id_str)
            ).first()
            if finding:
                finding.remediation_status = "failed"
                finding.remediation_error = error_msg
                db.commit()
        except Exception:
            db.rollback()
        return {"status": "FAILED", "error": error_msg}
    finally:
        db.close()


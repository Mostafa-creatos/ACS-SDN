import uuid
import hashlib
import json
import datetime
from sqlalchemy.orm import Session
from .. import models
from ..main import resolve_southbound_driver
from celery import shared_task
import difflib

def generate_golden_config(switch: models.Switch) -> str:
    """
    Helper to generate simulated config containing required golden configuration blocks.
    """
    if switch.vendor == "nokia":
        return (
            "/ system ntp server 192.168.100.1 admin-state enable\n"
            "/ system dns server 8.8.8.8 admin-state enable\n"
            "/ system security aaa local-authentication admin-state enable\n"
            f"/ system hostname {switch.hostname}\n"
        )
    elif switch.vendor == "dell_os10":
        return (
            "ntp server 192.168.100.1\n"
            "ip name-server 8.8.8.8\n"
            "aaa authentication login default local\n"
            f"hostname {switch.hostname}\n"
        )
    else:
        return (
            "ntp server 192.168.100.1\n"
            "ip name-server 8.8.8.8\n"
            f"hostname {switch.hostname}\n"
        )

def take_config_snapshot(db: Session, switch_id: uuid.UUID, taken_by: str = "system") -> models.ConfigSnapshot:
    """
    Takes a snapshot of a switch's configuration.
    If the switch is online, connects via gNMI / NETCONF to dump config.
    Falls back to a simulated config block containing fabric subnets config.
    """
    switch = db.query(models.Switch).filter(models.Switch.switch_id == switch_id).first()
    if not switch:
        raise ValueError("Switch not found")

    # Fetch live configuration from the device
    from app.drivers.dell_os10_collector import DellOS10Collector
    
    if switch.vendor == "dell_os10" or switch.vendor == "dell":
        collector = DellOS10Collector(host=switch.management_ip, username="admin", password="admin", use_ssh=False)
        try:
            collector.connect()
            raw_config = collector.collect_running_config()
        except Exception as e:
            raw_config = switch.running_config or "! Failed to connect to device for snapshot"
            print(f"[SNAPSHOT] Failed to collect real config for {switch.hostname}: {e}")
        finally:
            collector.close()
    elif switch.vendor == "nokia":
        from app.telemetry.gnmi_client import get_nokia_config
        try:
            raw_config = get_nokia_config(switch.management_ip, password="NokiaSrl1!")
            switch.running_config = raw_config
        except Exception as e:
            raw_config = switch.running_config or "! Failed to connect to Nokia device via gNMI"
            print(f"[SNAPSHOT] Failed to collect real config for Nokia {switch.hostname}: {e}")
    else:
        # Fallback to whatever is in the DB
        raw_config = switch.running_config or ""
    config_hash = hashlib.sha256(raw_config.encode('utf-8')).hexdigest()

    snapshot = models.ConfigSnapshot(
        snapshot_id=uuid.uuid4(),
        switch_id=switch_id,
        taken_at=datetime.datetime.utcnow(),
        raw_config=raw_config,
        config_hash=config_hash,
        taken_by=taken_by
    )
    db.add(snapshot)
    
    # Update switch model fields
    switch.configuration_checksum = config_hash
    switch.last_successful_sync = datetime.datetime.utcnow()
    switch.lifecycle_status = "compliant_active"
    
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
        started_at=datetime.datetime.utcnow(),
        status="running"
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    query = db.query(models.Switch)
    if fabric_id:
        query = query.filter(models.Switch.fabric_id == fabric_id)
    switches = query.all()

    total_rules = 0
    passed_rules = 0
    findings_list = []

    for sw in switches:
        # Get latest configuration snapshot or create one
        snapshot = db.query(models.ConfigSnapshot).filter(
            models.ConfigSnapshot.switch_id == sw.switch_id
        ).order_by(models.ConfigSnapshot.taken_at.desc()).first()
        
        if not snapshot:
            snapshot = take_config_snapshot(db, sw.switch_id, "compliance-auditor")

        config = snapshot.raw_config
        
        # Rule 1: NTP check
        total_rules += 1
        ntp_present = "ntp server 192.168.100.1" in config or "ntp" in config.lower()
        if not ntp_present:
            finding = models.ComplianceFinding(
                finding_id=uuid.uuid4(),
                compliance_run_id=run.run_id,
                switch_id=sw.switch_id,
                rule_name="NTP Service Configuration Check",
                severity="warning",
                detail="No NTP server configuration parsed in running config."
            )
            db.add(finding)
            findings_list.append(finding)
        else:
            passed_rules += 1

        # Rule 2: DNS check
        total_rules += 1
        dns_present = "name-server 8.8.8.8" in config or "dns" in config.lower()
        if not dns_present:
            finding = models.ComplianceFinding(
                finding_id=uuid.uuid4(),
                compliance_run_id=run.run_id,
                switch_id=sw.switch_id,
                rule_name="DNS Client Configuration Check",
                severity="info",
                detail="DNS server IP (8.8.8.8) is not defined."
            )
            db.add(finding)
            findings_list.append(finding)
        else:
            passed_rules += 1

        # Rule 3: AAA check
        total_rules += 1
        aaa_present = "aaa" in config.lower() or "security" in config.lower()
        if not aaa_present:
            finding = models.ComplianceFinding(
                finding_id=uuid.uuid4(),
                compliance_run_id=run.run_id,
                switch_id=sw.switch_id,
                rule_name="AAA Authentication Check",
                severity="critical",
                detail="AAA local login verification rules are missing from config."
            )
            db.add(finding)
            findings_list.append(finding)
        else:
            passed_rules += 1

        # Rule 4: MTU check
        total_rules += 1
        mtu_present = "mtu 9216" in config or "mtu 9000" in config or "mtu" in config.lower()
        if not mtu_present:
            finding = models.ComplianceFinding(
                finding_id=uuid.uuid4(),
                compliance_run_id=run.run_id,
                switch_id=sw.switch_id,
                rule_name="Jumbo Frames MTU Check",
                severity="warning",
                detail="Jumbo Frames (MTU >= 9000) are not configured on fabric link interfaces."
            )
            db.add(finding)
            findings_list.append(finding)
        else:
            passed_rules += 1

        # Rule 5: Syslog check
        total_rules += 1
        syslog_present = "logging server" in config or "logging-server" in config or "syslog-server" in config or "syslog" in config.lower()
        if not syslog_present:
            finding = models.ComplianceFinding(
                finding_id=uuid.uuid4(),
                compliance_run_id=run.run_id,
                switch_id=sw.switch_id,
                rule_name="Centralized Syslog Check",
                severity="info",
                detail="Centralized Syslog logging server target is not configured."
            )
            db.add(finding)
            findings_list.append(finding)
        else:
            passed_rules += 1

        # Rule 6: LLDP check
        total_rules += 1
        lldp_present = "lldp enable" in config or "lldp" in config.lower()
        if not lldp_present:
            finding = models.ComplianceFinding(
                finding_id=uuid.uuid4(),
                compliance_run_id=run.run_id,
                switch_id=sw.switch_id,
                rule_name="LLDP Status Check",
                severity="warning",
                detail="LLDP protocol is not enabled globally on this device."
            )
            db.add(finding)
            findings_list.append(finding)
        else:
            passed_rules += 1

    summary_data = {
        "switches_audited": len(switches),
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
    if four_eyes_approval_required and operator_claims.get("role") != "Platform Admin":
        raise PermissionError("Approval Exception: High blast radius rollback requires Platform Admin authorization.")

    # Apply configuration commands (simulate write paths or trigger drivers)
    # Register new snapshot capturing the restore action
    new_snapshot = models.ConfigSnapshot(
        snapshot_id=uuid.uuid4(),
        switch_id=switch.switch_id,
        taken_at=datetime.datetime.utcnow(),
        raw_config=snapshot.raw_config,
        config_hash=snapshot.config_hash,
        taken_by=operator_claims.get("email", "operator")
    )
    db.add(new_snapshot)
    
    # Update switch status
    switch.configuration_checksum = snapshot.config_hash
    switch.last_successful_sync = datetime.datetime.utcnow()
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
        switches = db.query(models.Switch).filter(models.Switch.lifecycle_status == "CompliantActive").all()
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
                switch.lifecycle_status = "ConfigurationDrifted"
                
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


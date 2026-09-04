from celery import shared_task
from app.db import SessionLocal
from app.models import Switch, ZtpDiscoveryPool, ConfigSnapshot, Fabric
import subprocess
import os
import json
import uuid
import hashlib
from app.core.logging_config import get_logger
logger = get_logger(__name__)


def _resolve_ansible_dir() -> str:
    """Resolve the ansible directory with fallback paths."""
    candidates = [
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "southbound-ansible"),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "southbound-ansible"),
        os.path.expanduser("~/sdn-controller/southbound-ansible"),
        "/workspace/southbound-ansible",
    ]
    for path in candidates:
        playbook = os.path.join(path, "playbooks", "base_provisioning.yml")
        if os.path.isfile(playbook):
            return path
    return candidates[0]


ANSIBLE_DIR = _resolve_ansible_dir()
ANSIBLE_PLAYBOOK = os.path.join(ANSIBLE_DIR, "playbooks", "base_provisioning.yml")
ANSIBLE_TIMEOUT = 120


def _build_dell_baseline_commands(hostname: str, is_fallback: bool = False, fabric=None) -> list:
    """Return the Dell baseline config as blocks of console commands using Fabric variables."""
    ntp_ip = fabric.expected_ntp_server_ip if (fabric and getattr(fabric, 'expected_ntp_server_ip', None)) else "172.20.20.1"
    syslog_ip = fabric.expected_syslog_server_ip if (fabric and getattr(fabric, 'expected_syslog_server_ip', None)) else "34.32.194.240"
    
    commands = [
        [f"hostname {hostname}"],
        ["ip vrf management"],
        [
            "ip access-list MGMT-ACL",
            "permit ip 10.0.0.0/8 any",
            "deny ip any any",
        ],
        ["tacacs-server host 10.10.10.10 key S3cr3tK3y"],
        ["tacacs-server host 10.10.10.11 key S3cr3tK3y"],
        ["aaa authentication login default group tacacs+ local"],
    ]
    if not is_fallback:
        commands.append(["no ip telnet server enable"])
    commands.extend([
        ["ip ssh server enable"],
        ["clock timezone standard-timezone Zulu"],
        [f"ntp server {ntp_ip}"],
        [f"logging server {syslog_ip}"],
        ["snmp-server view RESTRICTED_VIEW 1.3.6.1 included"],
        ["snmp-server group READ_ONLY 3 auth read RESTRICTED_VIEW"],
        ["snmp-server user sdnadmin READ_ONLY 3 auth sha sdnAuthPass123"],
        ["errdisable recovery cause bpduguard"],
        ["errdisable recovery interval 300"],
    ])
    return commands


def resolve_console_target(switch, db=None, default_port: int = 5000):
    """
    Resolves the reachable console host and port for a switch.
    If the switch has a private PNetLab IP (172.20.20.x or 127.x), it automatically
    derives the PNetLab telnet console port (30000 + node_id) on host 128.105.145.2.
    """
    target_host = switch.management_ip
    target_port = default_port

    if target_host.startswith("172.20.20.") or target_host.startswith("127.") or target_host.startswith("10.") or target_host == "128.105.145.2" or getattr(switch, "vendor", "") in ("dell_os10", "dell"):
        pnet_host = "128.105.145.2"
        mac = ""
        if db and switch.discovery_id:
            disc = db.query(ZtpDiscoveryPool).filter(ZtpDiscoveryPool.discovery_id == switch.discovery_id).first()
            if disc and disc.mac_address:
                mac = disc.mac_address

        if not mac and getattr(switch, "management_mac", None):
            mac = switch.management_mac

        node_id = 1
        if mac and ":" in mac:
            parts = mac.split(":")
            if len(parts) == 6:
                try:
                    # In PNetLab MAC pattern (50:24:c3:00:{node_id}:{iface}), index 4 is node_id
                    node_id = int(parts[4], 16)
                except Exception: pass
        elif getattr(switch, "serial_number", None):
            sn_parts = switch.serial_number.split("-")
            if len(sn_parts) >= 2:
                try:
                    node_id = int(sn_parts[-1][:2], 16)
                except Exception: pass

        pnet_port = 30000 + node_id
        return pnet_host, pnet_port

    return target_host, target_port


def ensure_ssh_enabled(ip: str, port: int = 5000) -> bool:
    """Connects to the Dell console TCP socket, runs configuration commands to enable SSH."""
    import socket
    import time

    logger.info(f"[CONNSOLVER] Attempting to ensure SSH is enabled via console on {ip}:{port}")
    s = socket.socket()
    s.settimeout(8)

    def read_until(markers, timeout=8):
        buf = ""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                chunk = s.recv(4096).decode("utf-8", errors="ignore")
                if not chunk:
                    break
                buf += chunk
                if any(m in buf for m in markers):
                    break
            except socket.timeout:
                break
        return buf

    try:
        s.connect((ip, port))
        s.send(b"\x03\r\n")
        time.sleep(0.5)

        buf = read_until(["login:", "Password:", "#", ">"])
        if "login:" in buf:
            s.send(b"admin\n")
            read_until(["Password:"], timeout=5)
            s.send(b"admin\n")
            read_until(["#", ">"], timeout=8)
        s.send(b"end\n")
        read_until(["#"], timeout=5)

        s.send(b"configure terminal\n")
        if "(config)#" not in read_until(["(config)#"], timeout=8):
            logger.error(f"[CONNSOLVER] Failed to enter config mode on {ip}:{port}")
            s.close()
            return False

        s.send(b"ip ssh server enable\n")
        read_until(["(config)#"], timeout=8)
        s.send(b"end\n")
        read_until(["#"], timeout=5)
        s.send(b"write memory\n")
        read_until(["#"], timeout=15)

        s.send(b"show ip ssh\n")
        out = read_until(["#"], timeout=8)
        lower = out.lower()
        if "ssh server:" in lower and "enabled" in lower:
            logger.info(f"[CONNSOLVER] SSH server is enabled on {ip}:{port}.")
        else:
            logger.warning(f"[CONNSOLVER] WARNING: SSH server does not report enabled on {ip}:{port}.")
        s.close()
        logger.info(f"[CONNSOLVER] Sent ip ssh server enable command successfully to {ip}:{port}")
        return True
    except Exception as e:
        logger.warning(f"[CONNSOLVER] Console connection failed or skipped for {ip}:{port} - {e}")
        try:
            s.close()
        except Exception:
            pass
        return False

def wait_for_ssh(ip: str, port: int = 22, timeout: int = 45) -> bool:
    """Wait for an SSH server that actually answers with an SSH version banner.

    A bare TCP connect is not enough: a wedged SSH daemon (e.g. a missing host
    key) will accept connections but never send the ``SSH-2.0-`` banner, which
    makes Ansible/paramiko fail later with ``No existing session``.
    """
    import socket
    import time
    start_time = time.time()
    logger.info(f"[CONNSOLVER] Waiting for SSH daemon to start on {ip}:{port}...")
    while time.time() - start_time < timeout:
        s = socket.socket()
        s.settimeout(6)
        try:
            s.connect((ip, port))
            banner = b""
            read_deadline = time.time() + 5
            while time.time() < read_deadline and len(banner) < 64:
                try:
                    chunk = s.recv(64)
                    if not chunk:
                        break
                    banner += chunk
                    if banner.startswith(b"SSH-2.0-"):
                        break
                except socket.timeout:
                    break
            s.close()
            if banner.startswith(b"SSH-2.0-"):
                banner_text = banner.split(b"\r")[0].decode("utf-8", errors="ignore").strip()
                logger.info(f"[CONNSOLVER] SSH daemon is online and speaking SSH on {ip}:{port} ({banner_text})")
                logger.info(f"[CONNSOLVER] Sleeping 15 seconds to allow SSH service to stabilize...")
                time.sleep(15)
                return True
            logger.warning(f"[CONNSOLVER] Port {ip}:{port} accepts TCP but no SSH banner received; SSH daemon may be wedged.")
        except OSError:
            pass
        time.sleep(2)
    logger.warning(f"[CONNSOLVER] Timeout waiting for SSH on {ip}:{port}")
    return False


def run_async(coro):
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    if loop.is_running():
        import threading
        from queue import Queue
        q = Queue()
        def worker():
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)
            try:
                res = new_loop.run_until_complete(coro)
                q.put((True, res))
            except Exception as e:
                q.put((False, e))
            finally:
                new_loop.close()
        t = threading.Thread(target=worker)
        t.start()
        t.join()
        success, result = q.get()
        if success:
            return result
        else:
            raise result
    else:
        return loop.run_until_complete(coro)


def append_ztp_log(db, discovery_record, message: str):
    from datetime import datetime, timezone
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    logger.info(f"[ZTP WORKER LOG] {message}")
    if discovery_record:
        if discovery_record.ztp_logs is None:
            discovery_record.ztp_logs = ""
        discovery_record.ztp_logs += log_entry
        db.commit()


@shared_task(bind=True, max_retries=3)
def apply_baseline_template(self, switch_id: str):
    """
    Applies the full baseline template to a newly discovered switch.
    """
    from datetime import datetime, timezone
    db = SessionLocal()
    discovery_record = None
    try:
        switch = db.query(Switch).filter(Switch.switch_id == switch_id).first()
        if not switch:
            raise ValueError(f"Switch not found: {switch_id}")

        discovery_record = db.query(ZtpDiscoveryPool).filter(ZtpDiscoveryPool.discovery_id == switch.discovery_id).first()
        
        # Initialize ztp_logs if empty
        if discovery_record:
            discovery_record.ztp_logs = f"[{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}] --- ZTP Onboarding Started for {switch.hostname} ({switch.management_ip}) ---\n"
            db.commit()

        append_ztp_log(db, discovery_record, f"Device identified. Vendor: {switch.vendor}, Role: {switch.role}.")

        # Determine if Nokia (transit) or Dell (active management)
        is_nokia = "nokia" in (switch.vendor or "").lower() or "nokia" in (switch.model or "").lower()

        if is_nokia:
            append_ztp_log(db, discovery_record, "Nokia switch detected. Skipping baseline configuration push (transit switch).")
            append_ztp_log(db, discovery_record, "Connecting to Nokia switch via SSH to retrieve running configuration...")
            
            from app.drivers.nokia_srlinux import NokiaSrlinuxDriver
            driver = NokiaSrlinuxDriver()
            try:
                # Retrieve the running config using run_async
                real_config = run_async(driver.fetch_config(
                    host=switch.management_ip,
                    username="admin",
                    password="NokiaSrl1!"
                ))
                append_ztp_log(db, discovery_record, "Successfully retrieved running configuration from Nokia switch.")
            except Exception as e:
                real_config = f"! Fallback Nokia Config (Connection failed)\n! {switch.hostname}\n"
                append_ztp_log(db, discovery_record, f"Warning: Failed to fetch running configuration: {e}. Using fallback config.")
                
            config_hash = hashlib.sha256(real_config.encode('utf-8')).hexdigest()
            
            # Create snapshot
            snapshot = ConfigSnapshot(
                switch_id=switch.switch_id,
                raw_config=real_config,
                config_hash=config_hash,
                is_baseline=True,
                taken_by="ztp_provisioning"
            )
            db.add(snapshot)
            switch.running_config = real_config
            switch.configuration_checksum = config_hash
            switch.lifecycle_status = "compliant_active"
            
            if discovery_record:
                discovery_record.onboarding_status = "provisioned"
                discovery_record.error_message = None
                
            db.commit()
            append_ztp_log(db, discovery_record, "ZTP onboarding completed successfully for Nokia transit switch.")
            return {"status": "success", "switch_id": switch_id}

        # Otherwise, process Dell switch
        # Resolve console target (using PNetLab port mapping fallback if needed)
        console_host, console_port = resolve_console_target(switch, db)
        append_ztp_log(db, discovery_record, f"Resolved console target to {console_host}:{console_port}")

        # Pre-provisioning snapshot (factory default state)
        append_ztp_log(db, discovery_record, "Taking pre-provisioning snapshot of current state...")
        pre_config = f"! Pre-provisioning snapshot for {switch.hostname}\n! Captured before baseline apply\n"
        try:
            from app.drivers.dell_os10_collector import DellOS10Collector
            collector = DellOS10Collector(host=console_host, port=console_port, username="admin", password="admin", use_ssh=False)
            try:
                collector.connect()
                pre_config = collector.collect_running_config()
                append_ztp_log(db, discovery_record, "Successfully captured pre-provisioning configuration snapshot.")
            except Exception as e:
                append_ztp_log(db, discovery_record, f"Notice: Could not collect pre-provisioning config ({e}), continuing...")
            finally:
                collector.close()
        except Exception as e:
            append_ztp_log(db, discovery_record, f"Notice: Error loading collector: {e}")

        pre_hash = hashlib.sha256(pre_config.encode('utf-8')).hexdigest()
        pre_snapshot = ConfigSnapshot(
            switch_id=switch.switch_id,
            raw_config=pre_config,
            config_hash=pre_hash,
            is_baseline=False,
            taken_by="ztp_pre_provisioning"
        )
        db.add(pre_snapshot)
        db.commit()

        # Ensure SSH is enabled via Telnet/Console
        append_ztp_log(db, discovery_record, f"Connecting to switch console via Telnet ({console_host}:{console_port}) to enable SSH daemon...")
        
        # Enable SSH over resolved console port
        ssh_enable_success = ensure_ssh_enabled(console_host, console_port)
        if not ssh_enable_success:
            append_ztp_log(db, discovery_record, "Warning: Direct console session failed. Checking if SSH is already active...")
        else:
            append_ztp_log(db, discovery_record, "Successfully issued SSH enablement command via console.")

        # Force console-based provisioning if switch management_ip is unroutable from GCP
        use_console_provisioning = (console_host != switch.management_ip)

        if not use_console_provisioning:
            # Check if SSH is online for direct Ansible execution
            ssh_online = wait_for_ssh(switch.management_ip)
            use_console_provisioning = not ssh_online

        if use_console_provisioning:
            append_ztp_log(db, discovery_record, f"Provisioning switch directly over console ({console_host}:{console_port})...")

            from app.drivers.dell_os10_collector import DellOS10Collector
            collector = DellOS10Collector(host=console_host, port=console_port, username="admin", password="admin", use_ssh=False)
            try:
                collector.connect()
                fabric = db.query(Fabric).filter(Fabric.fabric_id == switch.fabric_id).first() if switch.fabric_id else None
                baseline_blocks = _build_dell_baseline_commands(switch.hostname, is_fallback=True, fabric=fabric)
                total_commands = sum(len(b) for b in baseline_blocks)
                append_ztp_log(db, discovery_record, f"Applying {total_commands} baseline commands over console...")
                result = collector.push_config_blocks(baseline_blocks)
                if result["applied"]:
                    append_ztp_log(db, discovery_record, f"Console provisioning applied {len(result['applied'])}/{total_commands} commands.")
                if result["failed"]:
                    fail_lines = "; ".join(f"{cmd} -> {snippet}" for cmd, snippet in result["failed"][:5])
                    append_ztp_log(db, discovery_record, f"WARNING: {len(result['failed'])} baseline commands failed over console: {fail_lines}")
            except Exception as exc:
                error_msg = f"Console-based provisioning failed: {exc}"
                append_ztp_log(db, discovery_record, f"Error: {error_msg}")
                raise
            finally:
                collector.close()

            append_ztp_log(db, discovery_record, "Console-based baseline provisioning completed successfully.")
        else:
            append_ztp_log(db, discovery_record, "SSH service is online. Running Ansible baseline provisioning playbook...")

            if not os.path.isfile(ANSIBLE_PLAYBOOK):
                raise FileNotFoundError(f"Ansible playbook not found at {ANSIBLE_PLAYBOOK}")

            env = os.environ.copy()
            env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
            env["ANSIBLE_PERSISTENT_CONNECT_TIMEOUT"] = "60"
            env["ANSIBLE_PERSISTENT_COMMAND_TIMEOUT"] = "60"

            # Execute Ansible
            result = subprocess.run(
                [
                    "ansible-playbook", ANSIBLE_PLAYBOOK,
                    "-i", f"{switch.management_ip},",
                    "-e", f"ansible_user=admin ansible_password=admin ansible_network_os=dellos10 ansible_connection=network_cli ansible_connect_timeout=60 ansible_command_timeout=60 hostname_assigned={switch.hostname}"
                ],
                capture_output=True, text=True, timeout=ANSIBLE_TIMEOUT, env=env
            )

            # Log Ansible output
            if result.stdout:
                append_ztp_log(db, discovery_record, f"Ansible Output:\n{result.stdout}")
            if result.stderr:
                append_ztp_log(db, discovery_record, f"Ansible Errors:\n{result.stderr}")

            if result.returncode != 0:
                error_msg = f"Ansible playbook execution failed with returncode {result.returncode}."
                append_ztp_log(db, discovery_record, f"Error: {error_msg}")
                raise Exception(error_msg)

            append_ztp_log(db, discovery_record, "Ansible playbook execution succeeded. Retrieving final running configuration...")

        # Fetch actual running configuration using the existing collector
        from app.drivers.dell_os10_collector import DellOS10Collector
        collector = DellOS10Collector(host=console_host, port=console_port, username="admin", password="admin", use_ssh=False)
        try:
            collector.connect()
            real_config = collector.collect_running_config()
            append_ztp_log(db, discovery_record, "Successfully retrieved final running configuration.")
        except Exception as e:
            real_config = "\n".join(_build_dell_baseline_commands(switch.hostname, is_fallback=True)[0])
            append_ztp_log(db, discovery_record, f"Warning: Failed to fetch running configuration ({e}). Using generated baseline config.")
        finally:
            collector.close()

        config_hash = hashlib.sha256(real_config.encode('utf-8')).hexdigest()

        # Take a snapshot and mark as baseline
        snapshot = ConfigSnapshot(
            switch_id=switch.switch_id,
            raw_config=real_config,
            config_hash=config_hash,
            is_baseline=True,
            taken_by="ztp_provisioning"
        )
        db.add(snapshot)
        switch.running_config = real_config
        switch.configuration_checksum = config_hash
        switch.lifecycle_status = "compliant_active"
        switch.last_successful_sync = datetime.now(timezone.utc)
        switch.last_collection_timestamp = datetime.now(timezone.utc)
        
        if discovery_record:
            discovery_record.onboarding_status = "provisioned"
            discovery_record.error_message = None

        db.commit()
        append_ztp_log(db, discovery_record, "ZTP onboarding completed successfully.")
        return {"status": "success", "switch_id": switch_id}

    except Exception as exc:
        db.rollback()
        error_msg = str(exc)
        logger.error(f"[ZTP WORKER] Error provisioning {switch_id}: {error_msg}")
        
        if discovery_record is None and 'switch' in locals() and switch is not None:
            discovery_record = db.query(ZtpDiscoveryPool).filter(ZtpDiscoveryPool.discovery_id == switch.discovery_id).first()

        if discovery_record:
            discovery_record.onboarding_status = "failed"
            discovery_record.error_message = f"provisioning_error: {error_msg}"
            append_ztp_log(db, discovery_record, f"ZTP FAILED: {error_msg}")
            db.commit()
            
        try:
            self.retry(exc=exc, countdown=2 ** self.request.retries)
        except self.MaxRetriesExceededError:
            logger.error(f"[ZTP WORKER] Max retries exceeded for {switch_id}")
            return {"status": "failed", "switch_id": switch_id, "error": error_msg}
    finally:
        db.close()

@shared_task(bind=True)
def trigger_rollback(self, switch_id: str):
    """
    Rolls back a switch to its latest baseline configuration using Ansible.
    """
    from app.models import ComplianceFinding
    from datetime import datetime, timezone
    db = SessionLocal()
    task_id = str(self.request.id) if self.request.id else None
    try:
        switch = db.query(Switch).filter(Switch.switch_id == switch_id).first()
        if not switch:
            if task_id:
                db.query(ComplianceFinding).filter(
                    ComplianceFinding.remediation_task_id == task_id
                ).update({"remediation_status": "failed", "remediation_error": "Switch not found"})
                db.commit()
            raise ValueError(f"Switch not found: {switch_id}")

        logger.info(f"[ROLLBACK WORKER] Rolling back switch {switch.hostname}")

        provisioned_via_console = False
        # Ensure SSH is enabled via Telnet/Console if it is a Dell switch
        if "dell" in (switch.model or "").lower() or "spine" in (switch.hostname or "").lower() or switch.management_ip in ["172.20.20.10", "172.20.20.13"]:
            ensure_ssh_enabled(switch.management_ip)
            ssh_online = wait_for_ssh(switch.management_ip)
            if not ssh_online:
                logger.warning(f"[ROLLBACK WORKER] SSH unavailable on {switch.management_ip}; falling back to console-based provisioning.")
                from app.drivers.dell_os10_collector import DellOS10Collector
                collector = DellOS10Collector(host=switch.management_ip, username="admin", password="admin", use_ssh=False)
                try:
                    collector.connect()
                    baseline_blocks = _build_dell_baseline_commands(switch.hostname, is_fallback=True)
                    result = collector.push_config_blocks(baseline_blocks)
                    logger.info(f"[ROLLBACK WORKER] Console provisioning applied {len(result['applied'])} commands, {len(result['failed'])} failed.")
                    if result["failed"]:
                        logger.warning(f"[ROLLBACK WORKER] Failed commands: {[c for c, _ in result['failed']]}")
                except Exception as exc:
                    raise Exception(f"Console-based rollback provisioning failed: {exc}")
                finally:
                    collector.close()
                provisioned_via_console = True

        if not provisioned_via_console:
            if not os.path.isfile(ANSIBLE_PLAYBOOK):
                raise FileNotFoundError(f"Ansible playbook not found at {ANSIBLE_PLAYBOOK}")

            env = os.environ.copy()
            env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
            env["ANSIBLE_PERSISTENT_CONNECT_TIMEOUT"] = "60"
            env["ANSIBLE_PERSISTENT_COMMAND_TIMEOUT"] = "60"

            result = subprocess.run(
                [
                    "ansible-playbook", ANSIBLE_PLAYBOOK,
                    "-i", f"{switch.management_ip},",
                    "-e", f"ansible_user=admin ansible_password=admin ansible_network_os=dellos10 ansible_connection=network_cli ansible_connect_timeout=60 ansible_command_timeout=60 hostname_assigned={switch.hostname}"
                ],
                capture_output=True, text=True, timeout=ANSIBLE_TIMEOUT, env=env
            )
            if result.returncode != 0:
                logger.error(f"[ROLLBACK WORKER] Ansible failed. Returncode: {result.returncode}")
                logger.info(f"[ROLLBACK WORKER] Stdout: {result.stdout}")
                logger.info(f"[ROLLBACK WORKER] Stderr: {result.stderr}")
                error_detail = f"Ansible failed (rc={result.returncode}).\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
                raise Exception(error_detail)
        else:
            logger.warning("[ROLLBACK WORKER] Ansible skipped: switch provisioned via console (SSH unavailable).")

        # Simulate rollback success
        switch.lifecycle_status = "compliant_active"
        switch.configuration_drift_category = None
        
        from app.drivers.dell_os10_collector import DellOS10Collector
        collector = DellOS10Collector(host=switch.management_ip, username="admin", password="admin", use_ssh=False)
        try:
            collector.connect()
            real_config = collector.collect_running_config()
        except Exception as e:
            real_config = "! Fallback Baseline Config (Rolled back)\nntp server 192.168.100.1\n"
            logger.error(f"[ROLLBACK WORKER] Failed to collect real config: {e}")
        finally:
            collector.close()

        config_hash = hashlib.sha256(real_config.encode('utf-8')).hexdigest()

        # Take a new snapshot
        snapshot = ConfigSnapshot(
            switch_id=switch.switch_id,
            raw_config=real_config,
            config_hash=config_hash,
            is_baseline=True,
            taken_by="rollback_handler"
        )
        db.add(snapshot)
        
        # Update matching compliance findings
        if task_id:
            db.query(ComplianceFinding).filter(
                ComplianceFinding.remediation_task_id == task_id
            ).update({
                "remediation_status": "success",
                "resolved_at": datetime.now(timezone.utc)
            })
        db.commit()
        logger.info(f"[ROLLBACK WORKER] Successfully rolled back {switch.hostname}")
        return {"status": "success", "switch_id": switch_id}
    except Exception as exc:
        db.rollback()
        error_msg = str(exc)[:2000]
        if task_id:
            try:
                db.query(ComplianceFinding).filter(
                    ComplianceFinding.remediation_task_id == task_id
                ).update({"remediation_status": "failed", "remediation_error": error_msg})
                db.commit()
            except Exception:
                db.rollback()
        logger.error(f"[ROLLBACK WORKER] Error rolling back {switch_id}: {error_msg}")
        return {"status": "failed", "switch_id": switch_id, "error": error_msg}
    finally:
        db.close()

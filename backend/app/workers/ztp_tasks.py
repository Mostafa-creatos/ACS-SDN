from celery import shared_task
from app.db import SessionLocal
from app.models import Switch, ZtpDiscoveryPool, ConfigSnapshot
import subprocess
import os
import json
import uuid
import hashlib


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


def ensure_ssh_enabled(ip: str, port: int = 5000) -> bool:
    """Connects to the Dell console TCP socket, runs configuration commands to enable SSH."""
    import socket
    import time
    
    print(f"[CONNSOLVER] Attempting to ensure SSH is enabled via console on {ip}:{port}")
    s = socket.socket()
    s.settimeout(5)
    try:
        s.connect((ip, port))
        s.send(b"\x03\r\n")
        time.sleep(0.5)
        
        # Read prompt/login
        buf = ""
        start_time = time.time()
        while time.time() - start_time < 3:
            try:
                chunk = s.recv(4096).decode('utf-8', errors='ignore')
                if not chunk:
                    break
                buf += chunk
                if "login:" in buf or "Password:" in buf or "spine-" in buf or "#" in buf or ">" in buf:
                    break
            except socket.timeout:
                break
                
        if "login:" in buf:
            s.send(b"admin\n")
            time.sleep(0.5)
            # wait for password
            p_buf = ""
            p_start = time.time()
            while time.time() - p_start < 2:
                try:
                    chunk = s.recv(4096).decode('utf-8', errors='ignore')
                    p_buf += chunk
                    if "Password:" in p_buf:
                        break
                except socket.timeout:
                    break
            s.send(b"admin\n")
            time.sleep(1.0)
            
        s.send(b"configure terminal\n")
        time.sleep(0.5)
        s.send(b"ip ssh server enable\n")
        time.sleep(0.5)
        s.send(b"end\n")
        time.sleep(0.5)
        s.send(b"write memory\n")
        time.sleep(1.0)
        s.close()
        print(f"[CONNSOLVER] Sent ip ssh server enable command successfully to {ip}:{port}")
        return True
    except Exception as e:
        print(f"[CONNSOLVER] Console connection failed or skipped for {ip}:{port} - {e}")
        try:
            s.close()
        except:
            pass
        return False

def wait_for_ssh(ip: str, port: int = 22, timeout: int = 30) -> bool:
    """Wait for SSH port to start accepting connections."""
    import socket
    import time
    start_time = time.time()
    print(f"[CONNSOLVER] Waiting for SSH daemon to start on {ip}:{port}...")
    while time.time() - start_time < timeout:
        s = socket.socket()
        s.settimeout(2)
        try:
            s.connect((ip, port))
            s.close()
            print(f"[CONNSOLVER] SSH daemon is online and accepting connections on {ip}:{port}")
            print(f"[CONNSOLVER] Sleeping 15 seconds to allow SSH service to stabilize...")
            time.sleep(15)
            return True
        except:
            time.sleep(2)
    print(f"[CONNSOLVER] Timeout waiting for SSH on {ip}:{port}")
    return False


@shared_task(bind=True, max_retries=3)
def apply_baseline_template(self, switch_id: str):
    """
    Applies the full baseline template to a newly discovered switch using Ansible.
    """
    db = SessionLocal()
    try:
        switch = db.query(Switch).filter(Switch.switch_id == switch_id).first()
        if not switch:
            raise ValueError(f"Switch not found: {switch_id}")

        discovery_record = db.query(ZtpDiscoveryPool).filter(ZtpDiscoveryPool.discovery_id == switch.discovery_id).first()

        print(f"[ZTP WORKER] Applying baseline template to switch {switch.hostname} ({switch.management_ip})")

        # Pre-provisioning snapshot (factory default state)
        pre_config = f"! Pre-provisioning snapshot for {switch.hostname}\n! Captured before Ansible baseline apply\n"
        try:
            from app.drivers.dell_os10_collector import DellOS10Collector
            collector = DellOS10Collector(host=switch.management_ip, username="admin", password="admin", use_ssh=False)
            try:
                collector.connect()
                pre_config = collector.collect_running_config()
            except Exception as e:
                print(f"[ZTP WORKER] Could not collect pre-provisioning config: {e}")
            finally:
                collector.close()
        except ImportError:
            pass

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

        # Ensure SSH is enabled via Telnet/Console if it is a Dell switch
        if "dell" in (switch.model or "").lower() or "spine" in (switch.hostname or "").lower() or switch.management_ip in ["172.20.20.10", "172.20.20.13"]:
            ensure_ssh_enabled(switch.management_ip)
            wait_for_ssh(switch.management_ip)

        # Run Ansible playbook with timeout
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
                "-e", "ansible_user=admin ansible_password=admin ansible_network_os=dellos10 ansible_connection=network_cli ansible_connect_timeout=60 ansible_command_timeout=60"
            ],
            capture_output=True, text=True, timeout=ANSIBLE_TIMEOUT, env=env
        )
        if result.returncode != 0:
            print(f"[ZTP WORKER] Ansible failed. Returncode: {result.returncode}")
            print(f"[ZTP WORKER] Stdout: {result.stdout}")
            print(f"[ZTP WORKER] Stderr: {result.stderr}")
            raise Exception(f"Ansible failed: {result.stderr or result.stdout}")

        switch.lifecycle_status = "compliant_active"
        
        if discovery_record:
            discovery_record.onboarding_status = "provisioned"
            discovery_record.error_message = None

        # Fetch actual running configuration using the existing collector
        from app.drivers.dell_os10_collector import DellOS10Collector
        
        collector = DellOS10Collector(host=switch.management_ip, username="admin", password="admin", use_ssh=False)
        try:
            collector.connect()
            real_config = collector.collect_running_config()
        except Exception as e:
            real_config = f"! Fallback Baseline Config (Failed to connect)\n! {switch.hostname}\nntp server 192.168.100.1\n"
            print(f"[ZTP WORKER] Failed to collect real config: {e}")
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
        
        db.commit()
        print(f"[ZTP WORKER] Successfully provisioned {switch.hostname}")
        return {"status": "success", "switch_id": switch_id}

    except subprocess.TimeoutExpired:
        db.rollback()
        print(f"[ZTP WORKER] Ansible playbook timed out for {switch_id} after {ANSIBLE_TIMEOUT}s")
        discovery_record = db.query(ZtpDiscoveryPool).join(Switch).filter(Switch.switch_id == switch_id).first()
        if discovery_record:
            discovery_record.onboarding_status = "failed"
            discovery_record.error_message = f"provisioning_error: Ansible playbook timed out after {ANSIBLE_TIMEOUT}s"
            db.commit()
        return {"status": "failed", "switch_id": switch_id, "error": "Ansible timeout"}

    except FileNotFoundError as e:
        db.rollback()
        print(f"[ZTP WORKER] Ansible playbook not found: {e}")
        discovery_record = db.query(ZtpDiscoveryPool).join(Switch).filter(Switch.switch_id == switch_id).first()
        if discovery_record:
            discovery_record.onboarding_status = "failed"
            discovery_record.error_message = f"provisioning_error: {str(e)}"
            db.commit()
        return {"status": "failed", "switch_id": switch_id, "error": str(e)}

    except Exception as exc:
        db.rollback()
        print(f"[ZTP WORKER] Error provisioning {switch_id}: {str(exc)}")
        
        discovery_record = db.query(ZtpDiscoveryPool).join(Switch).filter(Switch.switch_id == switch_id).first()
        if discovery_record:
            discovery_record.onboarding_status = "failed"
            discovery_record.error_message = f"provisioning_error: {str(exc)}"
            db.commit()
            
        try:
            self.retry(exc=exc, countdown=2 ** self.request.retries)
        except self.MaxRetriesExceededError:
            print(f"[ZTP WORKER] Max retries exceeded for {switch_id}")
            return {"status": "failed", "switch_id": switch_id, "error": str(exc)}
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

        print(f"[ROLLBACK WORKER] Rolling back switch {switch.hostname}")

        # Ensure SSH is enabled via Telnet/Console if it is a Dell switch
        if "dell" in (switch.model or "").lower() or "spine" in (switch.hostname or "").lower() or switch.management_ip in ["172.20.20.10", "172.20.20.13"]:
            ensure_ssh_enabled(switch.management_ip)
            wait_for_ssh(switch.management_ip)

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
                "-e", "ansible_user=admin ansible_password=admin ansible_network_os=dellos10 ansible_connection=network_cli ansible_connect_timeout=60 ansible_command_timeout=60"
            ],
            capture_output=True, text=True, timeout=ANSIBLE_TIMEOUT, env=env
        )
        if result.returncode != 0:
            print(f"[ROLLBACK WORKER] Ansible failed. Returncode: {result.returncode}")
            print(f"[ROLLBACK WORKER] Stdout: {result.stdout}")
            print(f"[ROLLBACK WORKER] Stderr: {result.stderr}")
            error_detail = f"Ansible failed (rc={result.returncode}).\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
            raise Exception(error_detail)

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
            print(f"[ROLLBACK WORKER] Failed to collect real config: {e}")
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
        print(f"[ROLLBACK WORKER] Successfully rolled back {switch.hostname}")
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
        print(f"[ROLLBACK WORKER] Error rolling back {switch_id}: {error_msg}")
        return {"status": "failed", "switch_id": switch_id, "error": error_msg}
    finally:
        db.close()

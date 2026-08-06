import asyncio
import logging
import os
import socket
import difflib
from typing import Optional, Dict, Any

from .base import SouthboundNetworkDriver
from .dell_os10_collector import DellOS10Collector, DellOS10CollectorError

logger = logging.getLogger(__name__)

# Error markers OS10 echoes when it rejects a command.
OS10_ERROR_HINTS = (
    "% Error",
    "% Invalid",
    "Invalid input",
    "ERROR:",
    "unknown command",
    "Failed",
    "% Failure",
)

_CONSOLE_PORT = 5000


def _tcp_open(host: str, port: int, timeout: float = 3.0) -> bool:
    """Fast TCP reachability probe — avoids long SSH/auth waits on dead switches."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def connect_os10_collector(host: str, username: str = "admin", password: str = "admin") -> "tuple[DellOS10Collector, str]":
    """Connect a Dell OS10 collector, trying the TCP console first then SSH.

    Mirrors the backup flow in ``sync_tasks``: many deployments expose the
    switch console over TCP on port 5000, while others only accept SSH on
    port 22 (configurable via ``DELL_SSH_USERNAME`` / ``DELL_SSH_PASSWORD`` /
    ``DELL_SSH_PORT``). Raises on total failure.
    """
    ssh_user = os.environ.get("DELL_SSH_USERNAME", "admin")
    ssh_pass = os.environ.get("DELL_SSH_PASSWORD", "admin")
    ssh_port = int(os.environ.get("DELL_SSH_PORT", "22"))

    errors = []
    if _tcp_open(host, _CONSOLE_PORT):
        try:
            collector = DellOS10Collector(host=host, username=username, password=password, port=_CONSOLE_PORT, use_ssh=False)
            collector.connect()
            return collector, "console"
        except Exception as console_err:
            errors.append(f"console:{console_err}")
            logger.info("OS10 console unreachable on %s:%s (%s); trying SSH", host, _CONSOLE_PORT, console_err)
    else:
        logger.info("OS10 console port %s closed on %s; trying SSH", _CONSOLE_PORT, host)

    if not _tcp_open(host, ssh_port):
        raise DellOS10CollectorError(
            f"Connection failed to {host}: console port {_CONSOLE_PORT} closed and SSH port {ssh_port} closed"
        )
    collector = DellOS10Collector(host=host, username=ssh_user, password=ssh_pass, port=ssh_port, use_ssh=True)
    collector.connect()
    return collector, "ssh"


def _push_via_collector(collector: DellOS10Collector, transport: str, config_payload: str) -> dict:
    """Apply a config payload and report whether OS10 accepted every line."""
    try:
        collector._send_command("terminal width 512")
        collector._send_command("configure terminal")
        for line in config_payload.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            out = collector._send_command(line, timeout=20)
            if any(hint in out for hint in OS10_ERROR_HINTS):
                collector._send_command("end")
                return {"success": False, "output": f"OS10 rejected command '{line}':\n{out}", "applied_config": ""}
        collector._send_command("end")
        save_out = collector._send_command("copy running-config startup-config", timeout=60)
        if any(hint in save_out for hint in OS10_ERROR_HINTS):
            return {"success": False, "output": f"Failed to save running-config:\n{save_out}", "applied_config": ""}
        return {"success": True, "output": f"Configuration applied and saved successfully (via {transport}).", "applied_config": config_payload}
    except Exception as e:
        return {"success": False, "output": str(e), "applied_config": ""}


def merge_os10_configs(running: str, candidate_payload: str) -> str:
    """Helper to merge incremental candidate CLI payload into running configuration."""
    def parse_to_dict(config_text: str):
        blocks = {}
        current_block = None
        for line in config_text.splitlines():
            stripped = line.strip()
            if not stripped or stripped == "!":
                continue
            if line.startswith(" ") or line.startswith("\t"):
                if current_block is not None:
                    blocks[current_block].append(stripped)
            else:
                current_block = stripped
                if current_block not in blocks:
                    blocks[current_block] = []
        return blocks

    running_dict = parse_to_dict(running)
    payload_dict = parse_to_dict(candidate_payload)

    for block, sub_commands in payload_dict.items():
        if block.startswith("no "):
            target = block[3:]
            running_dict.pop(target, None)
            running_dict.pop(block, None)
            continue

        if block not in running_dict:
            running_dict[block] = sub_commands
        else:
            existing_subs = list(running_dict[block])
            for sub in sub_commands:
                if sub.startswith("no "):
                    target_sub = sub[3:]
                    existing_subs = [s for s in existing_subs if s != target_sub]
                else:
                    words = sub.split()
                    prefix = words[0] if words else ""
                    if prefix and prefix not in ["switchport", "ip", "no"]:
                        existing_subs = [s for s in existing_subs if not s.startswith(prefix)]
                    if sub not in existing_subs:
                        existing_subs.append(sub)
            running_dict[block] = existing_subs

    merged_lines = []
    for block, sub_commands in running_dict.items():
        merged_lines.append(block)
        for sub in sub_commands:
            merged_lines.append(f" {sub}")
        if sub_commands:
            merged_lines.append("!")

    return "\n".join(merged_lines)


class DellOS10Driver(SouthboundNetworkDriver):
    """
    Dell SmartFabric OS10 driver — config payload generation + live data collection.
    """

    # ------------------------------------------------------------------
    # Configuration payload generators (XML/NETCONF)
    # ------------------------------------------------------------------
    async def generate_vrf_payload(self, vrf_name: str, l3_vni: int) -> str:
        return f"ip vrf {vrf_name}\n exit"

    async def generate_evpn_overlay_payload(
        self, vrf_name: str, vlan_id: int, l2_vni: int, anycast_gw: str
    ) -> str:
        return f"""interface vlan{vlan_id}
 no shutdown
 ip vrf forwarding {vrf_name}
 ip address {anycast_gw}
 exit"""

    async def generate_rollback_payload(self, vrf_name: str, vlan_id: int) -> str:
        return f"no interface vlan{vlan_id}"

    # ------------------------------------------------------------------
    # Live data collection via SSH
    # ------------------------------------------------------------------
    async def collect_all(
        self,
        host: str,
        username: Optional[str] = None,
        password: Optional[str] = None,
        port: int = 22,
    ) -> Dict[str, Any]:
        """Connect (console-then-SSH) and return all inventory, interface, VLAN,
        LAG, VLT, environmental and config data.

        Runs the synchronous collector in a thread-pool so it does not
        block the async event loop.
        """
        def _run() -> Dict[str, Any]:
            collector, _transport = connect_os10_collector(host, username or "admin", password or "admin")
            try:
                return collector.collect_all()
            finally:
                collector.close()

        return await asyncio.to_thread(_run)

    # ------------------------------------------------------------------
    # Config push & validation
    # ------------------------------------------------------------------
    async def push_config(self, host: str, username: str, password: str, config_payload: str) -> dict:
        """Push configuration to a Dell OS10 switch (console-then-SSH)."""
        def _apply():
            try:
                collector, transport = connect_os10_collector(host, username, password)
            except Exception as e:
                return {"success": False, "output": f"Failed to connect to switch {host}: {e}", "applied_config": ""}
            try:
                return _push_via_collector(collector, transport, config_payload)
            finally:
                try:
                    collector.close()
                except Exception:
                    pass

        return await asyncio.to_thread(_apply)

    async def validate_candidate(self, host: str, username: str, password: str, candidate_config: str) -> dict:
        """Validate candidate config by comparing against running config without applying."""
        def _validate():
            try:
                collector, _transport = connect_os10_collector(host, username, password)
            except Exception as e:
                return {"diff": "", "validation_status": "connection_failed", "error_detail": f"Failed to connect: {e}"}
            try:
                running_config = collector.collect_running_config()
                merged_candidate = merge_os10_configs(running_config, candidate_config)
                # Strip out all '!' separator lines and empty lines for a clean diff comparison
                running_clean = "\n".join([line for line in running_config.splitlines() if line.strip() != "!"])
                candidate_clean = "\n".join([line for line in merged_candidate.splitlines() if line.strip() != "!"])
                running_lines = running_clean.splitlines(keepends=True)
                candidate_lines = candidate_clean.splitlines(keepends=True)
                diff = "".join(difflib.unified_diff(running_lines, candidate_lines, fromfile="running", tofile="candidate"))
                return {"diff": diff, "validation_status": "diff_ready" if diff else "identical", "error_detail": ""}
            except Exception as e:
                return {"diff": "", "validation_status": "error", "error_detail": str(e)}
            finally:
                try:
                    collector.close()
                except Exception:
                    pass

        return await asyncio.to_thread(_validate)

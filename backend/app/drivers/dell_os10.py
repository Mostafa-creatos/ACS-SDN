import asyncio
import logging
import difflib
from typing import Optional, Dict, Any

from .base import SouthboundNetworkDriver
from .dell_os10_collector import DellOS10Collector

logger = logging.getLogger(__name__)


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
        return f"""<config>
    <vrf xmlns="http://dellemc.com">
        <name>{vrf_name}</name>
        <vni>{l3_vni}</vni>
    </vrf>
</config>"""

    async def generate_evpn_overlay_payload(
        self, vrf_name: str, vlan_id: int, l2_vni: int, anycast_gw: str
    ) -> str:
        return f"""<config>
    <interfaces xmlns="http://dellemc.com">
        <interface>
            <name>vlan{vlan_id}</name>
            <vrf-member>{vrf_name}</vrf-member>
            <ip-address>{anycast_gw}</ip-address>
            <evpn-overlay-tunnel><vni>{l2_vni}</vni></evpn-overlay-tunnel>
        </interface>
    </interfaces>
</config>"""

    async def generate_rollback_payload(self, vrf_name: str, vlan_id: int) -> str:
        return f"""<config>
    <interfaces xmlns="http://dellemc.com">
        <interface operation="delete">
            <name>vlan{vlan_id}</name>
        </interface>
    </interfaces>
</config>"""

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
        """SSH into the switch and return all inventory, interface, VLAN,
        LAG, VLT, environmental and config data.

        Runs the synchronous collector in a thread-pool so it does not
        block the async event loop.
        """
        def _run() -> Dict[str, Any]:
            with DellOS10Collector(
                host=host,
                username=username or "admin",
                password=password or "admin",
                port=5000,
                use_ssh=False,
            ) as collector:
                return collector.collect_all()

        return await asyncio.to_thread(_run)

    # ------------------------------------------------------------------
    # Config push & validation
    # ------------------------------------------------------------------
    async def push_config(self, host: str, username: str, password: str, config_payload: str) -> dict:
        """Push configuration to a Dell OS10 switch via TCP/console."""
        def _apply():
            with DellOS10Collector(
                host=host,
                username=username,
                password=password,
                port=5000,
                use_ssh=False,
            ) as collector:
                try:
                    collector.connect()
                except Exception as e:
                    return {"success": False, "output": f"Failed to connect to switch: {e}", "applied_config": ""}
                try:
                    collector.send_command("terminal width 512")
                    collector.send_command("configure terminal")
                    for line in config_payload.strip().splitlines():
                        line = line.strip()
                        if line:
                            collector.send_command(line)
                    collector.send_command("end")
                    collector.send_command("copy running-config startup-config")
                    return {"success": True, "output": "Configuration applied successfully", "applied_config": config_payload}
                except Exception as e:
                    return {"success": False, "output": str(e), "applied_config": ""}
                finally:
                    try:
                        collector.send_command("end")
                    except Exception:
                        pass

        return await asyncio.to_thread(_apply)

    async def validate_candidate(self, host: str, username: str, password: str, candidate_config: str) -> dict:
        """Validate candidate config by comparing against running config without applying."""
        def _validate():
            with DellOS10Collector(
                host=host,
                username=username,
                password=password,
                port=5000,
                use_ssh=False,
            ) as collector:
                try:
                    collector.connect()
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

        return await asyncio.to_thread(_validate)

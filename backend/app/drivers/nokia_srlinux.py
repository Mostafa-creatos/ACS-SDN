import re
import socket
import time

from .base import SouthboundNetworkDriver

_ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
_SSH_PORT = 22

_ERROR_HINTS = (
    "Error:",
    "ERROR:",
    "error:",
    "invalid",
    "Invalid",
    "Parsing error",
    "Unknown token",
    "syntax error",
    "unknown command",
    "command not found",
    "not found",
)


def _clean(text: str) -> str:
    text = _ANSI_RE.sub("", text)
    return text.replace("\r", "")


def _srlinux_read_until_prompt(channel, timeout: float = 15.0, max_chunk: int = 65536) -> str:
    """Read from an SR Linux interactive channel until the CLI prompt is seen.

    SR Linux echoes every keystroke, so a command we send appears in the
    stream before its output. We keep reading until a line that ends with the
    prompt marker (``#``) is observed, which guarantees the CLI finished
    processing the previous command. Handles ``--More--`` paging by sending a
    space, and tolerates slow login banners via the timeout.
    """
    buf = ""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if not channel.recv_ready():
                time.sleep(0.15)
                continue
            chunk = channel.recv(max_chunk).decode("utf-8", errors="ignore")
        except Exception:
            break
        buf += chunk
        # The real device appends ANSI cursor-control sequences (bracketed
        # paste mode, cursor movement) after the prompt marker, so the raw
        # last line never ends with '#' or '>'. Strip escapes before checking.
        clean = _clean(buf)
        if "--more--" in buf.lower() or "--more--" in clean.lower():
            try:
                channel.send(" ")
            except Exception:
                pass
            time.sleep(0.1)
            continue
        last_line = clean.rstrip("\n").splitlines()
        if last_line and last_line[-1].rstrip().endswith(("#", ">")):
            return buf
    return buf


def _discard_candidate(channel) -> None:
    """Best-effort reset of the shared candidate so a later run starts clean.

    ``commit now`` already exits candidate mode; discarding an empty candidate
    is a no-op. Handles the non-interactive ``discard now`` as well as the
    confirmation prompt that ``discard`` may raise.
    """
    try:
        channel.send("discard now\n")
        out = _srlinux_read_until_prompt(channel, timeout=8)
        if "not found" in out.lower() or "invalid" in out.lower() or "Error:" in out:
            channel.send("discard\n")
            out = _srlinux_read_until_prompt(channel, timeout=8)
            if "?" in out and "discard" in out.lower():
                channel.send("y\n")
                _srlinux_read_until_prompt(channel, timeout=8)
    except Exception:
        pass


def _has_error(text: str) -> bool:
    return any(hint in text for hint in _ERROR_HINTS)


def _tcp_open(host: str, port: int = _SSH_PORT, timeout: float = 3.0) -> bool:
    """Fast TCP reachability probe — avoids long SSH banner/auth waits on dead switches."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


class NokiaSrlinuxDriver(SouthboundNetworkDriver):
    """
    Southbound Network Driver for Nokia SR Linux.
    Generates configuration commands and rollbacks matching SRLinux CLI syntax.
    """
    async def generate_vrf_payload(self, vrf_name: str, l3_vni: int) -> str:
        return (
            f"/ network-instance {vrf_name}\n"
            f"  type ip-vrf\n"
            f"  vxlan-interface vxlan-1.{l3_vni}\n"
            f"  protocols bgp-evpn bgp-group evpn admin-state enable\n"
        )

    async def generate_evpn_overlay_payload(self, vrf_name: str, vlan_id: int, l2_vni: int, anycast_gw: str) -> str:
        return (
            f"/ interface vlan-{vlan_id}\n"
            f"  subinterface 0\n"
            f"    ipv4 address {anycast_gw} anycast-gw true\n"
            f"/ network-instance {vrf_name}\n"
            f"  interface vlan-{vlan_id}.0\n"
        )

    async def generate_rollback_payload(self, vrf_name: str, vlan_id: int) -> str:
        return (
            f"/ delete interface vlan-{vlan_id}\n"
            f"/ network-instance {vrf_name}\n"
            f"  delete interface vlan-{vlan_id}.0\n"
        )

    async def push_config(self, host: str, username: str, password: str, config_payload: str) -> dict:
        """Push configuration to a Nokia SR Linux switch via SSH CLI.

        Waits for the CLI prompt after every command (SR Linux applies each
        config line transactionally, so sending commands faster than the CLI
        can process them produces ``There is a commit already in progress``).
        Recovers from a stale shared candidate left behind by a previous
        failed run and always discards on error so retries start clean.
        """
        import paramiko

        def _apply():
            if not _tcp_open(host):
                return {"success": False, "output": f"Failed to connect to Nokia switch ({host}:22): TCP probe failed (port 22 closed)", "applied_config": ""}
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            channel = None
            entered_candidate = False
            try:
                client.connect(
                    host, port=22,
                    username=username, password=password,
                    timeout=20, banner_timeout=30, auth_timeout=30,
                    look_for_keys=False, allow_agent=False,
                )
                channel = client.invoke_shell(width=512, height=1000)
                channel.settimeout(5)

                output_lines = [_clean(_srlinux_read_until_prompt(channel, timeout=25))]

                # Enter candidate mode (required for making changes).
                channel.send("enter candidate\n")
                out = _srlinux_read_until_prompt(channel, timeout=15)
                output_lines.append(_clean(out))

                # A previous failed run may have left the shared candidate dirty.
                if "Candidate" in out and "not empty" in out:
                    _discard_candidate(channel)
                    channel.send("enter candidate\n")
                    out = _srlinux_read_until_prompt(channel, timeout=15)
                    output_lines.append(_clean(out))

                entered_candidate = "* candidate" in out

                # Apply config commands one at a time, waiting for the prompt.
                for line in config_payload.strip().splitlines():
                    cmd = line.strip()
                    if not cmd:
                        continue
                    channel.send(cmd + "\n")
                    out = _srlinux_read_until_prompt(channel, timeout=20)
                    output_lines.append(_clean(out))

                    # The CLI may still be settling into candidate mode; retry once.
                    if "already in progress" in out:
                        time.sleep(1.5)
                        channel.send(cmd + "\n")
                        out = _srlinux_read_until_prompt(channel, timeout=20)
                        output_lines.append(_clean(out))

                    if _has_error(out):
                        full = "\n".join(output_lines)
                        _discard_candidate(channel)
                        return {"success": False, "output": full, "applied_config": config_payload}

                channel.send("commit now\n")
                out = _srlinux_read_until_prompt(channel, timeout=30)
                output_lines.append(_clean(out))

                full = "\n".join(output_lines)
                success = not _has_error(full)
                return {"success": success, "output": full, "applied_config": config_payload}
            except Exception as e:
                return {"success": False, "output": f"Failed to connect to Nokia switch ({host}:22): {e}", "applied_config": ""}
            finally:
                try:
                    if channel is not None and entered_candidate:
                        _discard_candidate(channel)
                except Exception:
                    pass
                try:
                    if channel is not None:
                        channel.close()
                except Exception:
                    pass
                try:
                    client.close()
                except Exception:
                    pass

        import asyncio
        return await asyncio.to_thread(_apply)

    async def fetch_config(self, host: str, username: str, password: str) -> str:
        """Fetch the running configuration from a Nokia SR Linux switch via SSH CLI.

        Raises ``ConnectionError`` when the switch is unreachable so callers can
        distinguish a genuinely missing config from a transport failure.
        """
        import paramiko

        def _fetch():
            if not _tcp_open(host):
                raise ConnectionError(f"Unable to connect to Nokia switch at {host}:22 (TCP probe failed, port closed)")
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            try:
                client.connect(
                    host, port=22,
                    username=username, password=password,
                    timeout=20, banner_timeout=30, auth_timeout=30,
                    look_for_keys=False, allow_agent=False,
                )
                channel = client.invoke_shell(width=512, height=1000)
                channel.settimeout(5)
                # Wait for the real prompt before sending anything — typing into
                # the still-streaming login banner mangles the command.
                _srlinux_read_until_prompt(channel, timeout=25)

                channel.send("info from running\n")
                out = _srlinux_read_until_prompt(channel, timeout=30)
                while channel.recv_ready():
                    out += channel.recv(65536).decode("utf-8", errors="ignore")

                clean = _clean(out)
                lines = clean.splitlines()
                # Drop echoed command line and trailing prompt.
                if lines and "info from running" in lines[0]:
                    lines.pop(0)
                while lines and not lines[0].strip():
                    lines.pop(0)
                while lines and (lines[-1].strip().endswith("#") or lines[-1].strip().endswith(">")):
                    lines.pop()
                return "\n".join(lines)
            except Exception as e:
                raise ConnectionError(f"Unable to connect to Nokia switch at {host}:22 ({e})") from e
            finally:
                try:
                    client.close()
                except Exception:
                    pass

        import asyncio
        return await asyncio.to_thread(_fetch)

    async def validate_candidate(self, host: str, username: str, password: str, candidate_config: str) -> dict:
        """Validate candidate config by comparing against running config without applying."""
        import paramiko

        def _validate():
            if not _tcp_open(host):
                return {"diff": "", "validation_status": "error", "error_detail": f"TCP probe failed (port 22 closed on {host})"}
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            try:
                client.connect(
                    host, port=22,
                    username=username, password=password,
                    timeout=20, banner_timeout=30, auth_timeout=30,
                    look_for_keys=False, allow_agent=False,
                )
                shell = client.invoke_shell(width=512, height=1000)
                shell.settimeout(5)
                _srlinux_read_until_prompt(shell, timeout=25)
                shell.send("info from running\n")
                running_config = _srlinux_read_until_prompt(shell, timeout=30)

                import difflib
                running_lines = running_config.splitlines(keepends=True)
                candidate_lines = candidate_config.splitlines(keepends=True)
                diff = "".join(difflib.unified_diff(running_lines, candidate_lines, fromfile="running", tofile="candidate"))
                return {"diff": diff, "validation_status": "diff_ready" if diff else "identical", "error_detail": ""}
            except Exception as e:
                return {"diff": "", "validation_status": "error", "error_detail": str(e)}
            finally:
                try:
                    client.close()
                except Exception:
                    pass

        import asyncio
        return await asyncio.to_thread(_validate)

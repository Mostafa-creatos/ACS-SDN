from .base import SouthboundNetworkDriver

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
        Must enter candidate config mode first, then commit."""
        import paramiko
        def _apply():
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            try:
                client.connect(host, port=22, username=username, password=password, timeout=15, look_for_keys=False)
                shell = client.invoke_shell()
                import time
                time.sleep(2)
                # Drain login banner
                if shell.recv_ready():
                    shell.recv(65536)

                output_lines = []

                # Enter candidate config mode (required for making changes)
                shell.send("enter candidate\n")
                time.sleep(1)
                chunk = shell.recv(65536).decode("utf-8", errors="ignore")
                output_lines.append(chunk)

                # Send config commands
                for line in config_payload.strip().splitlines():
                    cmd = line.strip()
                    if not cmd:
                        continue
                    shell.send(cmd + "\n")
                    time.sleep(0.5)
                    if shell.recv_ready():
                        chunk = shell.recv(65536).decode("utf-8", errors="ignore")
                        output_lines.append(chunk)

                # Commit changes (also exits candidate mode)
                shell.send("commit now\n")
                time.sleep(2)
                if shell.recv_ready():
                    chunk = shell.recv(65536).decode("utf-8", errors="ignore")
                    output_lines.append(chunk)

                full_output = "\n".join(output_lines)
                import re as _re
                ansi_re = _re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
                clean_output = ansi_re.sub("", full_output)
                clean_output = clean_output.replace("\r", "")
                error_indicators = [
                    "Error:", "ERROR:", "error:", "invalid", "Invalid",
                    "Parsing error", "Unknown token", "syntax error", "unknown command"
                ]
                has_error = any(ind in clean_output for ind in error_indicators)
                return {
                    "success": not has_error,
                    "output": clean_output,
                    "applied_config": config_payload
                }
            except Exception as e:
                return {"success": False, "output": f"Failed to connect to Nokia switch: {e}", "applied_config": ""}
            finally:
                client.close()

        import asyncio
        return await asyncio.to_thread(_apply)

    async def fetch_config(self, host: str, username: str, password: str) -> str:
        """Fetch the running configuration from a Nokia SR Linux switch via SSH CLI."""
        import paramiko
        def _fetch():
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            try:
                client.connect(host, port=22, username=username, password=password, timeout=15, look_for_keys=False)
                shell = client.invoke_shell()
                import time
                time.sleep(2)
                if shell.recv_ready():
                    shell.recv(65536)
                shell.send("info from running\n")
                time.sleep(3)
                chunks = []
                while shell.recv_ready():
                    chunks.append(shell.recv(65536).decode("utf-8", errors="ignore"))
                    time.sleep(0.3)
                output = "".join(chunks)
                shell.send("quit\n")
                time.sleep(0.5)
                import re as _re
                ansi_re = _re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
                clean = ansi_re.sub("", output).replace("\r", "")
                return clean
            except Exception as e:
                return f"! Failed to fetch Nokia config: {e}"
            finally:
                client.close()

        import asyncio
        return await asyncio.to_thread(_fetch)

    async def validate_candidate(self, host: str, username: str, password: str, candidate_config: str) -> dict:
        """Validate candidate config by comparing against running config without applying."""
        import paramiko
        def _validate():
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            try:
                client.connect(host, port=22, username=username, password=password, timeout=15, look_for_keys=False)
                shell = client.invoke_shell()
                import time
                time.sleep(1)
                if shell.recv_ready():
                    shell.recv(65536)

                shell.send("show running-config\n")
                time.sleep(2)
                running_config = shell.recv(65536).decode("utf-8", errors="ignore") if shell.recv_ready() else ""
                shell.send("quit\n")
                time.sleep(0.5)

                import difflib
                running_lines = running_config.splitlines(keepends=True)
                candidate_lines = candidate_config.splitlines(keepends=True)
                diff = "".join(difflib.unified_diff(running_lines, candidate_lines, fromfile="running", tofile="candidate"))
                return {"diff": diff, "validation_status": "diff_ready" if diff else "identical", "error_detail": ""}
            except Exception as e:
                return {"diff": "", "validation_status": "error", "error_detail": str(e)}
            finally:
                client.close()

        import asyncio
        return await asyncio.to_thread(_validate)

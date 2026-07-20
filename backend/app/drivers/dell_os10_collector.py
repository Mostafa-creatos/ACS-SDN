"""
SSH-based collector for Dell SmartFabric OS10 switches.

Connects via SSH, executes CLI show commands, and returns structured
dictionaries matching the DB models in models.py.
"""
import re
import time
import socket
import logging
import uuid
import sys
from typing import Optional, Dict, Any, List, Tuple

logger = logging.getLogger(__name__)


class DellOS10CollectorError(Exception):
    pass


class DellOS10Collector:
    """Collects live inventory, hardware, VLAN, LAG, VLT and config data
    from a Dell OS10 switch via SSH (or raw TCP console fallback)."""

    def __init__(
        self,
        host: str,
        username: str = "admin",
        password: str = "admin",
        port: int = 5000,
        use_ssh: bool = False,
        connect_timeout: int = 10,
        command_timeout: int = 15,
    ):
        self.host = host
        self.username = username
        self.password = password
        self.port = port
        self.use_ssh = use_ssh
        self.connect_timeout = connect_timeout
        self.command_timeout = command_timeout
        self._client = None
        self._channel = None

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------
    def connect(self) -> None:
        """Open an SSH (paramiko) or raw-TCP console session."""
        if self.use_ssh:
            self._connect_ssh()
        else:
            self._connect_console()

    def _connect_ssh(self) -> None:
        import paramiko

        self._client = paramiko.SSHClient()
        self._client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            self._client.connect(
                self.host,
                port=self.port,
                username=self.username,
                password=self.password,
                timeout=self.connect_timeout,
                banner_timeout=30,
                auth_timeout=30,
                look_for_keys=False,
                allow_agent=False,
            )
            self._channel = self._client.invoke_shell(width=512, height=999)
            self._channel.settimeout(self.command_timeout)
            self._flush_until_prompt(timeout=3)
            self._send_command("terminal length 0")
        except Exception as exc:
            raise DellOS10CollectorError(
                f"SSH connection failed to {self.host}:{self.port}: {exc}"
            ) from exc

    def _connect_console(self) -> None:
        self._client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._client.settimeout(self.connect_timeout)
        try:
            self._client.connect((self.host, self.port))
            self._client.settimeout(self.command_timeout)
            
            # Send Ctrl+C and Enter to break out of any stuck state or pager
            self._client.send(b"\x03\r\n")
            time.sleep(0.5)
            
            # Read initial buffer to detect login prompt
            buf = ""
            start_time = time.time()
            while time.time() - start_time < 3:
                try:
                    chunk = self._recv(4096)
                    if not chunk:
                        break
                    buf += chunk
                    if "login:" in buf or "Password:" in buf or "spine-" in buf or "#" in buf or ">" in buf:
                        break
                except socket.timeout:
                    break
                    
            # Send Enter to provoke prompt if empty
            if not buf.strip():
                self._client.send(b"\r\n")
                time.sleep(0.5)
                while time.time() - start_time < 3:
                    try:
                        chunk = self._recv(4096)
                        buf += chunk
                        if "login:" in buf or "Password:" in buf or "spine-" in buf or "#" in buf or ">" in buf:
                            break
                    except socket.timeout:
                        break

            # Handle login prompts if they appear
            if "login:" in buf:
                # Send username
                self._client.send(f"{self.username}\n".encode("utf-8"))
                time.sleep(0.5)
                # Read until password prompt
                p_buf = ""
                p_start = time.time()
                while time.time() - p_start < 2:
                    try:
                        chunk = self._recv(4096)
                        p_buf += chunk
                        if "Password:" in p_buf:
                            break
                    except socket.timeout:
                        break
                # Send password
                self._client.send(f"{self.password}\n".encode("utf-8"))
                time.sleep(1.0)
                
            # Send end to make sure we are in exec mode and not config mode
            self._client.send(b"end\n")
            time.sleep(0.5)
            # Send terminal length 0 to prevent --More-- pagination
            self._client.send(b"terminal length 0\n")
            time.sleep(0.5)
            
            # Flush the buffer
            try:
                self._client.settimeout(0.1)
                while self._recv(8192):
                    pass
            except socket.timeout:
                pass
                
            self._client.settimeout(self.command_timeout)
        except Exception as exc:
            raise DellOS10CollectorError(
                f"Console connection failed to {self.host}:{self.port}: {exc}"
            ) from exc


    def _flush_until_prompt(self, timeout: float = 2) -> str:
        """Read until the channel goes silent (up to *timeout* seconds)."""
        buf = ""
        deadline = time.time() + timeout
        if self._channel:
            self._channel.settimeout(0.2)
        while time.time() < deadline:
            try:
                chunk = self._recv(4096)
                if not chunk:
                    break
                buf += chunk
                stripped = buf.strip()
                if stripped.endswith("#") or stripped.endswith(">") or "login:" in stripped or "Password:" in stripped:
                    break
            except socket.timeout:
                break
            except Exception:
                break
        return buf

    def _recv(self, n: int = 8192) -> str:
        if self.use_ssh:
            return self._channel.recv(n).decode("utf-8", errors="replace")
        return self._client.recv(n).decode("utf-8", errors="replace")

    def _send(self, data: bytes) -> None:
        if self.use_ssh:
            self._channel.send(data)
        else:
            self._client.send(data)

    def _send_command(self, cmd: str, timeout: Optional[float] = None) -> str:
        """Execute a command and return the full output."""
        timeout = timeout or self.command_timeout
        self._send(f"{cmd}\n".encode("utf-8"))
        time.sleep(0.3)
        out = ""
        deadline = time.time() + timeout
        if self._channel:
            self._channel.settimeout(0.2)
        while time.time() < deadline:
            try:
                chunk = self._recv(8192)
                if not chunk:
                    break
                out += chunk
                stripped = out.strip()
                if stripped.endswith("#") or stripped.endswith(">"):
                    break
            except socket.timeout:
                break
            except Exception:
                break
        return out.replace("\r\n", "\n")

    def close(self) -> None:
        try:
            if self._channel:
                self._channel.close()
        except Exception:
            pass
        try:
            if self._client:
                self._client.close()
        except Exception:
            pass
        self._client = None
        self._channel = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *args):
        self.close()

    # ------------------------------------------------------------------
    # Collectors – each returns a dict or list ready for DB insertion
    # ------------------------------------------------------------------
    def collect_system(self) -> Dict[str, Any]:
        """Parse `show system` for OS10 system metadata."""
        raw = self._send_command("show system")
        result: Dict[str, Any] = {}
        for line in raw.splitlines():
            line = line.strip()
            if ":" not in line:
                continue
            key, _, val = line.partition(":")
            key = key.strip().lower().replace(" ", "_")
            val = val.strip()
            if not val:
                continue
            # Map known keys to our model fields
            if key == "system_type":
                result["model"] = val
            elif key == "service_tag":
                result["service_tag"] = val
            elif key == "part_number":
                result["part_number"] = val
            elif key == "serial_number":
                result["serial_number"] = val
            elif key.startswith("mac"):
                result["management_mac"] = val
            elif key == "os_version":
                result["os_version"] = val
            elif key == "up_time":
                result["uptime"] = val
            elif key == "express_service_code":
                result["express_service_code"] = val
            elif key == "system_mode":
                result["os10_license_status"] = val
        return result

    def collect_version(self) -> Dict[str, str]:
        """Parse `show version` for OS version details (fallback)."""
        raw = self._send_command("show version")
        result: Dict[str, str] = {}
        for line in raw.splitlines():
            line = line.strip()
            if ":" not in line:
                continue
            key, _, val = line.partition(":")
            key = key.strip().lower().replace(" ", "_")
            val = val.strip()
            if not val:
                continue
            if key == "os_version":
                result["os_version"] = val
        return result

    def collect_uptime(self) -> str:
        """Parse `show uptime` to get the exact uptime."""
        raw = self._send_command("show uptime")
        # Example output:
        # 00:57:59
        for line in raw.splitlines():
            stripped = line.strip()
            # If the line contains a timestamp-like string (e.g. 01:06:38, or 1 week, 2 days), we can just take the first non-empty line that isn't the command echo
            if stripped and "show" not in stripped and "uptime" not in stripped and "#" not in stripped and ">" not in stripped:
                return stripped
        return ""

    def collect_inventory(self) -> List[Dict[str, Any]]:
        """Parse `show inventory` into hardware components list."""
        raw = self._send_command("show inventory")
        components: List[Dict[str, Any]] = []

        # Check if we have the tabular format
        if "Unit Type" in raw and "Piece Part ID" in raw:
            table_started = False
            for line in raw.splitlines():
                stripped = line.strip()
                if not stripped:
                    continue
                if "Unit Type" in line and "Piece Part ID" in line:
                    table_started = True
                    continue
                if table_started and line.startswith("---"):
                    continue
                if table_started:
                    line_clean = line
                    if line_clean.strip().startswith("*"):
                        line_clean = line_clean.replace("*", " ", 1)
                        
                    match = re.match(r'^\s*(\d+)\s+(\S+)(.*)$', line_clean)
                    if match:
                        unit_id = match.group(1)
                        unit_type_raw = match.group(2)
                        rest = match.group(3).strip()
                        
                        ppid = ""
                        svc_tag = ""
                        
                        ppid_match = re.search(r'([A-Z0-9]{2}-[A-Z0-9]{6}-\d{5}-[A-Z0-9]{3}-[A-Z0-9]{4})', rest)
                        if ppid_match:
                            ppid = ppid_match.group(1)
                            
                        fields = [f.strip() for f in rest.split() if f.strip()]
                        for f in fields:
                            if f != ppid and len(f) == 7 and f.isalnum():
                                svc_tag = f
                                break
                                
                        ut_lower = unit_type_raw.lower()
                        if "pwr" in ut_lower or "power" in ut_lower:
                            comp_type = "psu"
                        elif "fan" in ut_lower:
                            comp_type = "fan"
                        elif "chassis" in ut_lower or "vm" in ut_lower:
                            comp_type = "chassis"
                        else:
                            comp_type = "chassis"
                            
                        components.append({
                            "component_id": str(uuid.uuid4()) if 'uuid' in sys.modules else "",
                            "component_type": comp_type,
                            "slot_label": f"Unit {unit_id} - {unit_type_raw}",
                            "part_number": unit_type_raw,
                            "ppid": ppid,
                            "service_tag": svc_tag,
                            "status": "ok",
                            "detail": f"Dell OS10 System Component: {unit_type_raw}",
                            "numeric_value": None
                        })
            return components

        current: Optional[Dict[str, Any]] = None
        for line in raw.splitlines():
            stripped = line.strip()
            if not stripped:
                if current:
                    components.append(current)
                    current = None
                continue

            header_match = re.match(
                r"^(Chassis|Slot\s+\d+|Expansion\s+\S+|Module\s+\S+)\s*:*\s*$",
                stripped,
                re.IGNORECASE,
            )
            if header_match:
                if current:
                    components.append(current)
                label = header_match.group(1).strip()
                component_type = "chassis" if "chassis" in label.lower() else "linecard"
                current = {
                    "component_type": component_type,
                    "slot_label": label,
                    "part_number": "",
                    "ppid": "",
                    "service_tag": "",
                    "status": "ok",
                    "detail": "",
                    "numeric_value": None,
                }
                continue

            if current is None:
                continue

            if ":" in stripped:
                k, _, v = stripped.partition(":")
                k = k.strip().lower().replace(" ", "_")
                v = v.strip()
                if k == "part_number":
                    current["part_number"] = v

                elif k == "ppid":
                    current["ppid"] = v
                elif k == "service_tag":
                    current["service_tag"] = v
                elif k == "description":
                    current["detail"] = v

        if current:
            components.append(current)

        # Fallback: Parse fixed-width tabular format (e.g. S6010-VM / S5248F-ON VM)
        if not components:
            for line in raw.splitlines():
                if len(line) < 30:
                    continue
                # Match lines starting with optional * then a number (Unit index)
                if re.match(r"^\s*\*?\s*\d+\s+", line):
                    unit_type = line[0:30].strip()
                    # Strip the unit number (e.g. "* 1 " or "1 ") to get actual device name
                    device_name = re.sub(r"^\*?\s*\d+\s+", "", unit_type).strip()
                    
                    ppid = line[48:74].strip() if len(line) >= 74 else ""
                    svc_tag = line[74:83].strip() if len(line) >= 83 else ""
                    
                    # Determine type
                    lower_name = device_name.lower()
                    if "pwr" in lower_name or "power" in lower_name:
                        comp_type = "psu"
                    elif "fan" in lower_name:
                        comp_type = "fan_tray"
                    else:
                        comp_type = "chassis"
                        
                    components.append({
                        "component_type": comp_type,
                        "slot_label": device_name,
                        "part_number": device_name, # Fallback part number
                        "ppid": ppid,
                        "service_tag": svc_tag,
                        "status": "ok",
                        "detail": f"{device_name} hardware module",
                        "numeric_value": None,
                    })

        return components

    def collect_environment(self) -> Dict[str, Any]:
        """Parse `show environment` for temperature, fans, PSUs."""
        raw = self._send_command("show environment")
        result: Dict[str, Any] = {
            "temperature_sensors": [],
            "fans": [],
            "power_supplies": [],
        }
        section: Optional[str] = None

        for line in raw.splitlines():
            stripped = line.strip()
            if not stripped:
                continue

            # Section detection
            lower_line = stripped.lower()
            if "temperature" in lower_line and ("sensor" in lower_line or "unit" in lower_line):
                if "-" not in stripped:
                    section = "temperature"
                    continue
            elif "fan" in lower_line and ("status" in lower_line or "speed" in lower_line):
                if "-" not in stripped:
                    section = "fan"
                    continue
            elif "power supply" in lower_line or "psu" in lower_line:
                if "-" not in stripped:
                    section = "psu"
                    continue

            # Skip dashed separator lines
            if re.match(r"^[\s\-]+$", stripped):
                continue
            # Skip header lines
            if any(
                h in stripped.lower()
                for h in ["unit", "status", "temperature", "speed", "type", "input", "output"]
            ):
                if re.match(r"^[\s\w()/]+$", stripped):
                    continue

            # Parse data rows
            parts = stripped.split()
            if section == "temperature" and len(parts) >= 3 and parts[0].isdigit():
                try:
                    val = float(parts[2].replace("C", "").replace("c", ""))
                except ValueError:
                    val = 0.0
                result["temperature_sensors"].append({
                    "slot_label": f"Temp-{parts[0]}",
                    "status": parts[1].lower(),
                    "numeric_value": val,
                    "detail": f"{val}C" if val else "Normal",
                })
            elif section == "fan" and len(parts) >= 3 and parts[0].isdigit():
                try:
                    rpm = float(parts[2].replace(",", "").replace("RPM", "").replace("rpm", ""))
                except ValueError:
                    rpm = 0.0
                result["fans"].append({
                    "slot_label": f"Fan-{parts[0]}",
                    "status": parts[1].lower(),
                    "numeric_value": rpm,
                    "detail": f"{int(rpm)} RPM" if rpm else "N/A",
                })
            elif section == "psu" and len(parts) >= 2 and parts[0].isdigit():
                result["power_supplies"].append({
                    "slot_label": f"PSU-{parts[0]}",
                    "status": parts[1].lower(),
                    "detail": " ".join(parts[2:]),
                    "numeric_value": None,
                })

        return result

    def collect_interfaces(self) -> List[Dict[str, Any]]:
        """Parse `show interface status` into interface list."""
        raw = self._send_command("show interface status")
        interfaces: List[Dict[str, Any]] = []
        header_passed = False

        for line in raw.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            # Skip the dashed separator line (both OS10 and FTOS formats)
            if re.match(r"^[-]{10,}$", stripped):
                header_passed = True
                continue

            if not header_passed:
                continue

            # Skip header column text
            if stripped.startswith("Port") or stripped.startswith("Loc PortID"):
                continue

            # Strip leading/trailing pipes (FTOS format)
            stripped = stripped.strip("|")

            # FTOS pipe-delimited format: Eth 1/1/1  desc  up  40G  full  A  1  -
            # OS10 whitespace format:    ethernet1/1/1  desc  up  40G  full  9217
            # Both can be parsed by splitting on whitespace
            parts = stripped.split()

            if len(parts) < 5:
                continue

            # Normalize port name
            name_parts = []
            if parts[0].lower() == "eth":
                name_parts = parts[1:]
            elif parts[0].lower().startswith("ethernet"):
                name_parts = parts
            else:
                name_parts = parts

            port_field = name_parts[0]
            if not port_field.startswith("ethernet") and not port_field.startswith("port-channel"):
                port_field = f"ethernet{port_field}"

            name = port_field.lower()

            # For FTOS: Eth 1/1/1  ""  up  40G  full  A  1  -
            # parts: ['Eth', '1/1/1', 'up', '40G', 'full', 'A', '1', '-']
            # or OS10: ethernet1/1/1  desc  up  40G  full  9217
            desc_offset = 1 if parts[0].lower() == "eth" else 0
            # In OS10 format: parts[1] is desc, parts[2] is status, etc.
            # In FTOS: after Eth 1/1/1, parts[2] (index 2) is status

            # Determine position offset based on whether "Eth" prefix is present
            if parts[0].lower() == "eth":
                # FTOS format with description: Eth 1/1/1  desc  up  40G  full  A  Vlan  -
                # FTOS format without desc:    Eth 1/1/1         up  40G  full  A  1    -
                if len(parts) >= 9:
                    desc = parts[2]
                    status_idx = 3
                    speed_idx = 4
                    duplex_idx = 5
                    vlan_idx = 7
                else:
                    desc = ""
                    status_idx = 2
                    speed_idx = 3
                    duplex_idx = 4
                    vlan_idx = -1
            else:
                # OS10 format: ethernet1/1/1  desc  up  40G  full  mtu
                desc = parts[1] if len(parts) > 1 else ""
                status_idx = 2
                speed_idx = 3
                duplex_idx = 4
                vlan_idx = -1

            if status_idx >= len(parts):
                continue

            status = parts[status_idx].lower() if status_idx < len(parts) else "down"
            speed = parts[speed_idx] if speed_idx < len(parts) else "0"
            duplex = parts[duplex_idx] if duplex_idx < len(parts) else "full"

            mtu = 9216
            vlan = parts[vlan_idx] if vlan_idx >= 0 and vlan_idx < len(parts) else ""

            interfaces.append({
                "name": name,
                "status": status,
                "speed_duplex": f"{speed} / {duplex.capitalize()}",
                "vlan": vlan,
                "description": desc,
                "switchport_mode": "trunk",
                "transceiver_type": None,
                "transceiver_serial": None,
                "transceiver_qualified": None,
                "mtu": mtu,
                "neighbor": None,
                "errors_in": 0,
                "errors_out": 0,
                "discards_in": 0,
                "discards_out": 0,
                "mac_address": None,
            })

        return interfaces

    def collect_mac_table(self) -> List[Dict[str, Any]]:
        """Parse `show mac address-table` into list of {mac, interface} dicts."""
        raw = self._send_command("show mac address-table")
        entries = []
        header_passed = False
        for line in raw.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("VlanId") or stripped.startswith("Codes"):
                header_passed = True
                continue
            if stripped.startswith("spine") or stripped.startswith("Loc Port"):
                continue
            if not header_passed:
                continue
            parts = stripped.split()
            if len(parts) >= 4:
                mac = parts[1]
                intf = parts[3]
                if mac.count(":") == 5:
                    entries.append({"mac_address": mac.lower(), "interface": intf.lower()})
        return entries

    def collect_transceivers(self) -> Dict[str, Dict[str, Any]]:
        """Parse `show interface transceiver` into {port_name: info} dict."""
        raw = self._send_command("show interface transceiver")
        transceivers: Dict[str, Dict[str, Any]] = {}
        header_passed = False

        for line in raw.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if re.match(r"^[-]+\s+[-]+\s+[-]+\s+[-]+$", stripped):
                header_passed = True
                continue
            if not header_passed:
                continue

            # Port     Type               Serial         Qualified
            parts = stripped.split()
            if len(parts) >= 4:
                port = parts[0].lower()
                transceivers[port] = {
                    "transceiver_type": parts[1],
                    "transceiver_serial": parts[2],
                    "transceiver_qualified": parts[3].lower() == "yes",
                }

        return transceivers

    def collect_vlans(self) -> List[Dict[str, Any]]:
        """Parse `show vlan` into VLAN list."""
        raw = self._send_command("show vlan")
        vlans: List[Dict[str, Any]] = []
        header_passed = False

        for line in raw.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("Codes") or "Q:" in stripped:
                continue
            if "NUM" in stripped and "Status" in stripped:
                header_passed = True
                continue
            if not header_passed:
                continue
            
            line_clean = stripped
            if line_clean.startswith("*") or line_clean.startswith("M"):
                line_clean = line_clean[1:].strip()
                
            parts = [p.strip() for p in re.split(r'\s{2,}', line_clean) if p.strip()]
            if parts and parts[0].isdigit():
                vlan_id = int(parts[0])
                status = "active"
                name = ""
                member_ports = []
                
                if len(parts) >= 2:
                    status_candidate = parts[1].lower()
                    if "active" in status_candidate:
                        status = "active"
                    elif "suspended" in status_candidate:
                        status = "suspended"
                        
                ports_field = ""
                if len(parts) >= 3:
                    last_part = parts[-1]
                    if any(x in last_part for x in ["Eth", "port-channel", "Gigabit", "TenGigabit", "fortyGigabit"]):
                        ports_field = last_part
                        if len(parts) == 4:
                            name = parts[2]
                    else:
                        name = parts[2]
                elif len(parts) == 2 and any(x in parts[1] for x in ["Eth", "port-channel"]):
                    ports_field = parts[1]
                    
                if ports_field.startswith("A ") or ports_field.startswith("T "):
                    ports_field = ports_field[2:].strip()
                    
                if ports_field:
                    for part in ports_field.split(","):
                        part = part.strip()
                        full_range_match = re.match(r"^(.*?)([0-9/]+)-([0-9/]+)$", part)
                        if full_range_match:
                            prefix = full_range_match.group(1)
                            start_str = full_range_match.group(2)
                            end_str = full_range_match.group(3)
                            if "/" in start_str and "/" in end_str:
                                s_parts = start_str.split("/")
                                e_parts = end_str.split("/")
                                if len(s_parts) == 3 and len(e_parts) == 3:
                                    start_num = int(s_parts[-1])
                                    end_num = int(e_parts[-1])
                                    base_prefix = f"{prefix}{s_parts[0]}/{s_parts[1]}/"
                                    for i in range(start_num, end_num + 1):
                                        member_ports.append(f"{base_prefix}{i}")
                            else:
                                try:
                                    start_num = int(start_str.split("/")[-1])
                                    end_num = int(end_str)
                                    base_prefix = part.split("-")[0]
                                    base_prefix = re.sub(r'\d+$', '', base_prefix)
                                    for i in range(start_num, end_num + 1):
                                        member_ports.append(f"{base_prefix}{i}")
                                except:
                                    member_ports.append(part)
                        else:
                            member_ports.append(part)
                            
                vlans.append({
                    "vlan_id": vlan_id,
                    "name": name or f"VLAN_{vlan_id}",
                    "status": status,
                    "member_ports": member_ports,
                })

        return vlans


    def collect_lags(self) -> List[Dict[str, Any]]:
        """Parse `show interface port-channel summary` into LAG list."""
        raw = self._send_command("show interface port-channel summary")
        lags: List[Dict[str, Any]] = []
        header_passed = False

        for line in raw.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if "LAG" in stripped and "Mode" in stripped and "Status" in stripped:
                header_passed = True
                continue
            if stripped.startswith("---"):
                continue
            if not header_passed:
                continue

            parts = [p.strip() for p in re.split(r'\s{2,}', stripped) if p.strip()]
            if parts and parts[0].isdigit():
                lag_num = parts[0]
                mode = parts[1].lower() if len(parts) > 1 else "lacp"
                status = parts[2].lower() if len(parts) > 2 else "up"
                
                ports_raw = ""
                if len(parts) >= 5:
                    ports_raw = parts[4]
                elif len(parts) == 4 and any(x in parts[3] for x in ["Eth", "port-channel"]):
                    ports_raw = parts[3]
                    
                member_ports = []
                if ports_raw:
                    for p in re.findall(r'([a-zA-Z0-9/]+)(?:\(.*?\))?', ports_raw):
                        if p.strip():
                            member_ports.append(p.strip())
                            
                lags.append({
                    "lag_id": str(uuid.uuid4()) if 'uuid' in sys.modules else "",
                    "lag_name": f"port-channel{lag_num}",
                    "lag_type": "lacp" if "lacp" in mode else "static",
                    "member_ports": member_ports,
                    "status": status,
                    "protocol": "lacp" if "lacp" in mode else "static",
                })

        return lags


    def collect_lldp(self) -> List[Dict[str, Any]]:
        """Parse `show lldp neighbors` into LLDP link list."""
        raw = self._send_command("show lldp neighbors")
        links: List[Dict[str, Any]] = []
        header_passed = False

        for line in raw.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            # Skip dashed separator lines (both OS10 and FTOS formats)
            if re.match(r"^[-]{10,}$", stripped):
                header_passed = True
                continue
            if not header_passed:
                continue
            # Skip the header column text
            if stripped.startswith("Loc PortID") or stripped.startswith("Port"):
                continue

            # FTOS: ethernet1/1/1       leaf-01              ethernet-1/2                  1a:ff:02:ff:00:00
            # OS10: ethernet1/1/1  Ethernet1/1/1  spine-1  00:11:22:33:44:55
            lldp_match = re.match(
                r"^(\S+)\s+(\S+)\s+(\S+?)\s+(\S+)\s*$",
                stripped,
            )
            if lldp_match:
                local = lldp_match.group(1).lower()
                remote_host = lldp_match.group(2)
                remote_port = lldp_match.group(3)
                remote_chassis = lldp_match.group(4) or ""

                links.append({
                    "port": local,
                    "remote_name": remote_host,
                    "remote_port": remote_port,
                    "remote_chassis": remote_chassis,
                })

        return links

    def collect_vlt(self) -> Optional[Dict[str, Any]]:
        """Parse `show vlt domain-id` into VLT domain dict.

        Returns None if VLT is not configured.
        """
        raw = self._send_command("show vlt domain-id 1")
        # Also try "show vlt" as fallback
        if "Invalid" in raw or "not found" in raw.lower() or "Error" in raw:
            raw = self._send_command("show vlt")

        if "Domain ID" not in raw and "VLT Domain" not in raw:
            return None

        result: Dict[str, Any] = {
            "domain_id": 0,
            "peer_switch_hostname": "",
            "peer_link_status": "down",
            "icl_state": "down",
            "role": "backup",
            "peer_routing_enabled": False,
            "vrrp_groups": [],
        }

        for line in raw.splitlines():
            stripped = line.strip()
            if ":" not in stripped:
                continue
            key, _, val = stripped.partition(":")
            key_lower = key.strip().lower()
            val = val.strip()

            if "domain id" in key_lower:
                try:
                    result["domain_id"] = int(val)
                except ValueError:
                    result["domain_id"] = 0
            elif "role" in key_lower:
                result["role"] = val.lower()
            elif "peer" in key_lower and "status" in key_lower:
                result["peer_link_status"] = val.lower()
            elif "icl" in key_lower:
                result["icl_state"] = val.lower()
            elif "peer routing" in key_lower:
                result["peer_routing_enabled"] = "enabl" in val.lower()
            elif "peer" in key_lower and ("ip" in key_lower or "address" in key_lower):
                result["peer_switch_hostname"] = val

        return result

    def collect_stp(self) -> Dict[str, Any]:
        """Parse `show spanning-tree brief` for STP status."""
        raw = self._send_command("show spanning-tree brief")
        if "Invalid" in raw or "Error" in raw:
            raw = self._send_command("show spanning-tree")

        result: Dict[str, Any] = {
            "enabled": False,
            "protocol": "RSTP",
            "root_bridge": False,
            "bridge_priority": 32768,
            "blocked_ports": [],
            "port_states": []
        }

        # Check if enabled
        if "Spanning tree enabled" in raw or "rstp" in raw.lower() or "rapid-pvst" in raw.lower():
            result["enabled"] = True
        if "this bridge is the root" in raw.lower() or "is root" in raw.lower() or "we are the root" in raw.lower():
            result["root_bridge"] = True

        # Parse priority: "Bridge ID    Priority 32769,"
        priority_match = re.search(r'Bridge ID\s+Priority\s+(\d+)', raw, re.IGNORECASE)
        if priority_match:
            result["bridge_priority"] = int(priority_match.group(1))

        # Parse ports
        # Match lines like: ethernet1/1/1     Desg    128.8     128       500       FWD
        port_pattern = re.compile(
            r'^\s*(ethernet\d+(?:/\d+)*)\s+([a-zA-Z]+)\s+\d+(?:\.\d+)?\s+\d+\s+\d+\s+([a-zA-Z]+)',
            re.MULTILINE
        )
        for m in port_pattern.finditer(raw):
            port_name = m.group(1)
            role_raw = m.group(2)
            state_raw = m.group(3)
            
            # Map roles
            role_map = {
                "desg": "designated",
                "root": "root",
                "altn": "alternate",
                "disb": "disabled"
            }
            role = role_map.get(role_raw.lower(), role_raw.lower())
            
            # Map states
            state_map = {
                "fwd": "forwarding",
                "blk": "blocking",
                "lrn": "learning",
                "dis": "disabled"
            }
            state = state_map.get(state_raw.lower(), state_raw.lower())
            
            if state == "blocking":
                result["blocked_ports"].append(port_name)
                
            result["port_states"].append({
                "port": port_name,
                "role": role,
                "state": state
            })

        return result

    def collect_running_config(self) -> str:
        """Return raw `show running-configuration` output."""
        raw = self._send_command("show running-configuration", timeout=30)
        raw_clean = raw.replace("\r", "")
        lines = raw_clean.split("\n")
        
        # Remove echoed command at the beginning if present
        if lines and "show running-configuration" in lines[0]:
            lines.pop(0)
            
        # Remove prompt at the end if present
        if lines and (lines[-1].strip().endswith("#") or lines[-1].strip().endswith(">")):
            lines.pop()
            
        # Clean any remaining empty leading/trailing lines
        while lines and not lines[0].strip():
            lines.pop(0)
        while lines and not lines[-1].strip():
            lines.pop()
            
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Orchestrator
    # ------------------------------------------------------------------
    def collect_all(self) -> Dict[str, Any]:
        """Run every collector and return a single combined dict."""
        system = self.collect_system()
        version = self.collect_version()
        # Merge version fields that system didn't provide
        for k, v in version.items():
            if k not in system or not system.get(k):
                system[k] = v

        uptime = self.collect_uptime()
        if uptime:
            system["uptime"] = uptime

        environment = self.collect_environment()
        inventory = self.collect_inventory()
        interfaces = self.collect_interfaces()
        transceivers = self.collect_transceivers()
        vlans = self.collect_vlans()
        lags = self.collect_lags()
        lldp = self.collect_lldp()
        vlt = self.collect_vlt()
        stp = self.collect_stp()
        running_config = self.collect_running_config()

        # Merge transceiver info into interfaces
        for intf in interfaces:
            name = intf["name"]
            if name in transceivers:
                intf.update(transceivers[name])

        # Parse MAC address table for per-port MACs
        mac_table = self.collect_mac_table()
        port_macs: Dict[str, List[str]] = {}
        for entry in mac_table:
            port = entry["interface"]
            mac = entry["mac_address"]
            if port not in port_macs:
                port_macs[port] = []
            if len(port_macs[port]) < 2:
                port_macs[port].append(mac)

        # Merge LLDP neighbor info into interfaces
        lldp_by_port: Dict[str, Dict] = {}
        for entry in lldp:
            lldp_by_port[entry["port"]] = entry
        for intf in interfaces:
            name = intf["name"]
            if name in lldp_by_port:
                intf["neighbor"] = lldp_by_port[name]["remote_name"]
            # Populate MAC address from first learned entry on this port
            if name in port_macs and port_macs[name]:
                intf["mac_address"] = port_macs[name][0]

        # Compute aggregate health from environment
        temperature = "Normal"
        if environment["temperature_sensors"]:
            temps = [s["numeric_value"] for s in environment["temperature_sensors"] if s["numeric_value"]]
            if temps:
                avg_temp = sum(temps) / len(temps)
                if avg_temp > 65:
                    temperature = "Critical"
                elif avg_temp > 50:
                    temperature = "Warning"
                else:
                    temperature = "Normal"

        chassis_status = "Ready"
        psu_ok = all(ps["status"] == "ok" for ps in environment["power_supplies"])
        fan_ok = all(f["status"] == "ok" for f in environment["fans"])
        if not psu_ok or not fan_ok:
            chassis_status = "Degraded"

        return {
            "system": system,
            "environment": environment,
            "inventory": inventory,
            "interfaces": interfaces,
            "vlans": vlans,
            "lags": lags,
            "lldp": lldp,
            "vlt": vlt,
            "stp": stp,
            "running_config": running_config,
            "temperature": temperature,
            "chassis_status": chassis_status,
        }

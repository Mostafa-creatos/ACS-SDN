import datetime
import os
import uuid
import re
from sqlalchemy.orm import Session
from .. import models
from .gnmi_client import gNMIclient
from .gnmi_discovery import clean_and_login_dell_console, parse_dell_console_output

class GnmiTelemetryCollector:
    """
    Native Telemetry Collector.
    Polls interface statistics counters from Nokia (gNMI) and Dell (Console) switches
    and commits them to the database.
    """
    def __init__(self, db_session_factory):
        self.session_factory = db_session_factory
        self._is_running = False

    def collect_switch_metrics(self):
        """
        Polls metrics from all switches and writes them to the DB.
        If switches are unreachable, does not write telemetry metrics (disables randomized fallbacks).
        """
        db = self.session_factory()
        try:
            switches = db.query(models.Switch).all()
            for sw in switches:
                metrics = {}
                
                # 1. Nokia Switch Ingestion (gNMI)
                if sw.vendor.lower() == "nokia":
                    try:
                        with gNMIclient(target=(sw.management_ip, 57400), username="admin", password=os.getenv("GNMI_DEFAULT_PASSWORD", "NokiaSrl1!"), skip_verify=True, gnmi_timeout=2) as gc:
                            data = gc.get(path=['/interface'])
                            
                            for notification in data.get('notification', []):
                                for update in notification.get('update', []):
                                    val = update.get('val', {})
                                    interface_key = next((k for k in val if k == 'interface' or k.endswith(':interface')), None)
                                    if interface_key:
                                        for interface in val[interface_key]:
                                            name = interface.get('name')
                                            if not name.startswith("ethernet-"):
                                                continue
                                            stats = interface.get('statistics', {})
                                            in_octets = stats.get('in-octets')
                                            out_octets = stats.get('out-octets')
                                            
                                            if in_octets is not None:
                                                metrics[f"interface.{name}.in_octets"] = int(in_octets)
                                            if out_octets is not None:
                                                metrics[f"interface.{name}.out_octets"] = int(out_octets)
                            
                            # Poll Platform Stats (CPU and Memory)
                            platform_data = gc.get(path=['/platform'])
                            for notification in platform_data.get('notification', []):
                                for update in notification.get('update', []):
                                    val = update.get('val', {})
                                    # CPU parsing
                                    cpu_key = next((k for k in val if k == 'cpu' or k.endswith(':cpu')), None)
                                    if cpu_key:
                                        for cpu_item in val[cpu_key]:
                                            if cpu_item.get('index') == 'all':
                                                total_cpu = cpu_item.get('total', {}).get('instant')
                                                if total_cpu is not None:
                                                    metrics["cpu_utilization"] = float(total_cpu)
                                    
                                    # Memory parsing
                                    mem_key = next((k for k in val if k == 'memory' or k.endswith(':memory')), None)
                                    if mem_key:
                                        mem_util = val[mem_key].get('utilization')
                                        if mem_util is not None:
                                            metrics["memory_utilization"] = float(mem_util)
                    except Exception as e:
                        print(f"[Telemetry Nokia] Failed to collect metrics for {sw.hostname}: {e}")
                
                # 2. Dell Switch Ingestion (SSH)
                elif sw.vendor.lower() in ("dell_os10", "dell"):
                    try:
                        from ..drivers.dell_os10_collector import DellOS10Collector
                        ssh_user = os.environ.get("DELL_SSH_USERNAME", "admin")
                        ssh_pass = os.environ.get("DELL_SSH_PASSWORD", "admin")
                        ssh_port = int(os.environ.get("DELL_SSH_PORT", "22"))
                        
                        collector_success = False
                        out = ""
                        cpu_out = ""
                        mem_out = ""
                        
                        # Try Console fallback first (historical default)
                        try:
                            with DellOS10Collector(
                                host=sw.management_ip,
                                username=ssh_user,
                                password=ssh_pass,
                                port=5000,
                                use_ssh=False,
                            ) as collector:
                                out = collector._send_command("show interface")
                                cpu_out = collector._send_command("show processes cpu")
                                mem_out = collector._send_command("show processes memory")
                                collector_success = True
                        except Exception as ce:
                            print(f"[Telemetry Dell] Console port 5000 connection timed out/failed on {sw.hostname}: {ce}. Falling back to SSH port 22...")
                            try:
                                with DellOS10Collector(
                                    host=sw.management_ip,
                                    username=ssh_user,
                                    password=ssh_pass,
                                    port=ssh_port,
                                    use_ssh=True,
                                ) as collector:
                                    out = collector._send_command("show interface")
                                    cpu_out = collector._send_command("show processes cpu")
                                    mem_out = collector._send_command("show processes memory")
                                    collector_success = True
                            except Exception as se:
                                raise Exception(f"Console and SSH both failed: {se}")

                        if collector_success:
                            # Parse output sections by interface
                            sections = re.split(r'(?i)ethernet\s+(\d+/\d+/\d+)\s+is', out)
                            if len(sections) > 1:
                                for idx in range(1, len(sections), 2):
                                    port_num = sections[idx]
                                    section_content = sections[idx+1]
                                    
                                    port_name = f"ethernet{port_num}"
                                    
                                    input_match = re.search(r'Input statistics:\s*\n\s*\d+\s+packets,\s*(\d+)\s+octets', section_content, re.IGNORECASE)
                                    output_match = re.search(r'Output statistics:\s*\n\s*\d+\s+packets,\s*(\d+)\s+octets', section_content, re.IGNORECASE)
                                    
                                    if input_match:
                                        metrics[f"interface.{port_name}.in_octets"] = int(input_match.group(1))
                                    if output_match:
                                        metrics[f"interface.{port_name}.out_octets"] = int(output_match.group(1))
                                        
                            # Parse CPU usage percentage
                            cpu_match = re.search(r'Overall\s+([\d\.]+)', cpu_out)
                            if cpu_match:
                                metrics["cpu_utilization"] = float(cpu_match.group(1))
                                
                            # Parse Memory usage percentage
                            mem_match = re.search(r'Used Memory percentage\s*:\s*(\d+)%', mem_out)
                            if mem_match:
                                metrics["memory_utilization"] = float(mem_match.group(1))
                    except Exception as e:
                        print(f"[Telemetry Dell] Failed to collect metrics for {sw.hostname}: {e}")
                
                # Update switch table columns directly
                if "cpu_utilization" in metrics:
                    sw.cpu_usage = metrics["cpu_utilization"]
                if "memory_utilization" in metrics:
                    sw.memory_usage = metrics["memory_utilization"]

                # Commit all metrics for the switch
                for name, value in metrics.items():
                    metric_record = models.TelemetryMetric(
                        metric_id=uuid.uuid4(),
                        switch_id=sw.switch_id,
                        metric_name=name,
                        metric_value=str(value),
                        timestamp=datetime.datetime.now(datetime.timezone.utc)
                    )
                    db.add(metric_record)
            
            if switches:
                db.commit()
                print(f"[Telemetry] Metric recording completed successfully.")
        except Exception as e:
            db.rollback()
            print(f"[Telemetry] Collection loop error: {e}")
        finally:
            db.close()

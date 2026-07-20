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
                        with gNMIclient(target=(sw.management_ip, 57400), username="admin", password=os.getenv("GNMI_DEFAULT_PASSWORD", ""), skip_verify=True, gnmi_timeout=2) as gc:
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
                    except Exception as e:
                        print(f"[Telemetry Nokia] Failed to collect metrics for {sw.hostname}: {e}")
                
                # 2. Dell Switch Ingestion (SSH)
                elif sw.vendor.lower() == "dell_os10":
                    try:
                        from ..drivers.dell_os10_collector import DellOS10Collector
                        ssh_user = os.environ.get("DELL_SSH_USERNAME", "admin")
                        ssh_pass = os.environ.get("DELL_SSH_PASSWORD", "admin")
                        ssh_port = int(os.environ.get("DELL_SSH_PORT", "22"))
                        with DellOS10Collector(
                            host=sw.management_ip,
                            username=ssh_user,
                            password=ssh_pass,
                            port=5000,
                            use_ssh=False,
                        ) as collector:
                            out = collector._send_command("show interface")
                            
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
                    except Exception as e:
                        print(f"[Telemetry Dell] Failed to collect metrics for {sw.hostname}: {e}")
                
                # Commit all metrics for the switch
                for name, value in metrics.items():
                    metric_record = models.TelemetryMetric(
                        metric_id=uuid.uuid4(),
                        switch_id=sw.switch_id,
                        metric_name=name,
                        metric_value=str(value),
                        timestamp=datetime.datetime.utcnow()
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

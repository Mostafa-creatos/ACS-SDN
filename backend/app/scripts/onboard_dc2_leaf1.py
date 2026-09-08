import logging
from app import db, models
from app.drivers.dell_os10_collector import DellOS10Collector

logging.basicConfig(level=logging.INFO)

def onboard_dc2_leaf1():
    s = db.SessionLocal()
    hostname = "DC2-Leaf-1"
    mac = "50:24:c3:00:0d:00"
    console_host = "128.105.145.2"
    console_port = 30013
    mgmt_ip = "172.20.20.189"

    print(f"Connecting to {hostname} via Telnet console ({console_host}:{console_port})...")
    try:
        with DellOS10Collector(
            host=console_host,
            username="admin",
            password="admin",
            port=console_port,
            use_ssh=False
        ) as collector:
            data = collector.collect_all()
            print("Collected Data Keys:", list(data.keys()))
            system = data.get("system", {})
            print("System Metadata:", system)

        # 1. Create or update ZTP discovery pool record
        ztp_rec = s.query(models.ZtpDiscoveryPool).filter_by(mac_address=mac).first()
        if not ztp_rec:
            ztp_rec = models.ZtpDiscoveryPool(
                mac_address=mac,
                serial_number=system.get("serial_number", "CN09XJ2F-000D00"),
                hardware_vendor="dell_os10",
                hardware_model=system.get("model", "S5248F-ON"),
                current_dhcp_ip=mgmt_ip,
                base_os_version=system.get("os_version", "10.5.4.3"),
                onboarding_status="provisioned"
            )
            s.add(ztp_rec)
            s.commit()
            s.refresh(ztp_rec)
            print("Created ZTP Discovery Record:", ztp_rec.discovery_id)
        else:
            ztp_rec.onboarding_status = "provisioned"
            s.commit()

        # 2. Create or update Switch row
        sw = s.query(models.Switch).filter_by(hostname=hostname).first()
        if not sw:
            sw = models.Switch(
                discovery_id=ztp_rec.discovery_id,
                hostname=hostname,
                management_ip=mgmt_ip,
                vendor="dell_os10",
                role="leaf",
                status="Up",
                lifecycle_status="compliant_active",
                local_bgp_asn=65002,
                loopback_0_ip="10.255.0.13",
                serial_number=system.get("serial_number", "CN09XJ2F-000D00"),
                running_config=data.get("running_config", "")
            )
            s.add(sw)
            s.commit()
            s.refresh(sw)
            print(f"Successfully onboarded {hostname} into database with Switch ID: {sw.switch_id}")
        else:
            sw.status = "Up"
            sw.lifecycle_status = "compliant_active"
            sw.running_config = data.get("running_config", "")
            s.commit()
            print(f"Updated {hostname} status to Up / compliant_active!")

    except Exception as e:
        print(f"Error onboarding {hostname}: {e}")

if __name__ == "__main__":
    onboard_dc2_leaf1()

from app import db, models

def check_ztp():
    s = db.SessionLocal()
    pool = s.query(models.ZtpDiscoveryPool).all()
    print(f"Total ZTP Pool Records: {len(pool)}")
    for r in pool:
        print(f"ID: {r.discovery_id} | Serial: {r.serial_number} | MAC: {r.mac_address} | IP: {r.current_dhcp_ip} | Status: {r.onboarding_status}")

if __name__ == "__main__":
    check_ztp()

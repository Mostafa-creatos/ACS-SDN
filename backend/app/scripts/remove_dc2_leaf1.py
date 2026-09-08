from app import db, models

def remove_switch():
    s = db.SessionLocal()
    sw = s.query(models.Switch).filter(models.Switch.hostname == "DC2-Leaf-1").first()
    if sw:
        s.query(models.ConfigSnapshot).filter_by(switch_id=sw.switch_id).delete()
        s.query(models.DeviceInterface).filter_by(switch_id=sw.switch_id).delete()
        s.query(models.HardwareComponent).filter_by(switch_id=sw.switch_id).delete()
        s.query(models.SwitchVlan).filter_by(switch_id=sw.switch_id).delete()
        s.query(models.SwitchLag).filter_by(switch_id=sw.switch_id).delete()
        did = sw.discovery_id
        s.delete(sw)
        if did:
            s.query(models.ZtpDiscoveryPool).filter_by(discovery_id=did).delete()
        s.commit()
        print("DC2-Leaf-1 removed completely from database!")
    else:
        # Also clean any ztp pool entries with MAC 50:24:c3:00:0d:00
        s.query(models.ZtpDiscoveryPool).filter_by(mac_address="50:24:c3:00:0d:00").delete()
        s.commit()
        print("Cleaned any orphan ZTP pool records for DC2-Leaf-1.")

if __name__ == "__main__":
    remove_switch()

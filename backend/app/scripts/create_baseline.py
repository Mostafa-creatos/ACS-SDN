import hashlib
from app import db, models

def create_baseline():
    s = db.SessionLocal()
    sw = s.query(models.Switch).filter_by(hostname="DC2-Leaf-1").first()
    if sw:
        cfg = sw.running_config or ""
        cfg_hash = hashlib.sha256(cfg.encode('utf-8')).hexdigest()
        snap = models.ConfigSnapshot(
            switch_id=sw.switch_id,
            raw_config=cfg,
            config_hash=cfg_hash,
            is_baseline=True,
            taken_by="system_ztp"
        )
        s.add(snap)
        s.commit()
        print("Baseline snapshot created for DC2-Leaf-1!")

if __name__ == "__main__":
    create_baseline()

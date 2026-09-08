import logging
from app import db, models
import re

logging.basicConfig(level=logging.INFO)

def normalize_cfg(c: str) -> str:
    if not c:
        return ""
    c = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', c)
    c = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\ufffd]', '', c)
    lines = []
    for line in c.replace("\r\n", "\n").split("\n"):
        s = line.strip()
        if not s or s.startswith("!") or s.startswith("#") or "Last configuration change" in s or "Building configuration" in s:
            continue
        if "ip address dhcp" in s:
            continue
        lines.append(s)
    return "\n".join(lines)

def check_all_switches():
    s = db.SessionLocal()
    switches = s.query(models.Switch).all()
    print("--- DRIFT CHECK (IGNORE DYNAMIC ZTD/DHCP LINES) ---")
    for sw in switches:
        snaps = s.query(models.ConfigSnapshot).filter_by(switch_id=sw.switch_id).order_by(models.ConfigSnapshot.taken_at.desc()).all()
        if not snaps:
            print(f"{sw.hostname}: NO SNAPSHOTS")
            continue
        snap = snaps[0]
        norm_run = normalize_cfg(sw.running_config or "")
        norm_snap = normalize_cfg(snap.raw_config or "")
        if norm_run == norm_snap:
            print(f"{sw.hostname}: ✅ MATCHES (Compliant)")
        else:
            import difflib
            diff = list(difflib.unified_diff(norm_snap.splitlines(), norm_run.splitlines(), fromfile="snap", tofile="run"))
            print(f"{sw.hostname}: ❌ DIFF DETECTED ({len(diff)} diff lines)")
            for line in diff[:15]:
                print("  ", line)

if __name__ == "__main__":
    check_all_switches()

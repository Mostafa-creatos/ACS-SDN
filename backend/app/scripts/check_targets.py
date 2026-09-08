import socket
import logging
from app import db, models
from app.workers.ztp_tasks import resolve_console_target

logging.basicConfig(level=logging.INFO)

def check_targets():
    s = db.SessionLocal()
    switches = s.query(models.Switch).all()
    print(f"Found {len(switches)} switches in DB:")
    for sw in switches:
        h, p = resolve_console_target(sw, s)
        sock = socket.socket()
        sock.settimeout(2.0)
        res = sock.connect_ex((h, p))
        sock.close()
        status = "OPEN (0)" if res == 0 else f"FAILED ({res})"
        print(f"  - {sw.hostname} (IP: {sw.management_ip}) -> Target: {h}:{p} => {status}")

if __name__ == "__main__":
    check_targets()

import socket
import time

s = socket.socket()
s.settimeout(5)
s.connect(("172.20.20.13", 5000))
s.send(b"\x03\r\n")
time.sleep(0.5)
try:
    s.recv(4096)
except:
    pass

s.send(b"show running-configuration\n")
time.sleep(3.0)
try:
    buf = s.recv(65536).decode('utf-8', errors='ignore')
    print("=== RUNNING CONFIG ===")
    for line in buf.splitlines():
        if any(w in line.lower() for w in ["copp", "policy-map", "class-map", "control-plane"]):
            print(line)
except Exception as e:
    print(f"Failed: {e}")
s.close()

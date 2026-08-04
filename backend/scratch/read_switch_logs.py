import socket
import time

s = socket.socket()
s.settimeout(3)
s.connect(("172.20.20.13", 5000))
s.send(b"\x03\r\n")
time.sleep(0.5)
try:
    s.recv(4096)
except:
    pass

s.send(b"show policy-map type control-plane\n")
time.sleep(1.5)
try:
    buf = s.recv(4096).decode('utf-8', errors='ignore')
    print("=== COPP POLICY DETAILS ===")
    print(buf)
except Exception as e:
    print(f"Failed: {e}")
s.close()

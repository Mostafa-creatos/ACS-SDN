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

s.send(b"show users\n")
time.sleep(1.0)
try:
    buf = s.recv(4096).decode('utf-8', errors='ignore')
    print("=== ACTIVE USERS/SESSIONS ===")
    print(buf)
except Exception as e:
    print(f"Failed: {e}")
s.close()

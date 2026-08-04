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

s.send(b"configure terminal\n")
time.sleep(0.5)
s.send(b"control-plane\n")
time.sleep(0.5)
s.send(b"no service-policy input type control-plane COPP_POLICY\n")
time.sleep(0.5)
s.send(b"end\n")
time.sleep(0.5)
s.send(b"write memory\n")
time.sleep(2.0)
try:
    buf = s.recv(4096).decode('utf-8', errors='ignore')
    print("=== COPP REMOVAL RESULT ===")
    print(buf)
except Exception as e:
    print(f"Failed: {e}")
s.close()

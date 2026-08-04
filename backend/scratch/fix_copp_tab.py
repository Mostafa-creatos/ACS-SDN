import socket
import time

s = socket.socket()
s.settimeout(5)
s.connect(("172.20.20.13", 5000))
s.send(b"\x03\r\n")
time.sleep(1.0)
try:
    s.recv(4096)
except:
    pass

# Send "configure terminal"
s.send(b"configure terminal\n")
time.sleep(1.0)
try:
    s.recv(4096)
except:
    pass

# Send "control-plane"
s.send(b"control-plane\n")
time.sleep(1.0)
try:
    s.recv(4096)
except:
    pass

# Send "no service-policy input type control-plane COPP_" and then Tab, then Enter
s.send(b"no service-policy input type control-plane COPP_")
time.sleep(0.5)
s.send(b"\t")
time.sleep(0.5)
s.send(b"\n")
time.sleep(1.0)
try:
    print(s.recv(4096).decode('utf-8', errors='ignore'))
except:
    pass

s.send(b"end\n")
time.sleep(0.5)
s.send(b"write memory\n")
time.sleep(2.0)
try:
    print(s.recv(4096).decode('utf-8', errors='ignore'))
except:
    pass

s.close()

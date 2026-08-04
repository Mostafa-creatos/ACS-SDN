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
for c in "configure terminal\n":
    s.send(c.encode())
    time.sleep(0.1)
time.sleep(1.0)
try:
    s.recv(4096)
except:
    pass

# Send "control-plane"
for c in "control-plane\n":
    s.send(c.encode())
    time.sleep(0.1)
time.sleep(1.0)
try:
    s.recv(4096)
except:
    pass

# Send "no service-policy input type control-plane COPP_POLICY\n"
for c in "no service-policy input type control-plane COPP_POLICY\n":
    s.send(c.encode())
    time.sleep(0.1)
time.sleep(1.0)
try:
    print(s.recv(4096).decode('utf-8', errors='ignore'))
except:
    pass

# Send "end"
for c in "end\n":
    s.send(c.encode())
    time.sleep(0.1)
time.sleep(1.0)
try:
    s.recv(4096)
except:
    pass

# Send "write memory"
for c in "write memory\n":
    s.send(c.encode())
    time.sleep(0.1)
time.sleep(2.0)
try:
    print(s.recv(4096).decode('utf-8', errors='ignore'))
except:
    pass

s.close()

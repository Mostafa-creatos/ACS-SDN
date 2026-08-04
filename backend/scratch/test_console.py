import socket
import time

s = socket.socket()
s.settimeout(2)
print("Connecting...")
s.connect(("172.20.20.13", 5000))

# Provoke prompt
s.send(b"\x03\r\n")
time.sleep(0.5)

# Read any initial text
try:
    buf = s.recv(4096).decode('utf-8', errors='ignore')
    print(f"Initial: {repr(buf)}")
except socket.timeout:
    print("No initial data")

# Send login if needed
s.send(b"admin\n")
time.sleep(0.5)
s.send(b"admin\n")
time.sleep(0.5)

# Enable SSH
s.send(b"end\n")
time.sleep(0.5)
s.send(b"configure terminal\n")
time.sleep(0.5)
s.send(b"ip ssh server enable\n")
time.sleep(0.5)
s.send(b"end\n")
time.sleep(0.5)
s.send(b"write memory\n")
time.sleep(1.0)

# Read output to verify
try:
    buf = s.recv(4096).decode('utf-8', errors='ignore')
    print(f"Result: {repr(buf)}")
except socket.timeout:
    print("No result data")

s.close()

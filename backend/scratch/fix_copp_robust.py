import socket
import time

def send_slow(s, text):
    print(f"Sending slow: {text.strip()}")
    for char in text:
        s.send(char.encode())
        time.sleep(0.05)
    time.sleep(1.0)
    buf = s.recv(4096).decode('utf-8', errors='ignore')
    print(f"Response:\n{buf}")
    return buf

s = socket.socket()
s.settimeout(5)
s.connect(("172.20.20.13", 5000))

# Provoke prompt
s.send(b"\x03\r\n")
time.sleep(1.0)
try:
    s.recv(4096)
except:
    pass

send_slow(s, "configure terminal\n")
send_slow(s, "control-plane\n")
send_slow(s, "no service-policy input type control-plane ?")
s.close()

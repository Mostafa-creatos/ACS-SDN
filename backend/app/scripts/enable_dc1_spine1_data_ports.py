import socket
import time

def enable_dc1_spine1_ports():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect(('127.0.0.1', 30001))
        time.sleep(1)
        s.sendall(b"\n")
        time.sleep(1)
        s.sendall(b"configure terminal\n")
        time.sleep(1)
        s.sendall(b"interface range ethernet 1/1/1-1/1/8\n")
        time.sleep(1)
        s.sendall(b"no shutdown\n")
        time.sleep(1)
        s.sendall(b"end\n")
        time.sleep(5)
        s.sendall(b"show lldp neighbors\n")
        time.sleep(2)
        data = s.recv(4096).decode('utf-8', errors='ignore')
        print("=== DC1-Spine-1 LLDP NEIGHBORS AFTER NO SHUTDOWN ===")
        print(data)
        s.close()
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    enable_dc1_spine1_ports()

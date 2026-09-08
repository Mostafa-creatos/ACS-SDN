import socket
import time

def trigger_dhcp():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect(('127.0.0.1', 30013))
        time.sleep(1)
        s.sendall(b"\n")
        time.sleep(1)
        s.sendall(b"configure terminal\n")
        time.sleep(1)
        s.sendall(b"interface mgmt 1/1/1\n")
        time.sleep(1)
        s.sendall(b"no ip address\n")
        time.sleep(1)
        s.sendall(b"ip address dhcp vendor-class ZTD\n")
        time.sleep(1)
        s.sendall(b"no shutdown\n")
        time.sleep(1)
        s.sendall(b"end\n")
        time.sleep(2)
        data = s.recv(4096).decode('utf-8', errors='ignore')
        print("=== CONSOLE OUTPUT ===")
        print(data)
        s.close()
    except Exception as e:
        print("Trigger Error:", e)

if __name__ == "__main__":
    trigger_dhcp()

import socket
import time

def check_spine2_lldp():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        # Node 12 is DC2-Spine-2 (Telnet port 30012)
        s.connect(('127.0.0.1', 30012))
        time.sleep(1)
        s.sendall(b"\n")
        time.sleep(1)
        s.sendall(b"show lldp neighbors\n")
        time.sleep(2)
        data = s.recv(4096).decode('utf-8', errors='ignore')
        print("=== DC2-Spine-2 LLDP NEIGHBORS ===")
        print(data)
        s.close()
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    check_spine2_lldp()

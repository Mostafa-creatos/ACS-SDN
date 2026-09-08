import socket
import time

def force_lldp(port, name):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect(('127.0.0.1', port))
        time.sleep(1)
        s.sendall(b"\n")
        time.sleep(1)
        s.sendall(b"configure terminal\n")
        time.sleep(1)
        s.sendall(b"interface ethernet 1/1/1\n")
        time.sleep(1)
        s.sendall(b"lldp transmit\n")
        time.sleep(1)
        s.sendall(b"lldp receive\n")
        time.sleep(1)
        s.sendall(b"no shutdown\n")
        time.sleep(1)
        s.sendall(b"end\n")
        time.sleep(2)
        s.sendall(b"show lldp neighbors\n")
        time.sleep(2)
        data = s.recv(4096).decode('utf-8', errors='ignore')
        print(f"=== {name} FORCE LLDP OUTPUT ===")
        print(data)
        s.close()
    except Exception as e:
        print(f"Error on {name}:", e)

if __name__ == "__main__":
    force_lldp(30001, "DC1-Spine-1")
    force_lldp(30003, "DC1-Leaf-1")

import socket
import time

SWITCH_NODES = {
    "DC1-Spine-1": 30001,
    "DC1-Spine-2": 30002,
    "DC1-Leaf-1": 30003,
    "DC1-Leaf-2": 30004,
    "DC1-Leaf-3": 30005,
    "DC1-Leaf-4": 30006,
    "DC1-Leaf-5": 30007,
    "DC1-Leaf-6": 30008,
    "DC1-Leaf-7": 30009,
    "DC1-Leaf-8": 30010,
    "DC2-Spine-1": 30011,
    "DC2-Spine-2": 30012,
    "DC2-Leaf-1": 30013,
    "DC2-Leaf-2": 30014,
}

def disable_mgmt_lldp():
    for name, port in SWITCH_NODES.items():
        try:
            print(f"Disabling mgmt LLDP on {name} (port {port})...")
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(4)
            s.connect(('127.0.0.1', port))
            time.sleep(0.5)
            s.sendall(b"\n")
            time.sleep(0.5)
            s.sendall(b"configure terminal\n")
            time.sleep(0.5)
            s.sendall(b"interface mgmt 1/1/1\n")
            time.sleep(0.5)
            s.sendall(b"no lldp transmit\n")
            time.sleep(0.5)
            s.sendall(b"no lldp receive\n")
            time.sleep(0.5)
            s.sendall(b"end\n")
            time.sleep(0.5)
            s.sendall(b"clear lldp table\n")
            time.sleep(0.5)
            s.close()
            print(f"  {name} OK")
        except Exception as e:
            print(f"  Error on {name}: {e}")

if __name__ == "__main__":
    disable_mgmt_lldp()

import socket
import time

def check_leaf2_eth2():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect(('127.0.0.1', 30004))
        time.sleep(1)
        s.sendall(b"\n")
        time.sleep(1)
        s.sendall(b"show interface ethernet 1/1/2\n")
        time.sleep(2)
        data = s.recv(4096).decode('utf-8', errors='ignore')
        print("=== DC1-Leaf-2 ETH 1/1/2 ===")
        print(data)
        s.close()
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    check_leaf2_eth2()

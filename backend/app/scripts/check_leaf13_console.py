import socket
import time

def check_console():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect(('127.0.0.1', 30013))
        time.sleep(1)
        s.sendall(b"\n")
        time.sleep(1)
        s.sendall(b"ztd ?\n")
        time.sleep(2)
        data = s.recv(4096).decode('utf-8', errors='ignore')
        print("=== CONSOLE OUTPUT ===")
        print(data)
        s.close()
    except Exception as e:
        print("Console Error:", e)

if __name__ == "__main__":
    check_console()

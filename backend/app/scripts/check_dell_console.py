import socket
import time

def check_dell_console(container):
    print(f"Connecting to {container} serial console...")
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(5)
    try:
        s.connect(('127.0.0.1', 5000))
        time.sleep(1)
        s.send(b"\r\n")
        time.sleep(1)
        resp = s.recv(4096).decode('utf-8', errors='ignore')
        print(f"--- CONSOLE OUTPUT FOR {container} ---")
        print(resp)
        s.close()
    except Exception as e:
        print(f"Error on {container}: {e}")

if __name__ == "__main__":
    import sys
    check_dell_console("leaf-02")

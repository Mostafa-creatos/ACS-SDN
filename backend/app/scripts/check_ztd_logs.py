import socket
import time

def check_ztd_logs():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect(('127.0.0.1', 30013))
        time.sleep(1)
        s.sendall(b"\n")
        time.sleep(1)
        s.sendall(b"system \"cat /var/log/ztd.log\"\n")
        time.sleep(3)
        data = s.recv(4096).decode('utf-8', errors='ignore')
        print("=== ZTD LOG FILE ===")
        print(data)
        
        s.sendall(b"system \"journalctl -u ztd --no-pager -n 25\"\n")
        time.sleep(3)
        data2 = s.recv(4096).decode('utf-8', errors='ignore')
        print("=== ZTD JOURNAL ===")
        print(data2)
        s.close()
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    check_ztd_logs()

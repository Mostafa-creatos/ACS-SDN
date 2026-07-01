import socket
import time

def read_until_prompt(s, timeout=5):
    s.settimeout(timeout)
    buf = ""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            chunk = s.recv(4096).decode('utf-8', errors='ignore')
            if not chunk:
                break
            buf += chunk
            if "spine-01#" in buf or "spine-01(config)#" in buf or "--More--" in buf:
                break
        except socket.timeout:
            break
    return buf

def run_command_on_dell(ip, port=5000):
    s = socket.socket()
    try:
        s.connect((ip, port))
        s.send(b"\x03\r\n")
        time.sleep(1)
        read_until_prompt(s)
        s.send(b"\r\n")
        time.sleep(1)
        buf = read_until_prompt(s)
        if "login:" in buf:
            s.send(b"admin\n")
            time.sleep(1)
            buf = read_until_prompt(s)
            if "Password:" in buf:
                s.send(b"admin\n")
                time.sleep(2)
                read_until_prompt(s)
                
        s.send(b"terminal length 0\n")
        time.sleep(1)
        read_until_prompt(s)
        
        # Query show version
        s.send(b"show version\n")
        time.sleep(2)
        out_ver = read_until_prompt(s, timeout=5)
        print("SHOW VERSION OUTPUT:")
        print(out_ver)
        
        # Query show system
        s.send(b"show system\n")
        time.sleep(2)
        out_sys = read_until_prompt(s, timeout=5)
        print("SHOW SYSTEM OUTPUT:")
        print(out_sys)
    except Exception as e:
        print("Error:", e)
    finally:
        s.close()

if __name__ == "__main__":
    run_command_on_dell("172.20.20.10")

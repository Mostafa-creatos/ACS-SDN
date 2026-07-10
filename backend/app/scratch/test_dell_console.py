import socket
import time
import sys

def debug_dell():
    ip = "172.20.20.10"
    port = 5000
    s = socket.socket()
    s.settimeout(5)
    print(f"Connecting to {ip}:{port}...")
    s.connect((ip, port))
    
    # Send Enter to provoke prompt
    s.send(b"\r\n")
    time.sleep(1)
    buf = s.recv(4096).decode('utf-8', errors='ignore')
    print(f"--- Initial Prompt Buffer ---\n{buf}\n---------------------------")
    
    # Try sending end and terminal length 0
    print("Sending 'end'...")
    s.send(b"end\n")
    time.sleep(1)
    buf = s.recv(4096).decode('utf-8', errors='ignore')
    print(f"--- After 'end' ---\n{buf}\n------------------")
    
    print("Sending 'terminal length 0'...")
    s.send(b"terminal length 0\n")
    time.sleep(1)
    buf = s.recv(4096).decode('utf-8', errors='ignore')
    print(f"--- After 'terminal length 0' ---\n{buf}\n-----------------------------")
    
    print("Sending 'show running-configuration'...")
    s.send(b"show running-configuration\n")
    time.sleep(2)
    
    # Read output
    out = ""
    s.settimeout(2)
    try:
        while True:
            chunk = s.recv(8192).decode('utf-8', errors='ignore')
            if not chunk:
                break
            out += chunk
            print(f"Read chunk ({len(chunk)} bytes)... current end: {repr(out[-30:])}")
            if "spine-01" in chunk and "#" in chunk:
                print("Prompt found, stopping!")
                break
    except socket.timeout:
        print("Timeout reached!")
        
    print(f"Total read: {len(out)} bytes")
    print(f"Last 200 characters of output:\n{out[-200:]}")
    s.close()

if __name__ == "__main__":
    debug_dell()

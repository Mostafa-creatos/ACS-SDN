import paramiko
import time

def test_ssh():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print("Connecting to spine-02 via SSH...")
        client.connect("172.20.20.13", username="admin", password="admin", port=22, timeout=5)
        channel = client.invoke_shell(width=512, height=999)
        channel.settimeout(5)
        
        # Flush
        time.sleep(1)
        if channel.recv_ready():
            channel.recv(8192)
            
        # Disable pagination
        channel.send(b"terminal length 0\n")
        time.sleep(0.5)
        if channel.recv_ready():
            channel.recv(8192)
            
        # Send command
        channel.send(b"show running-configuration\n")
        time.sleep(1.5)
        
        out = ""
        while channel.recv_ready():
            out += channel.recv(8192).decode('utf-8', errors='ignore')
            
        print("--- Output raw lines (repr) ---")
        lines = out.replace("\r", "").split("\n")
        for i in range(min(10, len(lines))):
            print(f"Line {i}: {repr(lines[i])}")
            
    finally:
        client.close()

if __name__ == "__main__":
    test_ssh()

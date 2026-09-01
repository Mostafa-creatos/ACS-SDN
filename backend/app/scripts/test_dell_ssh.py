import paramiko

def test_ssh(ip):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            ip, 
            username='admin', 
            password='admin', 
            timeout=10, 
            look_for_keys=False, 
            allow_agent=False,
            disabled_algorithms={'pubkeys': []}
        )
        stdin, stdout, stderr = client.exec_command('show version')
        output = stdout.read().decode('utf-8', errors='ignore')
        print(f"--- SSH SUCCESS TO {ip} ---")
        print(output[:300])
        client.close()
    except Exception as e:
        print(f"--- SSH FAILED TO {ip}: {e} ---")

if __name__ == "__main__":
    test_ssh("172.20.20.12")
    test_ssh("172.20.20.13")

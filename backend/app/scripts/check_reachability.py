import socket

for ip in ["172.20.20.10", "172.20.20.11", "172.20.20.12", "172.20.20.13", "172.20.20.14", "172.20.20.15"]:
    s_ssh = socket.socket()
    s_ssh.settimeout(2)
    res_ssh = s_ssh.connect_ex((ip, 22))
    s_ssh.close()
    
    s_cons = socket.socket()
    s_cons.settimeout(2)
    res_cons = s_cons.connect_ex((ip, 5000))
    s_cons.close()
    
    print(f"IP {ip} -> Port 22 (SSH): {'OPEN' if res_ssh==0 else 'CLOSED'}, Port 5000 (Console): {'OPEN' if res_cons==0 else 'CLOSED'}")

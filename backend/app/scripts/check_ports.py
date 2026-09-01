import socket

for ip in ["172.20.20.12", "172.20.20.13"]:
    for port in [5000, 22]:
        s = socket.socket()
        s.settimeout(2)
        res = s.connect_ex((ip, port))
        s.close()
        print(f"{ip}:{port} -> {'OPEN' if res == 0 else 'CLOSED'}")

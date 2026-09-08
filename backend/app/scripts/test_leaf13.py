import socket
s = socket.socket()
s.settimeout(5)
res = s.connect_ex(("128.105.145.2", 30013))
print("Port 30013 status:", res)
s.close()

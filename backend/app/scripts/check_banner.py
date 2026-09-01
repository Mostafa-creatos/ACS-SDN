import socket

s = socket.socket()
s.settimeout(3)
s.connect(("172.20.20.12", 22))
banner = s.recv(128)
print("Banner from 172.20.20.12:22 ->", repr(banner))
s.close()

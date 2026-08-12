import urllib.request
import urllib.parse
import json

data = json.dumps({'username': 'platform_admin', 'password': 'password'}).encode()
req = urllib.request.Request('http://localhost:8080/api/v5/auth/login', data=data, headers={'Content-Type': 'application/json'})
try:
    response = urllib.request.urlopen(req)
    token = json.loads(response.read())['access_token']
    print("Got token!")
    
    req2 = urllib.request.Request('http://localhost:8080/api/v5/users')
    req2.add_header('Authorization', 'Bearer ' + token)
    res2 = urllib.request.urlopen(req2)
    print("Users:", res2.read().decode())
except Exception as e:
    print("Error:", e)
    if hasattr(e, 'read'):
        print(e.read().decode())

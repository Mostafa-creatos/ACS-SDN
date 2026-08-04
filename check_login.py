import subprocess

script = r'''
import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Try common passwords
for pwd in ["admin", "Admin@123", "admin_password_123!", "password"]:
    data = json.dumps({"username": "admin", "password": pwd}).encode()
    req = urllib.request.Request("https://localhost:8000/api/v5/auth/login", data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        resp = urllib.request.urlopen(req, context=ctx)
        result = json.loads(resp.read().decode())
        print("LOGIN OK with password:", pwd)
        print("Full response keys:", list(result.keys()))
        print("User:", json.dumps(result.get("user", {}), indent=2))
        token = result.get("access_token", "")
        break
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print("FAIL:", pwd, "->", e.code, body[:200])
'''

with open("/tmp/test_sdn2.py", "w") as f:
    f.write(script)

subprocess.run(["scp", "-i", "C:\\Users\\mosta\\.ssh\\id_rsa", "-o", "StrictHostKeyChecking=no", "/tmp/test_sdn2.py", "alkhairplateforme@34.32.194.240:/tmp/test_sdn2.py"], capture_output=True)
result = subprocess.run(["ssh", "-i", "C:\\Users\\mosta\\.ssh\\id_rsa", "-o", "StrictHostKeyChecking=no", "alkhairplateforme@34.32.194.240", "python3 /tmp/test_sdn2.py"], capture_output=True, text=True)
print(result.stdout)
print(result.stderr)

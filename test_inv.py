import subprocess

script = r'''
import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

data = json.dumps({"username": "admin", "password": "admin_password_123!"}).encode()
req = urllib.request.Request("https://localhost:8000/api/v5/auth/login", data=data, headers={"Content-Type": "application/json"}, method="POST")
resp = urllib.request.urlopen(req, context=ctx)
result = json.loads(resp.read().decode())
token = result["access_token"]

print("=== TEST: visibility/inventory (full response keys) ===")
req2 = urllib.request.Request("https://localhost:8000/api/v5/visibility/inventory", headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
resp2 = urllib.request.urlopen(req2, context=ctx)
inv = json.loads(resp2.read().decode())
print("Response keys:", list(inv.keys()) if isinstance(inv, dict) else "list")
if isinstance(inv, dict):
    items = inv.get("items", inv.get("switches", []))
    print("Items count:", len(items))
    print("Total:", inv.get("total"))
    for s in items[:5]:
        print("  -", s.get("hostname"), s.get("management_ip"))
else:
    print("Count:", len(inv))
'''

with open("/tmp/test_inv.py", "w") as f:
    f.write(script)

subprocess.run(["scp", "-i", "C:\\Users\\mosta\\.ssh\\id_rsa", "-o", "StrictHostKeyChecking=no", "/tmp/test_inv.py", "alkhairplateforme@34.32.194.240:/tmp/test_inv.py"], capture_output=True)
result = subprocess.run(["ssh", "-i", "C:\\Users\\mosta\\.ssh\\id_rsa", "-o", "StrictHostKeyChecking=no", "alkhairplateforme@34.32.194.240", "python3 /tmp/test_inv.py"], capture_output=True, text=True, timeout=30)
print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr[:500])

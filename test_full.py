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

# Decode JWT to see what role/tenants are in it
import base64
payload = token.split(".")[1]
payload += "=" * (4 - len(payload) % 4)
decoded = json.loads(base64.urlsafe_b64decode(payload))
print("=== JWT PAYLOAD ===")
print(json.dumps(decoded, indent=2))

print("\n=== TEST: visibility/inventory (no X-Tenant-ID) ===")
req2 = urllib.request.Request("https://localhost:8000/api/v5/visibility/inventory", headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
try:
    resp2 = urllib.request.urlopen(req2, context=ctx)
    inv = json.loads(resp2.read().decode())
    if isinstance(inv, dict):
        switches = inv.get("switches", [])
    else:
        switches = inv
    print("Switches:", len(switches))
    for s in switches[:5]:
        print("  -", s.get("hostname"))
except urllib.error.HTTPError as e:
    print("ERROR:", e.code, e.read().decode()[:500])

print("\n=== TEST: visibility/inventory (X-Tenant-ID=AtlasWave Maroc Demo) ===")
req3 = urllib.request.Request("https://localhost:8000/api/v5/visibility/inventory", headers={"Authorization": "Bearer " + token, "X-Tenant-ID": "AtlasWave Maroc Demo", "Content-Type": "application/json"})
try:
    resp3 = urllib.request.urlopen(req3, context=ctx)
    inv = json.loads(resp3.read().decode())
    if isinstance(inv, dict):
        switches = inv.get("switches", [])
    else:
        switches = inv
    print("Switches:", len(switches))
    for s in switches[:5]:
        print("  -", s.get("hostname"))
except urllib.error.HTTPError as e:
    print("ERROR:", e.code, e.read().decode()[:500])

print("\n=== TEST: admin/stats ===")
req4 = urllib.request.Request("https://localhost:8000/api/v5/admin/stats", headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
try:
    resp4 = urllib.request.urlopen(req4, context=ctx)
    stats = json.loads(resp4.read().decode())
    print("Stats:", stats)
except urllib.error.HTTPError as e:
    print("ERROR:", e.code, e.read().decode()[:500])

print("\n=== TEST: admin/switches ===")
req5 = urllib.request.Request("https://localhost:8000/api/v5/admin/switches", headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
try:
    resp5 = urllib.request.urlopen(req5, context=ctx)
    switches = json.loads(resp5.read().decode())
    print("Switches:", len(switches))
    for s in switches[:5]:
        print("  -", s.get("hostname"))
except urllib.error.HTTPError as e:
    print("ERROR:", e.code, e.read().decode()[:500])
'''

with open("/tmp/test_full.py", "w") as f:
    f.write(script)

subprocess.run(["scp", "-i", "C:\\Users\\mosta\\.ssh\\id_rsa", "-o", "StrictHostKeyChecking=no", "/tmp/test_full.py", "alkhairplateforme@34.32.194.240:/tmp/test_full.py"], capture_output=True)
result = subprocess.run(["ssh", "-i", "C:\\Users\\mosta\\.ssh\\id_rsa", "-o", "StrictHostKeyChecking=no", "alkhairplateforme@34.32.194.240", "python3 /tmp/test_full.py"], capture_output=True, text=True, timeout=30)
print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr[:500])

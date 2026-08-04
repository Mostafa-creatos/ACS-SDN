import subprocess, json

# Write a python script to the VM and execute it
script = '''
import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

data = json.dumps({"username": "admin", "password": "admin"}).encode()
req = urllib.request.Request("https://localhost:8000/api/v5/auth/login", data=data, headers={"Content-Type": "application/json"}, method="POST")
try:
    resp = urllib.request.urlopen(req, context=ctx)
    result = json.loads(resp.read().decode())
    print("LOGIN OK")
    print("Role:", result.get("user", {}).get("role"))
    print("Tenant:", result.get("user", {}).get("tenant_id"))
    print("Token length:", len(result.get("access_token", "")))
    token = result["access_token"]
    
    # Test inventory
    req2 = urllib.request.Request("https://localhost:8000/api/v5/visibility/inventory", headers={"Authorization": "Bearer " + token, "X-Tenant-ID": result.get("user", {}).get("tenant_id", ""), "Content-Type": "application/json"})
    resp2 = urllib.request.urlopen(req2, context=ctx)
    inv = json.loads(resp2.read().decode())
    print("Inventory switches:", len(inv.get("switches", [])) if isinstance(inv, dict) else len(inv))
    if isinstance(inv, dict):
        for s in inv.get("switches", [])[:3]:
            print("  -", s.get("hostname"), s.get("management_ip"))
    else:
        for s in inv[:3]:
            print("  -", s.get("hostname"), s.get("management_ip"))
    
    # Test admin stats
    req3 = urllib.request.Request("https://localhost:8000/api/v5/admin/stats", headers={"Authorization": "Bearer " + token, "X-Tenant-ID": result.get("user", {}).get("tenant_id", ""), "Content-Type": "application/json"})
    resp3 = urllib.request.urlopen(req3, context=ctx)
    stats = json.loads(resp3.read().decode())
    print("Admin stats:", stats)
    
    # Test admin switches
    req4 = urllib.request.Request("https://localhost:8000/api/v5/admin/switches", headers={"Authorization": "Bearer " + token, "X-Tenant-ID": result.get("user", {}).get("tenant_id", ""), "Content-Type": "application/json"})
    resp4 = urllib.request.urlopen(req4, context=ctx)
    switches = json.loads(resp4.read().decode())
    print("Admin switches count:", len(switches))
    for s in switches[:3]:
        print("  -", s.get("hostname"), s.get("management_ip"))

except urllib.error.HTTPError as e:
    body = e.read().decode()
    print("ERROR:", e.code, body[:500])
'''

with open("/tmp/test_sdn.py", "w") as f:
    f.write(script)

result = subprocess.run(["scp", "-i", "C:\\Users\\mosta\\.ssh\\id_rsa", "-o", "StrictHostKeyChecking=no", "/tmp/test_sdn.py", "alkhairplateforme@34.32.194.240:/tmp/test_sdn.py"], capture_output=True, text=True)
print("SCP:", result.returncode)

result2 = subprocess.run(["ssh", "-i", "C:\\Users\\mosta\\.ssh\\id_rsa", "-o", "StrictHostKeyChecking=no", "alkhairplateforme@34.32.194.240", "python3 /tmp/test_sdn.py"], capture_output=True, text=True)
print(result2.stdout)
print(result2.stderr)

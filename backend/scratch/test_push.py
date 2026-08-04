import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# 1. Login
data = json.dumps({"username": "admin", "password": "admin_password_123!"}).encode()
req = urllib.request.Request("https://localhost:8000/api/v5/auth/login", data=data, headers={"Content-Type": "application/json"}, method="POST")
resp = urllib.request.urlopen(req, context=ctx)
result = json.loads(resp.read().decode())
token = result["access_token"]
print("Token obtained successfully.")

# 2. Get switches
req2 = urllib.request.Request("https://localhost:8000/api/v5/admin/switches", headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
resp2 = urllib.request.urlopen(req2, context=ctx)
switches = json.loads(resp2.read().decode())
print(f"Switches count: {len(switches)}")
if not switches:
    print("No switches found!")
    exit(1)

# Pick first switch
switch_id = switches[0]["switch_id"]
hostname = switches[0]["hostname"]
vendor = switches[0]["vendor"]
print(f"Targeting switch: {hostname} ({switch_id}) [{vendor}]")

# 3. Dry-run push
push_payload = json.dumps({
    "switch_ids": [switch_id],
    "config_payload": "interface loopback 99\n description test",
    "dry_run": True
}).encode()
req3 = urllib.request.Request("https://localhost:8000/api/v5/switch-config/push", data=push_payload, headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"}, method="POST")
try:
    resp3 = urllib.request.urlopen(req3, context=ctx)
    res_data = json.loads(resp3.read().decode())
    print("SUCCESS RESPONSE:")
    print(json.dumps(res_data, indent=2))
except urllib.error.HTTPError as e:
    print(f"HTTP ERROR {e.code}:")
    print(e.read().decode())

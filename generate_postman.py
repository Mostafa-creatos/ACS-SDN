import os
import re
import json

app_dir = r"c:\Users\mosta\OneDrive\Desktop\Antigravity\SDN-Front-End\backend\app"
endpoints = []
seen_endpoints = set()

for root, _, files in os.walk(app_dir):
    for file in files:
        if file.endswith('.py'):
            with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                content = f.read()
                
                # Detect APIRouter prefix
                prefix = ""
                # matches either: router = APIRouter(prefix="/api/v5/users", ...) or prefix="/api/v5/discovery"
                prefix_match = re.search(r'APIRouter\([^)]*prefix=["\']([^"\']+)["\']', content, re.DOTALL)
                if prefix_match:
                    prefix = prefix_match.group(1)
                
                # Capture routes even if they have extra decorator parameters (like response_model or status_code)
                matches = re.findall(r'@(?:app|router)\.(get|post|put|delete|patch)\("([^"]+)"[^)]*\)', content)
                for method, path in matches:
                    # Clean up path
                    path = path.split('"')[0].split("'")[0] # Clean up any leftovers
                    path = path.replace("'", "").replace('"', '')
                    
                    # Prepend prefix if it exists and path doesn't already start with it
                    full_path = path
                    if prefix and not path.startswith(prefix):
                        full_path = (prefix.rstrip('/') + '/' + path.lstrip('/')).replace('//', '/')
                        
                    # Ensure path starts with /
                    if not full_path.startswith('/'):
                        full_path = '/' + full_path
                        
                    ep_key = (method.upper(), full_path)
                    if ep_key not in seen_endpoints:
                        seen_endpoints.add(ep_key)
                        endpoints.append({
                            "name": f"{method.upper()} {full_path}",
                            "method": method.upper(),
                            "url": f"{{{{base_url}}}}{full_path}"
                        })

collection = {
    "info": {
        "name": "SDN Controller API",
        "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    "variable": [
        {"key": "base_url", "value": "http://127.0.0.1:8000"},
        {"key": "token", "value": ""}
    ],
    "item": []
}

# Group into folders based on first path segment after /api/v5/
folders = {}
for ep in endpoints:
    url_cleaned = ep['url'].replace("{{base_url}}/", "")
    url_cleaned = url_cleaned.replace("api/v5/", "")
    parts = url_cleaned.split('/')
    folder_name = parts[0].capitalize() if parts and parts[0] else "Other"
    
    if folder_name not in folders:
        folders[folder_name] = []
        
    req = {
        "name": ep['name'],
        "request": {
            "method": ep['method'],
            "header": [
                {"key": "Authorization", "value": "Bearer {{token}}", "type": "text"}
            ],
            "url": {
                "raw": ep['url'],
                "host": ["{{base_url}}"],
                "path": [p for p in ep['url'].replace("{{base_url}}/", "").split('/')]
            }
        }
    }
    folders[folder_name].append(req)

for folder, items in folders.items():
    collection["item"].append({
        "name": folder,
        "item": items
    })

with open("SDN_Postman_Collection.json", "w", encoding="utf-8") as f:
    json.dump(collection, f, indent=4)

with open("testing_tasks.md", "w", encoding="utf-8") as f:
    f.write("# API Endpoint Testing Tracker\n\n")
    for folder, items in folders.items():
        f.write(f"## {folder}\n")
        for item in items:
            f.write(f"- [ ] {item['name']}\n")

print("Generated SDN_Postman_Collection.json and testing_tasks.md")

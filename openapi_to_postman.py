import json

with open("openapi.json", "r", encoding="utf-16le") as f:
    text = f.read()

# Find the first '{' to ignore any warnings printed before the JSON
start_idx = text.find('{')
if start_idx != -1:
    text = text[start_idx:]

openapi = json.loads(text)

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

folders = {}

for path, methods in openapi.get("paths", {}).items():
    for method, details in methods.items():
        if method.lower() not in ["get", "post", "put", "delete", "patch"]:
            continue
            
        tags = details.get("tags", ["Other"])
        folder_name = tags[0].capitalize()
        
        if folder_name not in folders:
            folders[folder_name] = []
            
        req = {
            "name": f"{method.upper()} {path}",
            "request": {
                "method": method.upper(),
                "header": [
                    {"key": "Authorization", "value": "Bearer {{token}}", "type": "text"}
                ],
                "url": {
                    "raw": f"{{{{base_url}}}}{path}",
                    "host": ["{{base_url}}"],
                    "path": [p for p in path.strip("/").split('/')]
                }
            }
        }
        
        # If this is the login route, add the body
        if path == "/api/v5/auth/login" and method.lower() == "post":
            req["request"]["body"] = {
                "mode": "urlencoded",
                "urlencoded": [
                    {"key": "username", "value": "platform_admin", "type": "text"},
                    {"key": "password", "value": "password", "type": "text"}
                ]
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

print("Generated SDN_Postman_Collection.json and testing_tasks.md from OpenAPI!")

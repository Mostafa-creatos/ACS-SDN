import urllib.request
import json
import sys
import time
import ssl

URL = "https://localhost:8000/api/v5/discovery/on-boarding-ingestion"

switches = [
    # Fabric 1
    {
        "mac_address": "aa:c1:ab:00:00:01",
        "serial_number": "SN-NOKIA-SPINE1",
        "os_version": "23.10.1",
        "vendor": "nokia",
        "management_ip": "172.20.20.10"
    },
    {
        "mac_address": "aa:c1:ab:00:00:02",
        "serial_number": "SN-NOKIA-LEAF1",
        "os_version": "23.10.1",
        "vendor": "nokia",
        "management_ip": "172.20.20.11"
    },
    {
        "mac_address": "90:b1:1c:f4:a5:02",
        "serial_number": "SN-DELL-LEAF2",
        "os_version": "10.5.2.0",
        "vendor": "dell_os10",
        "management_ip": "172.20.20.12"
    },
    # Fabric 2
    {
        "mac_address": "90:b1:1c:f4:a5:03",
        "serial_number": "SN-DELL-SPINE2",
        "os_version": "10.5.2.0",
        "vendor": "dell_os10",
        "management_ip": "172.20.20.13"
    },
    {
        "mac_address": "aa:c1:ab:00:00:03",
        "serial_number": "SN-NOKIA-LEAF3",
        "os_version": "23.10.1",
        "vendor": "nokia",
        "management_ip": "172.20.20.14"
    },
    {
        "mac_address": "aa:c1:ab:00:00:04",
        "serial_number": "SN-NOKIA-LEAF4",
        "os_version": "23.10.1",
        "vendor": "nokia",
        "management_ip": "172.20.20.15"
    }
]

def trigger():
    print(f"Triggering ZTP ingestion for {len(switches)} switches against {URL}...")
    for sw in switches:
        data = json.dumps(sw).encode("utf-8")
        req = urllib.request.Request(
            URL,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            context = ssl._create_unverified_context()
            with urllib.request.urlopen(req, timeout=10, context=context) as response:
                if response.status == 202 or response.status == 200:
                    print(f"  [+] Success: {sw['serial_number']} ({sw['management_ip']})")
                else:
                    print(f"  [-] Failed: {sw['serial_number']} - HTTP {response.status}")
        except Exception as e:
            print(f"  [-] Error triggering {sw['serial_number']}: {e}")
        time.sleep(0.5)

if __name__ == "__main__":
    trigger()

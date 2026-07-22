#!/usr/bin/env python3
"""
DELL SMARTFABRIC OS10 ONIE PLATFORM AUTOMATED BOOTSTRAP INITIALIZATION ENGINE SCRIPT
Executed via custom DHCP Option 67 routing loops on bare-metal switch fabric bring-up sequences.
"""
import sys
import json
import urllib.request
import subprocess

CONTROLLER_VIP_CLUSTER = "localhost:8000"  # Configured for local development validation
INGESTION_ENDPOINT_URL = f"http://{CONTROLLER_VIP_CLUSTER}/api/v5/discovery/on-boarding-ingestion"

def query_chassis_shell_primitive(command: str) -> str:
    try:
        execution_output = subprocess.check_output(command, shell=True, stderr=subprocess.DEVNULL)
        return execution_output.decode('utf-8').strip()
    except Exception:
        return "ERROR_EXTRACTING_FIELD_METADATA"

def compile_chassis_identity_payload() -> dict:
    # Query system components using native Linux/ONIE primitives
    serial_token = query_chassis_shell_primitive("dmidecode -s system-serial-number")
    model_token = query_chassis_shell_primitive("dmidecode -s system-product-name")
    mac_address_raw = query_chassis_shell_primitive("cat /sys/class/net/eth0/address")
    operating_sys_ver = query_chassis_shell_primitive("clish -c 'show version' | grep 'OS Version' | awk '{print $3}'")

    # Fallbacks for running in test simulation environments (outside bare-metal hardware)
    return {
        "serial_number": serial_token if serial_token != "ERROR_EXTRACTING_FIELD_METADATA" else "MOCK-SER-12345",
        "mac_address": mac_address_raw if mac_address_raw != "ERROR_EXTRACTING_FIELD_METADATA" else "aa:bb:cc:dd:ee:ff",
        "hardware_vendor": "dell_os10",
        "hardware_model": model_token if model_token != "ERROR_EXTRACTING_FIELD_METADATA" else "S5248F-ON",
        "base_os_version": operating_sys_ver if operating_sys_ver != "ERROR_EXTRACTING_FIELD_METADATA" else "10.5.2.0"
    }

def phone_home_to_management_plane():
    payload_data = compile_chassis_identity_payload()
    serialized_payload = json.dumps(payload_data).encode('utf-8')
    
    api_request_pipeline = urllib.request.Request(
        INGESTION_ENDPOINT_URL, 
        data=serialized_payload, 
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(api_request_pipeline, timeout=10) as client_response:
            if client_response.status == 202:
                print("ZTP Discovery Phase 1 Completed: Identity packet delivered successfully.")
                sys.exit(0)
    except Exception as network_exception:
        print(f"ZTP Registration Fail Sequence Context: {str(network_exception)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    phone_home_to_management_plane()

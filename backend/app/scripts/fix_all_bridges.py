import subprocess
import re

def fix_bridges():
    # Get brctl output
    out = subprocess.check_output(["sudo", "brctl", "show"]).decode('utf-8')
    print("=== CURRENT BRIDGES ===")
    print(out)

    # Attach all vunl<node_id>_0 and vunl<node_id>_10 to pnet0
    # For nodes 1 to 15
    for node_id in range(1, 16):
        for interface_idx in [0, 10]:
            tap_name = f"vunl{node_id}_{interface_idx}"
            # Check if tap interface exists in ip a
            try:
                subprocess.check_call(["ip", "link", "show", tap_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                print(f"Interface {tap_name} exists. Ensuring attached to pnet0...")
                # Remove from any vnet bridge if attached
                # Add to pnet0
                subprocess.call(f"sudo brctl addif pnet0 {tap_name} 2>/dev/null", shell=True)
            except Exception:
                pass

    print("=== UPDATED PNET0 BRIDGES ===")
    out2 = subprocess.check_output(["sudo", "brctl", "show", "pnet0"]).decode('utf-8')
    print(out2)

if __name__ == "__main__":
    fix_bridges()

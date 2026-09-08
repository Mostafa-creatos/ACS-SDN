import subprocess

def align_spine1_bridges():
    # Spine-1 leaf links mapping
    # network_id -> (Spine-1 tap, Leaf tap)
    spine1_leaf_links = {
        "vnet1_1":  ("vunl1_1", "vunl3_1"),   # DC1-Leaf-1
        "vnet1_3":  ("vunl1_2", "vunl4_1"),   # DC1-Leaf-2
        "vnet1_5":  ("vunl1_3", "vunl5_1"),   # DC1-Leaf-3
        "vnet1_7":  ("vunl1_4", "vunl6_1"),   # DC1-Leaf-4
        "vnet1_9":  ("vunl1_5", "vunl7_1"),   # DC1-Leaf-5
        "vnet1_11": ("vunl1_6", "vunl8_1"),   # DC1-Leaf-6
        "vnet1_13": ("vunl1_7", "vunl9_1"),   # DC1-Leaf-7
        "vnet1_15": ("vunl1_8", "vunl10_1"),  # DC1-Leaf-8
    }

    for bridge, (spine_tap, leaf_tap) in spine1_leaf_links.items():
        print(f"Aligning bridge {bridge} -> {spine_tap} & {leaf_tap}...")

        # Remove from old bridges
        out1 = subprocess.check_output(f"ip link show {spine_tap} 2>/dev/null | grep master | awk '{{print $9}}'", shell=True).decode('utf-8').strip()
        if out1 and out1 != bridge:
            subprocess.call(f"sudo brctl delif {out1} {spine_tap} 2>/dev/null", shell=True)

        out2 = subprocess.check_output(f"ip link show {leaf_tap} 2>/dev/null | grep master | awk '{{print $9}}'", shell=True).decode('utf-8').strip()
        if out2 and out2 != bridge:
            subprocess.call(f"sudo brctl delif {out2} {leaf_tap} 2>/dev/null", shell=True)

        # Clear bridge of any old vunlX_0 taps
        subprocess.call(f"sudo brctl addbr {bridge} 2>/dev/null", shell=True)
        subprocess.call(f"sudo ip link set dev {bridge} up 2>/dev/null", shell=True)

        # Remove vunlX_0 if present
        out_all = subprocess.check_output(f"sudo brctl show {bridge} | tail -n +2 | awk '{{print $NF}}'", shell=True).decode('utf-8').split()
        for t in out_all:
            if t.endswith("_0"):
                subprocess.call(f"sudo brctl delif {bridge} {t} 2>/dev/null", shell=True)

        subprocess.call(f"sudo brctl addif {bridge} {spine_tap} 2>/dev/null", shell=True)
        subprocess.call(f"sudo brctl addif {bridge} {leaf_tap} 2>/dev/null", shell=True)

    print("\n=== UPDATED SPINE-1 BRIDGES ===")
    for bridge in spine1_leaf_links.keys():
        print(subprocess.check_output(["sudo", "brctl", "show", bridge]).decode('utf-8'))

if __name__ == "__main__":
    align_spine1_bridges()
